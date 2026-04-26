import * as vscode from "vscode";
import { getDiffFiles, restoreFilesToHead } from "./gitDiffService";
import { readLatestIntent, setChatIntent, clearChatIntent } from "./logParser";
import {
  buildSemanticGroups,
  buildReviewSteps,
  buildSummary,
  buildTopologyLinks,
  computeGlobalConfidence,
  detectIntentDrift,
  testOllamaConnection,
} from "./semanticAnalyzer";
import {
  AnalysisResult,
  ReviewDecision,
  ReviewStep,
  SemanticGroup,
} from "./types";
import {
  buildLoadingWebviewHtml,
  buildWebviewHtml,
  withDecision,
} from "./webview";

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
  onProgress?: (title: string, detail: string) => void,
): Promise<AnalysisResult> {
  const config = vscode.workspace.getConfiguration("adv");
  onProgress?.(
    "Analyzing Repository",
    "Collecting committed, staged, working-tree, and untracked changes...",
  );
  const files = await getDiffFiles(workspaceRoot);

  onProgress?.(
    "Reading Intent",
    "Loading latest intent from @adv chat and available agent logs...",
  );
  const intent = await readLatestIntent(workspaceRoot);

  onProgress?.(
    "Building Semantic Groups",
    "Classifying files into review groups and generating labels...",
  );
  const { groups: rawGroups, ollamaStatus } = await buildSemanticGroups(
    files,
    config,
  );
  const storedDecisions = context.workspaceState.get<
    Record<string, ReviewDecision>
  >(DECISION_STATE_KEY, {});
  const groups = restoreDecisions(rawGroups, storedDecisions);

  onProgress?.(
    "Computing Review Signals",
    "Calculating intent drift, topology links, and atomic reversion steps...",
  );
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
    ollamaStatus,
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
  let reviewPanel: vscode.WebviewPanel | undefined;
  let disposeRefreshInfra: (() => void) | undefined;
  let refreshOpenReviewPanel: (() => Promise<void>) | undefined;

  // Register @adv Copilot Chat participant
  const participant = vscode.chat.createChatParticipant(
    "adv",
    async (
      request: vscode.ChatRequest,
      _context: vscode.ChatContext,
      stream: vscode.ChatResponseStream,
    ) => {
      const prompt = request.prompt.trim();
      const normalizedPrompt = prompt.toLowerCase();
      const isClearCommand =
        request.command === "clear" || normalizedPrompt === "/clear";
      const isReviewCommand =
        request.command === "review" || normalizedPrompt === "/review";

      if (isClearCommand) {
        clearChatIntent();
        stream.markdown(
          "Intent cleared. The next `@adv` message will set a new intent.",
        );
        return;
      }

      if (isReviewCommand) {
        await vscode.commands.executeCommand("adv.openReview");
        stream.markdown("Opened Agent Diff Visualizer review panel.");
        return;
      }

      if (!prompt) {
        stream.markdown(
          "Describe your coding intent and I'll map it against your uncommitted changes.\n\n" +
            "**Example:** `@adv Refactor auth module to use JWT instead of sessions`\n\n" +
            "Use `/review` to open the diff review panel immediately after describing your intent.",
        );
        return;
      }

      setChatIntent({
        prompt,
        thinking: "(captured via @adv Copilot Chat participant)",
        source: "Copilot Chat (@adv)",
        timestamp: new Date().toISOString(),
      });

      if (refreshOpenReviewPanel) {
        void refreshOpenReviewPanel();
      }

      stream.markdown(
        `**Intent captured:** "${prompt}"\n\n` +
          "Agent Diff Visualizer will use this to detect drift in your uncommitted changes. " +
          "Run **ADV: Open Agent Diff Review** or use `/review` to see the analysis.",
      );
    },
  );

  context.subscriptions.push(participant);

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

      if (reviewPanel) {
        reviewPanel.reveal(vscode.ViewColumn.Beside);
        if (refreshOpenReviewPanel) {
          await refreshOpenReviewPanel();
        }
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        "advReview",
        "Agent Diff Visualizer",
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      reviewPanel = panel;

      const setLoadingState = (title: string, detail: string): void => {
        panel.webview.html = buildLoadingWebviewHtml(
          panel.webview,
          title,
          detail,
        );
      };

      setLoadingState(
        "Opening Agent Diff Visualizer",
        "Preparing analysis workspace...",
      );

      let currentResult = await analyzeWorkspace(
        workspaceRoot,
        context,
        setLoadingState,
      );
      panel.webview.html = buildWebviewHtml(panel.webview, currentResult);

      const refresh = async (): Promise<void> => {
        setLoadingState(
          "Refreshing Analysis",
          "Change detected. Recomputing semantic groups and risk signals...",
        );

        currentResult = await analyzeWorkspace(
          workspaceRoot,
          context,
          setLoadingState,
        );
        panel.webview.html = buildWebviewHtml(panel.webview, currentResult);
      };
      refreshOpenReviewPanel = refresh;

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
      disposeRefreshInfra = () => {
        watcher.dispose();
        for (const disposable of refreshSubscriptions) {
          disposable.dispose();
        }
      };

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
        disposeRefreshInfra?.();
        disposeRefreshInfra = undefined;
        refreshOpenReviewPanel = undefined;
        reviewPanel = undefined;
      });
    },
  );

  const testOllamaCommand = vscode.commands.registerCommand(
    "adv.testOllamaConnection",
    async () => {
      const model = vscode.workspace
        .getConfiguration("adv")
        .get<string>("ollamaModel", "")
        .trim();

      const result = await testOllamaConnection(model);
      if (result.ok) {
        vscode.window.showInformationMessage(result.message);
        return;
      }

      vscode.window.showWarningMessage(result.message);
    },
  );

  context.subscriptions.push(command, testOllamaCommand);
}

export function deactivate(): void {
  // No-op
}
