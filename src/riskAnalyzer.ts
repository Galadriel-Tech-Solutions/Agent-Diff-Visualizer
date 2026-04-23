import { DiffFile } from "./types";

const sensitivePathPattern =
  /(auth|security|database_schema|migrations?|permissions?|rbac|policy)/i;
const secretPattern =
  /(api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*["'][^"']+["']/i;
const secretKeyPattern =
  /(api[_-]?key|secret|token|password|private[_-]?key|access[_-]?key|client[_-]?secret)/i;
const obviousTokenPattern =
  /(ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z\-_]{35})/;
const placeholderValuePattern =
  /^(changeme|example|sample|dummy|test|todo|none|null|undefined|<.*>|\$\{.*\})$/i;

function normalizeEnvValue(value: string): string {
  let cleaned = value.trim();

  // Remove trailing inline comments commonly used in .env files.
  cleaned = cleaned.replace(/\s+#.*$/, "");

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned;
}

function hasPotentialEnvSecret(filePath: string, patch: string): boolean {
  const isEnvLikeFile = /(^|\/)\.env(\.|$)|env\.(dist|example|local)$/i.test(
    filePath,
  );
  if (!isEnvLikeFile) {
    return false;
  }

  const lines = patch.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith("+") || line.startsWith("+++")) {
      continue;
    }

    const content = line.slice(1).trim();
    const assignment = content.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!assignment) {
      continue;
    }

    const key = assignment[1];
    const value = normalizeEnvValue(assignment[2]);

    if (!secretKeyPattern.test(key)) {
      continue;
    }

    if (!value || value.length < 8 || placeholderValuePattern.test(value)) {
      continue;
    }

    return true;
  }

  return false;
}

export function collectRiskFlags(files: DiffFile[]): string[] {
  const flags = new Set<string>();

  for (const file of files) {
    if (sensitivePathPattern.test(file.path)) {
      flags.add("Sensitive path touched");
    }

    if (
      secretPattern.test(file.patch) ||
      obviousTokenPattern.test(file.patch) ||
      hasPotentialEnvSecret(file.path, file.patch)
    ) {
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
