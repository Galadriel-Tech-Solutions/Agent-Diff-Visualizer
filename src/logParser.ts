import { promises as fs } from "fs";
import * as path from "path";
import { AgentIntent } from "./types";

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

async function collectAiderCandidates(
  workspaceRoot: string,
): Promise<string[]> {
  const names = [".aider.chat.history.md", ".aider.history.md", "aider.log"];

  return names.map((name) => path.join(workspaceRoot, name));
}

function parseClineJson(raw: string, source: string): AgentIntent | null {
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
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
    return null;
  }
}

function parseAiderMarkdown(raw: string, source: string): AgentIntent | null {
  const promptMatch = raw.match(/(User|You):\s*([\s\S]{1,1200})/i);
  const thinkingMatch = raw.match(/(Assistant|Aider):\s*([\s\S]{1,1500})/i);

  if (!promptMatch && !thinkingMatch) {
    return null;
  }

  return {
    prompt: promptMatch?.[2]?.trim() || "(prompt unavailable)",
    thinking: thinkingMatch?.[2]?.trim() || "(thinking unavailable)",
    source,
  };
}

export async function readLatestIntent(
  workspaceRoot: string,
): Promise<AgentIntent | null> {
  const clineCandidates = await collectClineCandidates(workspaceRoot);
  const aiderCandidates = await collectAiderCandidates(workspaceRoot);
  const latest = await findLatestFile([...clineCandidates, ...aiderCandidates]);

  if (!latest) {
    return null;
  }

  try {
    const raw = await fs.readFile(latest, "utf8");

    if (latest.endsWith(".json")) {
      return parseClineJson(raw, latest);
    }

    return parseAiderMarkdown(raw, latest);
  } catch {
    return null;
  }
}
