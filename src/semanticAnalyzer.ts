import * as vscode from "vscode";
import { DiffFile, SemanticGroup } from "./types";
import { collectRiskFlags, computeConfidenceScore } from "./riskAnalyzer";

interface GroupBucket {
  key: string;
  defaultLabel: string;
  reason: string;
  files: DiffFile[];
}

function inferBucket(file: DiffFile): Omit<GroupBucket, "files"> {
  const p = file.path.toLowerCase();
  const patch = file.patch.toLowerCase();

  if (/(auth|oauth|jwt|permission|rbac|security)/.test(p + patch)) {
    return {
      key: "security",
      defaultLabel: "Security and access-control updates",
      reason: "Auth/security related paths or tokens detected",
    };
  }

  if (/(schema|migration|database|sql|prisma|typeorm)/.test(p + patch)) {
    return {
      key: "data",
      defaultLabel: "Database schema and data layer changes",
      reason: "Data-model or migration keywords found",
    };
  }

  if (/(test|spec|__tests__)/.test(p)) {
    return {
      key: "tests",
      defaultLabel: "Test coverage updates",
      reason: "Test files modified",
    };
  }

  if (/(ui|view|component|css|scss|tsx|jsx|dashboard)/.test(p + patch)) {
    return {
      key: "ui",
      defaultLabel: "UI and presentation layer adjustments",
      reason: "Frontend/view oriented changes",
    };
  }

  if (/(refactor|cleanup|rename|extract|reorganize)/.test(patch)) {
    return {
      key: "refactor",
      defaultLabel: "Refactoring and code cleanup",
      reason: "Refactoring terms detected in patch",
    };
  }

  const folder = p.split("/")[0] || "misc";
  return {
    key: `scope:${folder}`,
    defaultLabel: `Scoped updates in ${folder}`,
    reason: "Grouped by top-level module scope",
  };
}

async function suggestGroupLabelWithOllama(
  model: string,
  files: DiffFile[],
): Promise<string | null> {
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
      return null;
    }

    const data = (await response.json()) as { response?: string };
    return data.response?.trim() || null;
  } catch {
    return null;
  }
}

export async function buildSemanticGroups(
  files: DiffFile[],
  config: vscode.WorkspaceConfiguration,
): Promise<SemanticGroup[]> {
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
    if (ollamaModel) {
      const llmLabel = await suggestGroupLabelWithOllama(
        ollamaModel,
        bucket.files,
      );
      if (llmLabel) {
        label = llmLabel;
      }
    }

    groups.push({
      id: `group-${index + 1}`,
      label,
      reason: bucket.reason,
      files: bucket.files,
      totalAdditions,
      totalDeletions,
      riskFlags,
      decision: "pending",
    });
  }

  return groups;
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

export function buildTopologyLinks(
  groups: SemanticGroup[],
): Array<{ from: string; to: string }> {
  const files = groups.flatMap((g) => g.files);
  const scored: Array<{ from: string; to: string; score: number }> = [];

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

      if (score > 0) {
        scored.push({ from: a.path, to: b.path, score });
      }
    }
  }

  return scored
    .sort((x, y) => y.score - x.score)
    .slice(0, 8)
    .map((item) => ({ from: item.from, to: item.to }));
}

export function computeGlobalConfidence(
  files: DiffFile[],
  groups: SemanticGroup[],
): number {
  const riskCount = groups.reduce((sum, g) => sum + g.riskFlags.length, 0);
  return computeConfidenceScore(files, riskCount);
}
