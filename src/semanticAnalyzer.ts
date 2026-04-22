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
  const links: Array<{ from: string; to: string }> = [];

  for (const group of groups) {
    if (group.files.length < 2) {
      continue;
    }

    const [head, ...tail] = group.files;
    for (const file of tail.slice(0, 4)) {
      links.push({ from: head.path, to: file.path });
    }
  }

  return links;
}

export function computeGlobalConfidence(
  files: DiffFile[],
  groups: SemanticGroup[],
): number {
  const riskCount = groups.reduce((sum, g) => sum + g.riskFlags.length, 0);
  return computeConfidenceScore(files, riskCount);
}
