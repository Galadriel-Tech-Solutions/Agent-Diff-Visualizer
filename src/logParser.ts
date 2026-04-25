import { Dirent, promises as fs } from "fs";
import * as path from "path";
import { AgentIntent } from "./types";

// In-memory buffer for intent captured via the @adv chat participant
let capturedChatIntent: AgentIntent | null = null;

async function findLatestFile(candidates: string[]): Promise<string | null> {
  let latest: { path: string; mtime: number } | null = null;

  for (const filePath of candidates) {
    try {
      const stat = await fs.stat(filePath);
      if (!latest || stat.mtimeMs > latest.mtime) {
        latest = { path: filePath, mtime: stat.mtimeMs };
      }
    } catch {
      continue;
    }
  }

  return latest?.path ?? null;
}

async function collectClineCandidates(
  workspaceRoot: string,
): Promise<string[]> {
  const dirs = [
    path.join(workspaceRoot, ".cline", "history"),
    path.join(workspaceRoot, ".cline"),
  ];

  const candidates: string[] = [];
  for (const dir of dirs) {
    try {
      const items = await fs.readdir(dir);
      for (const item of items) {
        if (item.endsWith(".json")) {
          candidates.push(path.join(dir, item));
        }
      }
    } catch {
      continue;
    }
  }

  return candidates;
}

async function walkFiles(rootDir: string, maxDepth: number): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return;
    }

    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".git") || entry.name === "node_modules") {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
        continue;
      }

      results.push(fullPath);
    }
  }

  await walk(rootDir, 0);
  return results;
}

async function collectGenericAgentCandidates(
  workspaceRoot: string,
): Promise<string[]> {
  const allFiles = await walkFiles(workspaceRoot, 4);
  return allFiles.filter((filePath) => {
    const name = path.basename(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();
    const hasAgentSignal =
      /(cline|aider|agent|history|session|conversation|prompt|reasoning|chat|log)/.test(
        name,
      );
    const hasAllowedExt = [".json", ".jsonl", ".md", ".log", ".txt"].includes(
      ext,
    );
    return hasAgentSignal && hasAllowedExt;
  });
}

async function collectAiderCandidates(
  workspaceRoot: string,
): Promise<string[]> {
  const names = [".aider.chat.history.md", ".aider.history.md", "aider.log"];

  return names.map((name) => path.join(workspaceRoot, name));
}

function parseClineJson(raw: string, source: string): AgentIntent | null {
  const fromMessages = (
    messages: Array<Record<string, unknown>>,
  ): AgentIntent | null => {
    const userMessages = messages
      .filter((m) =>
        String(m.role ?? m.type ?? "")
          .toLowerCase()
          .includes("user"),
      )
      .map((m) => String(m.content ?? m.text ?? m.message ?? "").trim())
      .filter(Boolean);
    const assistantMessages = messages
      .filter((m) => {
        const role = String(m.role ?? m.type ?? "").toLowerCase();
        return (
          role.includes("assistant") ||
          role.includes("agent") ||
          role.includes("model")
        );
      })
      .map((m) => String(m.content ?? m.text ?? m.message ?? "").trim())
      .filter(Boolean);

    if (!userMessages.length && !assistantMessages.length) {
      return null;
    }

    return {
      prompt: userMessages.at(-1) || "(prompt unavailable)",
      thinking: assistantMessages.at(-1) || "(thinking unavailable)",
      source,
    };
  };

  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;

    if (Array.isArray(payload)) {
      const messageBased = fromMessages(
        payload as Array<Record<string, unknown>>,
      );
      if (messageBased) {
        return messageBased;
      }
    }

    if (Array.isArray(payload.messages)) {
      const messageBased = fromMessages(
        payload.messages as Array<Record<string, unknown>>,
      );
      if (messageBased) {
        return messageBased;
      }
    }

    const prompt = String(payload.prompt ?? payload.userPrompt ?? "").trim();
    const thinking = String(
      payload.thinking ?? payload.reasoning ?? payload.summary ?? "",
    ).trim();
    const timestamp = String(payload.timestamp ?? "").trim() || undefined;

    if (!prompt && !thinking) {
      return null;
    }

    return {
      prompt: prompt || "(prompt unavailable)",
      thinking: thinking || "(thinking unavailable)",
      source,
      timestamp,
    };
  } catch {
    const jsonlLines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("{") && line.endsWith("}"));

    for (let i = jsonlLines.length - 1; i >= 0; i -= 1) {
      const parsed = parseClineJson(jsonlLines[i], source);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }
}

function parseAiderMarkdown(raw: string, source: string): AgentIntent | null {
  const promptMatches = Array.from(
    raw.matchAll(
      /(?:^|\n)(?:User|You)\s*:\s*([\s\S]*?)(?=\n(?:Assistant|Aider|User|You)\s*:|$)/gi,
    ),
  );
  const thinkingMatches = Array.from(
    raw.matchAll(
      /(?:^|\n)(?:Assistant|Aider)\s*:\s*([\s\S]*?)(?=\n(?:Assistant|Aider|User|You)\s*:|$)/gi,
    ),
  );

  if (!promptMatches.length && !thinkingMatches.length) {
    return null;
  }

  return {
    prompt: promptMatches.at(-1)?.[1]?.trim() || "(prompt unavailable)",
    thinking: thinkingMatches.at(-1)?.[1]?.trim() || "(thinking unavailable)",
    source,
  };
}

export async function readLatestIntent(
  workspaceRoot: string,
): Promise<AgentIntent | null> {
  // Priority 1: Return intent captured via @adv Copilot Chat participant
  if (capturedChatIntent) {
    return capturedChatIntent;
  }

  const clineCandidates = await collectClineCandidates(workspaceRoot);
  const aiderCandidates = await collectAiderCandidates(workspaceRoot);
  const genericCandidates = await collectGenericAgentCandidates(workspaceRoot);
  const latest = await findLatestFile([
    ...clineCandidates,
    ...aiderCandidates,
    ...genericCandidates,
  ]);

  if (!latest) {
    return null;
  }

  try {
    const raw = await fs.readFile(latest, "utf8");

    if (latest.endsWith(".json") || latest.endsWith(".jsonl")) {
      return parseClineJson(raw, latest);
    }

    return parseAiderMarkdown(raw, latest);
  } catch {
    return null;
  }
}

/** Called by the @adv chat participant handler when the user sends a prompt. */
export function setChatIntent(intent: AgentIntent): void {
  capturedChatIntent = intent;
}

/** Clears the stored chat intent (used by the /clear command). */
export function clearChatIntent(): void {
  capturedChatIntent = null;
}

/** Returns true if an intent has been captured via chat. */
export function hasChatIntent(): boolean {
  return capturedChatIntent !== null;
}
