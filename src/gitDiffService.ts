import { promises as fs } from "fs";
import * as path from "path";
import { execFile as execFileCallback } from "child_process";
import { promisify } from "util";
import { DiffFile } from "./types";

const execFile = promisify(execFileCallback);

async function runGitCommand(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFile("git", args, {
    cwd,
    maxBuffer: 1024 * 1024 * 8,
  });
  return stdout.trim();
}

function estimateComplexity(code: string): number {
  const matches = code.match(
    /\b(if|else\s+if|for|while|switch|catch)\b|\?|&&|\|\|/g,
  );
  return 1 + (matches?.length ?? 0);
}

async function readGitBlob(
  cwd: string,
  gitRefAndPath: string,
): Promise<string> {
  try {
    const output = await runGitCommand(cwd, ["show", gitRefAndPath]);
    return output;
  } catch {
    return "";
  }
}

async function readWorkspaceFile(
  workspaceRoot: string,
  filePath: string,
): Promise<string> {
  const fullPath = path.join(workspaceRoot, filePath);
  try {
    return await fs.readFile(fullPath, "utf8");
  } catch {
    return "";
  }
}

export async function getDiffFiles(workspaceRoot: string): Promise<DiffFile[]> {
  const numstatOutput = await runGitCommand(workspaceRoot, [
    "diff",
    "--numstat",
  ]);
  if (!numstatOutput) {
    return [];
  }

  const lines = numstatOutput.split(/\r?\n/).filter(Boolean);
  const results: DiffFile[] = [];

  for (const line of lines) {
    const [additionsRaw, deletionsRaw, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t");
    if (!filePath) {
      continue;
    }

    const patch = await runGitCommand(workspaceRoot, [
      "diff",
      "--unified=0",
      "--",
      filePath,
    ]);
    const additions = Number.parseInt(additionsRaw, 10);
    const deletions = Number.parseInt(deletionsRaw, 10);

    const before = await readGitBlob(workspaceRoot, `HEAD:${filePath}`);
    const after = await readWorkspaceFile(workspaceRoot, filePath);

    results.push({
      path: filePath,
      additions: Number.isFinite(additions) ? additions : 0,
      deletions: Number.isFinite(deletions) ? deletions : 0,
      patch,
      beforeComplexity: estimateComplexity(before),
      afterComplexity: estimateComplexity(after),
    });
  }

  return results;
}

export async function restoreFilesToHead(
  workspaceRoot: string,
  filePaths: string[],
): Promise<void> {
  const uniquePaths = Array.from(new Set(filePaths)).filter(Boolean);
  if (!uniquePaths.length) {
    return;
  }

  await execFile(
    "git",
    [
      "restore",
      "--source=HEAD",
      "--staged",
      "--worktree",
      "--",
      ...uniquePaths,
    ],
    { cwd: workspaceRoot, maxBuffer: 1024 * 1024 * 8 },
  );
}
