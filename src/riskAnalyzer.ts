import { DiffFile, RiskEvidence } from "./types";

const sensitivePathPattern =
  /(auth|security|database_schema|migrations?|permissions?|rbac|policy)/i;
const secretKeyPattern =
  /(api[_-]?key|secret|token|password|private[_-]?key|access[_-]?key|client[_-]?secret)/i;
const obviousTokenPattern =
  /(ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z\-_]{35})/;
const placeholderValuePattern =
  /^(changeme|example|sample|dummy|test|todo|none|null|undefined|<.*>|\$\{.*\})$/i;
const codeLikeExtensionPattern =
  /\.(py|ts|tsx|js|jsx|java|go|rb|php|cs|scala|kt|rs|yaml|yml|json|toml|ini|conf)$/i;
const assignmentPattern =
  /\b(api[_-]?key|secret|token|password|private[_-]?key|access[_-]?key|client[_-]?secret)\b[^:=\n]*[:=]\s*["']([^"']+)["']/i;
const envReferencePattern =
  /^(process\.env\.|settings\.|os\.getenv\(|getenv\(|env\.|config\.|request\.)/i;

export interface RiskSignals {
  flags: string[];
  evidence: RiskEvidence[];
}

interface AddedLine {
  lineNumber?: number;
  content: string;
}

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

function getAddedLines(patch: string): AddedLine[] {
  const lines = patch.split(/\r?\n/);
  const added: AddedLine[] = [];
  let newLineNumber: number | undefined;

  for (const rawLine of lines) {
    const hunkHeader = rawLine.match(
      /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/,
    );
    if (hunkHeader) {
      newLineNumber = Number(hunkHeader[1]);
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      const content = rawLine.slice(1).trim();
      added.push({
        lineNumber: newLineNumber,
        content,
      });
      if (typeof newLineNumber === "number") {
        newLineNumber += 1;
      }
      continue;
    }

    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      continue;
    }

    if (rawLine.startsWith(" ") && typeof newLineNumber === "number") {
      newLineNumber += 1;
    }
  }

  return added;
}

function looksLikeHardcodedSecretValue(rawValue: string): boolean {
  const value = normalizeEnvValue(rawValue);

  if (!value || value.length < 8 || placeholderValuePattern.test(value)) {
    return false;
  }

  if (envReferencePattern.test(value)) {
    return false;
  }

  if (/\s/.test(value)) {
    return false;
  }

  if (/^[A-Za-z_][A-Za-z0-9_\.\-]*$/.test(value) && value.length < 20) {
    return false;
  }

  const hasMixedCharset =
    /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);

  return (
    value.length >= 20 || obviousTokenPattern.test(value) || hasMixedCharset
  );
}

function hasPotentialHardcodedSecret(file: DiffFile): AddedLine[] {
  const addedLines = getAddedLines(file.patch);
  if (!addedLines.length) {
    return [];
  }

  const matches: AddedLine[] = [];

  for (const line of addedLines) {
    if (obviousTokenPattern.test(line.content)) {
      matches.push(line);
    }
  }

  if (matches.length) {
    return matches;
  }

  if (!codeLikeExtensionPattern.test(file.path)) {
    return [];
  }

  for (const line of addedLines) {
    const assignment = line.content.match(assignmentPattern);
    if (!assignment) {
      continue;
    }

    if (looksLikeHardcodedSecretValue(assignment[2])) {
      matches.push(line);
    }
  }

  if (matches.length) {
    return matches;
  }

  return hasPotentialEnvSecret(file.path, file.patch)
    ? [{ content: "Potential secret assignment in env-like file" }]
    : [];
}

function buildEvidence(
  flag: string,
  filePath: string,
  snippet: string,
  lineNumber?: number,
): RiskEvidence {
  return {
    flag,
    filePath,
    lineNumber,
    snippet: snippet.slice(0, 180),
  };
}

export function collectRiskSignals(files: DiffFile[]): RiskSignals {
  const flags = new Set<string>();
  const evidence: RiskEvidence[] = [];

  for (const file of files) {
    if (sensitivePathPattern.test(file.path)) {
      flags.add("Sensitive path touched");
      evidence.push(
        buildEvidence(
          "Sensitive path touched",
          file.path,
          "Path matches sensitive domains (auth/security/permissions/rbac).",
        ),
      );
    }

    const secretLines = hasPotentialHardcodedSecret(file);
    if (secretLines.length) {
      flags.add("Potential hardcoded secret");
      for (const line of secretLines.slice(0, 2)) {
        evidence.push(
          buildEvidence(
            "Potential hardcoded secret",
            file.path,
            line.content || "Potential hardcoded secret",
            line.lineNumber,
          ),
        );
      }
    }

    const complexityDelta = file.afterComplexity - file.beforeComplexity;
    if (complexityDelta >= 8) {
      flags.add("Complexity spike detected");
      evidence.push(
        buildEvidence(
          "Complexity spike detected",
          file.path,
          `Cyclomatic complexity +${complexityDelta} (${file.beforeComplexity} -> ${file.afterComplexity}).`,
        ),
      );
    }

    if (file.additions + file.deletions >= 300) {
      flags.add("Large churn in single file");
      evidence.push(
        buildEvidence(
          "Large churn in single file",
          file.path,
          `Churn +${file.additions} / -${file.deletions} (${file.additions + file.deletions} lines).`,
        ),
      );
    }
  }

  return {
    flags: Array.from(flags),
    evidence,
  };
}

export function collectRiskFlags(files: DiffFile[]): string[] {
  return collectRiskSignals(files).flags;
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
