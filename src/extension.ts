import * as vscode from "vscode";
import { getDiffFiles, restoreFilesToHead } from "./gitDiffService";
import { readLatestIntent } from "./logParser";
import {
  buildSemanticGroups,
  buildReviewSteps,
  buildSummary,
  buildTopologyLinks,
  computeGlobalConfidence,
  detectIntentDrift,
} from "./semanticAnalyzer";
import {
  AnalysisResult,
  ReviewDecision,
  ReviewStep,
  SemanticGroup,
} from "./types";
import { buildWebviewHtml, withDecision } from "./webview";

const DECISION_STATE_KEY = "adv.groupDecisions";

function groupSignature(group: SemanticGroup): string {
  const paths = group.files
    .map((f) => f.path)
    .sort()
    .join("|");
  return `${group.label}::${paths}`;
}

function restoreDecisions(
  groups: SemanticGroup[],
  decisions: Record<string, ReviewDecision>,
): SemanticGroup[] {
  return groups.map((group) => ({
    ...group,
    decision: decisions[groupSignature(group)] ?? "pending",
  }));
}

function extractDecisions(
  groups: SemanticGroup[],
): Record<string, ReviewDecision> {
  const result: Record<string, ReviewDecision> = {};
  for (const group of groups) {
    result[groupSignature(group)] = group.decision;
  }
  return result;
}

async function analyzeWorkspace(
  workspaceRoot: string,
  context: vscode.ExtensionContext,
): Promise<AnalysisResult> {
  const config = vscode.workspace.getConfiguration("adv");
  const files = await getDiffFiles(workspaceRoot);
  const intent = await readLatestIntent(workspaceRoot);
  const rawGroups = await buildSemanticGroups(files, config);
  const storedDecisions = context.workspaceState.get<
    Record<string, ReviewDecision>
  >(DECISION_STATE_KEY, {});
  const groups = restoreDecisions(rawGroups, storedDecisions);
  const intentDrift = detectIntentDrift(intent, groups);
  const steps = buildReviewSteps(groups);
  const driftPenalty = intentDrift
    ? intentDrift.severity === "high"
      ? 12
      : 6
    : 0;

  return {
    groups,
    summary: buildSummary(groups),
    confidenceScore: Math.max(
      0,
      computeGlobalConfidence(files, groups) - driftPenalty,
    ),
    topologyLinks: buildTopologyLinks(groups),
    intent,
    intentDrift,
    steps,
    generatedAt: new Date().toLocaleString(),
  };
}

function gatherFilesFromStep(steps: ReviewStep[], stepId: string): string[] {
  const index = steps.findIndex((s) => s.id === stepId);
  if (index < 0) {
    return [];
  }

  const files: string[] = [];
  for (let i = index; i < steps.length; i += 1) {
    files.push(...steps[i].filePaths);
  }

  return Array.from(new Set(files));
}

export function activate(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand(
    "adv.openReview",
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showWarningMessage(
          "ADV requires an opened workspace folder.",
        );
        return;
      }

      const workspaceRoot = workspaceFolder.uri.fsPath;

      const panel = vscode.window.createWebviewPanel(
        "advReview",
        "Agent Diff Visualizer",
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true },
      );

      let currentResult = await analyzeWorkspace(workspaceRoot, context);
      panel.webview.html = buildWebviewHtml(panel.webview, currentResult);

      const refresh = async (): Promise<void> => {
        currentResult = await analyzeWorkspace(workspaceRoot, context);
        panel.webview.html = buildWebviewHtml(panel.webview, currentResult);
      };

      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceFolder, "**/*"),
      );

      const refreshDebounced = (() => {
        let handle: NodeJS.Timeout | undefined;
        return () => {
          if (handle) {
            clearTimeout(handle);
          }
          handle = setTimeout(() => {
            refresh().catch((error) => {
              vscode.window.showErrorMessage(
                `ADV refresh failed: ${String(error)}`,
              );
            });
          }, 350);
        };
      })();

      const refreshSubscriptions = [
        watcher.onDidChange(refreshDebounced),
        watcher.onDidCreate(refreshDebounced),
        watcher.onDidDelete(refreshDebounced),
        vscode.workspace.onDidSaveTextDocument(refreshDebounced),
      ];

      panel.webview.onDidReceiveMessage(
        async (message: {
          type: string;
          payload?: {
            groupId?: string;
            decision?: ReviewDecision;
            stepId?: string;
          };
        }) => {
          if (message.type === "setDecision") {
            const groupId = message.payload?.groupId;
            const decision = message.payload?.decision;

            if (!groupId || !decision) {
              return;
            }

            currentResult = {
              ...currentResult,
              groups: withDecision(currentResult.groups, groupId, decision),
            };

            await context.workspaceState.update(
              DECISION_STATE_KEY,
              extractDecisions(currentResult.groups),
            );
            panel.webview.html = buildWebviewHtml(panel.webview, currentResult);
            return;
          }

          if (message.type === "revertFromStep") {
            const stepId = message.payload?.stepId;
            if (!stepId) {
              return;
            }

            const targetFiles = gatherFilesFromStep(
              currentResult.steps,
              stepId,
            );
            if (!targetFiles.length) {
              vscode.window.showWarningMessage(
                "No files found for selected step rollback.",
              );
              return;
            }

            try {
              await restoreFilesToHead(workspaceRoot, targetFiles);
              vscode.window.showInformationMessage(
                `Reverted ${targetFiles.length} file(s) from selected step onward.`,
              );
              await refresh();
            } catch (error) {
              vscode.window.showErrorMessage(
                `Atomic reversion failed: ${String(error)}`,
              );
            }
          }
        },
      );

      panel.onDidDispose(() => {
        watcher.dispose();
        for (const disposable of refreshSubscriptions) {
          disposable.dispose();
        }
      });
    },
  );

  context.subscriptions.push(command);
}

export function deactivate(): void {
  // No-op
}
