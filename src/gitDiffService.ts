import { promises as fs } from "fs";
import * as path from "path";
import { execFile as execFileCallback } from "child_process";
import { promisify } from "util";
import { DiffFile, DiffScope } from "./types";

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

async function getDiffFilesByScope(
  workspaceRoot: string,
  scope: DiffScope,
): Promise<{ files: DiffFile[]; shortCommitRef: string }> {
  let args: string[] = [];
  let shortCommitRef = "";

  if (scope === "working-tree") {
    args = ["diff", "--numstat"];
    shortCommitRef = "HEAD";
  } else if (scope === "staged") {
    args = ["diff", "--staged", "--numstat"];
    shortCommitRef = "INDEX";
  } else if (scope === "unpushed-commits") {
    args = ["diff", "--numstat", "origin/HEAD...HEAD"];
    shortCommitRef = "UNPUSHED";
  } else if (scope === "untracked") {
    args = ["ls-files", "--others", "--exclude-standard"];
    shortCommitRef = "UNTRACKED";
  }

  const output = await runGitCommand(workspaceRoot, args);
  if (!output) {
    return { files: [], shortCommitRef };
  }

  const lines = output.split(/\r?\n/).filter(Boolean);
  const results: DiffFile[] = [];

  if (scope === "untracked") {
    // For untracked files, each line is just a file path
    for (const filePath of lines) {
      const after = await readWorkspaceFile(workspaceRoot, filePath);
      const fileStats = await fs
        .stat(path.join(workspaceRoot, filePath))
        .catch(() => null);
      const additions = fileStats ? after.split("\n").length : 0;

      results.push({
        path: filePath,
        additions,
        deletions: 0,
        patch: `Untracked file: ${filePath}`,
        beforeComplexity: 0,
        afterComplexity: estimateComplexity(after),
      });
    }
  } else {
    // For staged/working-tree/unpushed, we have numstat format
    for (const line of lines) {
      const [additionsRaw, deletionsRaw, ...pathParts] = line.split("\t");
      const filePath = pathParts.join("\t");
      if (!filePath) {
        continue;
      }

      const additions = Number.parseInt(additionsRaw, 10);
      const deletions = Number.parseInt(deletionsRaw, 10);

      // Build patch command based on scope
      let patchArgs: string[] = [];
      if (scope === "working-tree") {
        patchArgs = ["diff", "--unified=0", "--", filePath];
      } else if (scope === "staged") {
        patchArgs = ["diff", "--staged", "--unified=0", "--", filePath];
      } else if (scope === "unpushed-commits") {
        patchArgs = [
          "diff",
          "--unified=0",
          "origin/HEAD...HEAD",
          "--",
          filePath,
        ];
      }

      const patch = patchArgs.length
        ? await runGitCommand(workspaceRoot, patchArgs)
        : "";

      // For unpushed commits, compare against origin/HEAD instead of HEAD
      const commitRef = scope === "unpushed-commits" ? "origin/HEAD" : "HEAD";
      const before = await readGitBlob(
        workspaceRoot,
        `${commitRef}:${filePath}`,
      );
      const after =
        scope === "unpushed-commits"
          ? await readGitBlob(workspaceRoot, `HEAD:${filePath}`)
          : await readWorkspaceFile(workspaceRoot, filePath);

      results.push({
        path: filePath,
        additions: Number.isFinite(additions) ? additions : 0,
        deletions: Number.isFinite(deletions) ? deletions : 0,
        patch,
        beforeComplexity: estimateComplexity(before),
        afterComplexity: estimateComplexity(after),
      });
    }
  }

  return { files: results, shortCommitRef };
}

export async function getDiffFiles(
  workspaceRoot: string,
  scope: DiffScope = "working-tree",
): Promise<DiffFile[]> {
  const { files } = await getDiffFilesByScope(workspaceRoot, scope);
  return files;
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
