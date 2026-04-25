import { promises as fs } from "fs";
import * as path from "path";
import { execFile as execFileCallback } from "child_process";
import { promisify } from "util";
import { DiffFile, ChangeSource } from "./types";

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

async function collectDiffsBySource(
  workspaceRoot: string,
  source: ChangeSource,
): Promise<DiffFile[]> {
  let args: string[] = [];
  let beforeRef = "HEAD";
  let afterRef: "workspace" | string = "workspace";

  if (source === "committed") {
    // Committed changes: compare current branch HEAD against origin/HEAD
    args = ["diff", "--numstat", "origin/HEAD...HEAD"];
    beforeRef = "origin/HEAD";
    afterRef = "HEAD";
  } else if (source === "staged") {
    args = ["diff", "--staged", "--numstat"];
    beforeRef = "HEAD";
    afterRef = "INDEX";
  } else if (source === "working-tree") {
    args = ["diff", "--numstat"];
    beforeRef = "HEAD";
    afterRef = "workspace";
  } else if (source === "untracked") {
    args = ["ls-files", "--others", "--exclude-standard"];
    beforeRef = "";
    afterRef = "";
  }

  const output = await runGitCommand(workspaceRoot, args);
  if (!output) {
    return [];
  }

  const lines = output.split(/\r?\n/).filter(Boolean);
  const results: DiffFile[] = [];

  if (source === "untracked") {
    // For untracked files, each line is just a file path
    for (const filePath of lines) {
      const after = await readWorkspaceFile(workspaceRoot, filePath);

      results.push({
        path: filePath,
        additions: after.split("\n").length,
        deletions: 0,
        patch: `Untracked file: ${filePath}`,
        beforeComplexity: 0,
        afterComplexity: estimateComplexity(after),
        source: "untracked",
      });
    }
  } else {
    // For committed/staged/working-tree, we have numstat format
    for (const line of lines) {
      const [additionsRaw, deletionsRaw, ...pathParts] = line.split("\t");
      const filePath = pathParts.join("\t");
      if (!filePath) {
        continue;
      }

      const additions = Number.parseInt(additionsRaw, 10);
      const deletions = Number.parseInt(deletionsRaw, 10);

      // Build patch command
      let patchArgs: string[] = [];
      if (source === "committed") {
        patchArgs = [
          "diff",
          "--unified=0",
          "origin/HEAD...HEAD",
          "--",
          filePath,
        ];
      } else if (source === "staged") {
        patchArgs = ["diff", "--staged", "--unified=0", "--", filePath];
      } else if (source === "working-tree") {
        patchArgs = ["diff", "--unified=0", "--", filePath];
      }

      const patch = patchArgs.length
        ? await runGitCommand(workspaceRoot, patchArgs)
        : "";

      // Fetch before/after content
      const before = await readGitBlob(
        workspaceRoot,
        `${beforeRef}:${filePath}`,
      );
      const after =
        afterRef === "workspace"
          ? await readWorkspaceFile(workspaceRoot, filePath)
          : await readGitBlob(workspaceRoot, `${afterRef}:${filePath}`);

      results.push({
        path: filePath,
        additions: Number.isFinite(additions) ? additions : 0,
        deletions: Number.isFinite(deletions) ? deletions : 0,
        patch,
        beforeComplexity: estimateComplexity(before),
        afterComplexity: estimateComplexity(after),
        source,
      });
    }
  }

  return results;
}

export async function getDiffFiles(workspaceRoot: string): Promise<DiffFile[]> {
  // Collect from all sources
  const committed = await collectDiffsBySource(workspaceRoot, "committed");
  const staged = await collectDiffsBySource(workspaceRoot, "staged");
  const workingTree = await collectDiffsBySource(workspaceRoot, "working-tree");
  const untracked = await collectDiffsBySource(workspaceRoot, "untracked");

  // Merge by path, keeping the highest priority source
  const sourceRank = {
    "working-tree": 4,
    staged: 3,
    committed: 2,
    untracked: 1,
  };
  const fileMap = new Map<string, DiffFile>();

  for (const file of [...committed, ...staged, ...workingTree, ...untracked]) {
    const existing = fileMap.get(file.path);
    if (!existing || sourceRank[file.source] > sourceRank[existing.source]) {
      fileMap.set(file.path, file);
    }
  }

  return Array.from(fileMap.values());
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
