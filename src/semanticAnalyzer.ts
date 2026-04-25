import * as vscode from "vscode";
import {
  AgentIntent,
  DiffFile,
  IntentDriftAlert,
  OllamaStatus,
  ReviewStep,
  SemanticGroup,
  TopologyLink,
} from "./types";
import { collectRiskFlags, computeConfidenceScore } from "./riskAnalyzer";

interface GroupBucket {
  key: string;
  defaultLabel: string;
  reason: string;
  icon: string;
  files: DiffFile[];
}

function inferBucket(file: DiffFile): Omit<GroupBucket, "files"> {
  const p = file.path.toLowerCase();
  const patch = file.patch.toLowerCase();

  if (/(auth|oauth|jwt|permission|rbac|security)/.test(p + patch)) {
    return {
      key: "security",
      defaultLabel: "Task: Refactor auth and access-control logic",
      reason: "Auth/security related paths or tokens detected",
      icon: "📦",
    };
  }

  if (/(schema|migration|database|sql|prisma|typeorm)/.test(p + patch)) {
    return {
      key: "data",
      defaultLabel: "Task: Update data schema and persistence flow",
      reason: "Data-model or migration keywords found",
      icon: "🧱",
    };
  }

  if (/(test|spec|__tests__)/.test(p)) {
    return {
      key: "tests",
      defaultLabel: "Task: Extend test coverage",
      reason: "Test files modified",
      icon: "✅",
    };
  }

  if (/(ui|view|component|css|scss|tsx|jsx|dashboard)/.test(p + patch)) {
    return {
      key: "ui",
      defaultLabel: "Task: Unify UI behavior and presentation",
      reason: "Frontend/view oriented changes",
      icon: "💅",
    };
  }

  if (/(refactor|cleanup|rename|extract|reorganize)/.test(patch)) {
    return {
      key: "refactor",
      defaultLabel: "Task: Refactor code structure",
      reason: "Refactoring terms detected in patch",
      icon: "📦",
    };
  }

  const folder = p.split("/")[0] || "misc";
  return {
    key: `scope:${folder}`,
    defaultLabel: `Task: Scoped updates in ${folder}`,
    reason: "Grouped by top-level module scope",
    icon: "🧩",
  };
}

