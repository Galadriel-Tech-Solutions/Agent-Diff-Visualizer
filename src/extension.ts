import * as vscode from "vscode";
import { getDiffFiles } from "./gitDiffService";
import { readLatestIntent } from "./logParser";
import {
  buildSemanticGroups,
  buildSummary,
  buildTopologyLinks,
  computeGlobalConfidence,
} from "./semanticAnalyzer";
import { AnalysisResult, ReviewDecision, SemanticGroup } from "./types";
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
  const rawGroups = await buildSemanticGroups(files, config);
  const storedDecisions = context.workspaceState.get<
    Record<string, ReviewDecision>
  >(DECISION_STATE_KEY, {});
  const groups = restoreDecisions(rawGroups, storedDecisions);

  return {
    groups,
    summary: buildSummary(groups),
    confidenceScore: computeGlobalConfidence(files, groups),
    topologyLinks: buildTopologyLinks(groups),
    intent: await readLatestIntent(workspaceRoot),
    generatedAt: new Date().toLocaleString(),
  };
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
          payload?: { groupId?: string; decision?: ReviewDecision };
        }) => {
          if (message.type !== "setDecision") {
            return;
          }

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
