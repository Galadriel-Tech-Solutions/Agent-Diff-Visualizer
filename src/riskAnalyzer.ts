import { DiffFile } from "./types";

const sensitivePathPattern =
  /(auth|security|database_schema|migrations?|permissions?|rbac|policy)/i;
const secretPattern =
  /(api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*["'][^"']+["']/i;

export function collectRiskFlags(files: DiffFile[]): string[] {
  const flags = new Set<string>();

  for (const file of files) {
    if (sensitivePathPattern.test(file.path)) {
      flags.add("Sensitive path touched");
    }

    if (secretPattern.test(file.patch)) {
      flags.add("Potential hardcoded secret");
    }

    const complexityDelta = file.afterComplexity - file.beforeComplexity;
    if (complexityDelta >= 8) {
      flags.add("Complexity spike detected");
    }

    if (file.additions + file.deletions >= 300) {
      flags.add("Large churn in single file");
    }
  }

  return Array.from(flags);
}

export function computeConfidenceScore(
  files: DiffFile[],
  riskCount: number,
): number {
  const touchedTests = files.filter((f) =>
    /(test|spec)\./i.test(f.path),
  ).length;
  const touchedCode = files.filter(
    (f) => !/(test|spec)\./i.test(f.path),
  ).length;
  const testRatio =
    touchedCode === 0 ? 1 : Math.min(1, touchedTests / touchedCode);

  let score = 70;
  score += Math.round(testRatio * 20);
  score -= Math.min(30, riskCount * 6);

  return Math.max(0, Math.min(100, score));
}