async function suggestGroupLabelWithOllama(
  model: string,
  files: DiffFile[],
): Promise<{ label: string | null; error?: string }> {
  try {
    const payload = {
      model,
      stream: false,
      prompt: [
        "Create a short semantic label for this git diff cluster.",
        "Answer with one sentence under 12 words.",
        files
          .slice(0, 5)
          .map((f) => `File: ${f.path}\nPatch:\n${f.patch.slice(0, 1500)}`)
          .join("\n\n"),
      ].join("\n\n"),
    };

    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        label: null,
        error: `HTTP ${response.status} from Ollama generate API`,
      };
    }

    const data = (await response.json()) as { response?: string };
    return { label: data.response?.trim() || null };
  } catch (error) {
    return {
      label: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function testOllamaConnection(
  model: string,
): Promise<{ ok: boolean; message: string }> {
  const trimmedModel = model.trim();
  if (!trimmedModel) {
    return { ok: false, message: "No Ollama model configured." };
  }

  try {
    const tagsResponse = await fetch("http://127.0.0.1:11434/api/tags");
    if (!tagsResponse.ok) {
      return {
        ok: false,
        message: `Ollama tags API returned HTTP ${tagsResponse.status}.`,
      };
    }

    const tagsData = (await tagsResponse.json()) as {
      models?: Array<{ name?: string }>;
    };
    const knownModels = (tagsData.models ?? [])
      .map((entry) => entry.name?.trim())
      .filter((name): name is string => Boolean(name));

    if (!knownModels.includes(trimmedModel)) {
      return {
        ok: false,
        message:
          `Model \"${trimmedModel}\" is not installed in Ollama.` +
          (knownModels.length
            ? ` Available models: ${knownModels.join(", ")}`
            : " No local models were reported."),
      };
    }

    const generateResponse = await fetch(
      "http://127.0.0.1:11434/api/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: trimmedModel,
          stream: false,
          prompt: "Reply with exactly: ADV test ok",
        }),
      },
    );

    if (!generateResponse.ok) {
      return {
        ok: false,
        message: `Ollama generate API returned HTTP ${generateResponse.status}.`,
      };
    }

    const generateData = (await generateResponse.json()) as {
      response?: string;
    };
    const responseText = generateData.response?.trim() || "(empty response)";
    return {
      ok: true,
      message: `Connected to Ollama model \"${trimmedModel}\". Sample response: ${responseText}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function buildSemanticGroups(
  files: DiffFile[],
  config: vscode.WorkspaceConfiguration,
): Promise<{ groups: SemanticGroup[]; ollamaStatus: OllamaStatus }> {
  const buckets = new Map<string, GroupBucket>();

  for (const file of files) {
    const inferred = inferBucket(file);
    const existing = buckets.get(inferred.key);
    if (existing) {
      existing.files.push(file);
    } else {
      buckets.set(inferred.key, {
        ...inferred,
        files: [file],
      });
    }
  }

  const maxGroups = Math.max(
    3,
    Math.min(20, config.get<number>("maxGroups", 8)),
  );
  const sortedBuckets = Array.from(buckets.values())
    .sort((a, b) => {
      const aSize = a.files.reduce(
        (sum, f) => sum + f.additions + f.deletions,
        0,
      );
      const bSize = b.files.reduce(
        (sum, f) => sum + f.additions + f.deletions,
        0,
      );
      return bSize - aSize;
    })
    .slice(0, maxGroups);

  const ollamaModel = config.get<string>("ollamaModel", "").trim();
  const groups: SemanticGroup[] = [];
  const ollamaStatus: OllamaStatus = {
    configuredModel: ollamaModel,
    enabled: Boolean(ollamaModel),
    reachable: !ollamaModel,
    usedForGroups: 0,
    fallbackGroups: 0,
  };

  for (const [index, bucket] of sortedBuckets.entries()) {
    const totalAdditions = bucket.files.reduce(
      (sum, f) => sum + f.additions,
      0,
    );
    const totalDeletions = bucket.files.reduce(
      (sum, f) => sum + f.deletions,
      0,
    );
    const riskFlags = collectRiskFlags(bucket.files);

    let label = bucket.defaultLabel;
    let labelSource: SemanticGroup["labelSource"] = "heuristic";
    if (ollamaModel) {
      const ollamaResult = await suggestGroupLabelWithOllama(
        ollamaModel,
        bucket.files,
      );
      if (ollamaResult.label) {
        label = ollamaResult.label;
        labelSource = "ollama";
        ollamaStatus.reachable = true;
        ollamaStatus.usedForGroups += 1;
      } else {
        ollamaStatus.fallbackGroups += 1;
        if (ollamaResult.error) {
          ollamaStatus.reachable = false;
          ollamaStatus.lastError = ollamaResult.error;
        }
      }
    }

    groups.push({
      id: `group-${index + 1}`,
      label: `${bucket.icon} ${label}`,
      reason: bucket.reason,
      files: bucket.files,
      totalAdditions,
      totalDeletions,
      riskFlags,
      decision: "pending",
      labelSource,
    });
  }

  return { groups, ollamaStatus };
}

export function buildSummary(groups: SemanticGroup[]): string {
  if (groups.length === 0) {
    return "No uncommitted changes detected.";
  }

  const highRisk = groups.filter((g) => g.riskFlags.length > 0).length;
  const touchedFiles = groups.reduce((sum, g) => sum + g.files.length, 0);
  const totalChurn = groups.reduce(
    (sum, g) => sum + g.totalAdditions + g.totalDeletions,
    0,
  );

  return (
    `Detected ${touchedFiles} modified files across ${groups.length} semantic groups. ` +
    `${highRisk} group(s) have high-risk indicators. Total churn is ${totalChurn} lines.`
  );
}

export function buildTopologyLinks(groups: SemanticGroup[]): TopologyLink[] {
  const files = groups.flatMap((g) => g.files);
  const scored: Array<TopologyLink & { score: number }> = [];

  for (let i = 0; i < files.length; i += 1) {
    for (let j = i + 1; j < files.length; j += 1) {
      const a = files[i];
      const b = files[j];

      const aDir = a.path.split("/").slice(0, -1).join("/");
      const bDir = b.path.split("/").slice(0, -1).join("/");
      const aName = a.path.split("/").at(-1) || a.path;
      const bName = b.path.split("/").at(-1) || b.path;
      const aStem = aName.split(".")[0];
      const bStem = bName.split(".")[0];
      const aLower = a.path.toLowerCase();
      const bLower = b.path.toLowerCase();

      let score = 0;
      if (aDir && bDir && (aDir.startsWith(bDir) || bDir.startsWith(aDir))) {
        score += 2;
      }

      if (aStem && bStem && (aStem.includes(bStem) || bStem.includes(aStem))) {
        score += 1;
      }

      if (a.patch.includes(bName) || a.patch.includes(bStem)) {
        score += 3;
      }

      if (b.patch.includes(aName) || b.patch.includes(aStem)) {
        score += 3;
      }

      const mutualReference =
        (a.patch.includes(bName) || a.patch.includes(bStem)) &&
        (b.patch.includes(aName) || b.patch.includes(aStem));
      const serviceUiViolation =
        (aLower.includes("service") && /(component|view|ui)/.test(bLower)) ||
        (bLower.includes("service") && /(component|view|ui)/.test(aLower));

      if (mutualReference || serviceUiViolation) {
        score += 3;
      }

      if (score > 0) {
        const relation: TopologyLink["relation"] =
          mutualReference || serviceUiViolation ? "smell" : "impact";
        const style: TopologyLink["style"] =
          relation === "smell" ? "dashed" : "solid";
        const reason = mutualReference
          ? "Potential circular dependency"
          : serviceUiViolation
            ? "Potential layer boundary violation"
            : "Downstream consumer impact";

        scored.push({
          from: a.path,
          to: b.path,
          score,
          relation,
          reason,
          style,
        });
      }
    }
  }

  return scored
    .sort((x, y) => y.score - x.score)
    .slice(0, 8)
    .map((item) => ({
      from: item.from,
      to: item.to,
      relation: item.relation,
      reason: item.reason,
      style: item.style,
    }));
}

function inferPromptScope(prompt: string): {
  allowSecurity: boolean;
  allowDatabase: boolean;
  allowUi: boolean;
} {
  const normalized = prompt.toLowerCase();
  return {
    allowSecurity: /(auth|security|oauth|permission|rbac|token)/.test(
      normalized,
    ),
    allowDatabase: /(db|database|schema|migration|sql|prisma|typeorm)/.test(
      normalized,
    ),
    allowUi: /(ui|component|style|css|layout|view|frontend)/.test(normalized),
  };
}

export function detectIntentDrift(
  intent: AgentIntent | null,
  groups: SemanticGroup[],
): IntentDriftAlert | null {
  if (!intent) {
    return null;
  }

  const scope = inferPromptScope(intent.prompt);
  const outOfScopeFiles = new Set<string>();
  const evidence: string[] = [];

  for (const group of groups) {
    for (const file of group.files) {
      const filePath = file.path.toLowerCase();
      if (
        !scope.allowSecurity &&
        /(auth|security|permission|rbac|oauth)/.test(filePath)
      ) {
        outOfScopeFiles.add(file.path);
      }
      if (
        !scope.allowDatabase &&
        /(schema|migration|database|sql|prisma|typeorm)/.test(filePath)
      ) {
        outOfScopeFiles.add(file.path);
      }
      if (
        !scope.allowUi &&
        /(component|ui|view|css|scss|tsx|jsx)/.test(filePath)
      ) {
        outOfScopeFiles.add(file.path);
      }
    }
  }

  if (!outOfScopeFiles.size) {
    return null;
  }

  evidence.push(`Prompt: ${intent.prompt.slice(0, 180)}`);
  evidence.push(
    `Out-of-scope files: ${Array.from(outOfScopeFiles).slice(0, 4).join(", ")}`,
  );

  return {
    severity: outOfScopeFiles.size >= 2 ? "high" : "medium",
    title: "Intent Drift Warning",
    message:
      "Detected changes outside prompt scope. Review sensitive or unrelated files before approving.",
    evidence,
    affectedFiles: Array.from(outOfScopeFiles),
  };
}

export function buildReviewSteps(groups: SemanticGroup[]): ReviewStep[] {
  return groups.map((group, index) => {
    const riskCount = group.riskFlags.length;
    return {
      id: `step-${index + 1}`,
      title: `Step ${index + 1}`,
      description: group.label,
      groupIds: [group.id],
      filePaths: group.files.map((f) => f.path),
      riskCount,
    };
  });
}

export function computeGlobalConfidence(
  files: DiffFile[],
  groups: SemanticGroup[],
): number {
  const riskCount = groups.reduce((sum, g) => sum + g.riskFlags.length, 0);
  return computeConfidenceScore(files, riskCount);
}
