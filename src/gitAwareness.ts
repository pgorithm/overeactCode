export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type GitCommandRunner = (args: string[]) => Promise<GitCommandResult>;

export interface GitStatusSnapshot {
  raw: string;
  dirtyFiles: string[];
  hasChanges: boolean;
}

export interface GitLogEntry {
  hash: string;
  subject: string;
}

export interface DraftCommitMessageResult {
  status: GitStatusSnapshot;
  diff: string;
  recentLog: GitLogEntry[];
  draftMessage: string;
}

export interface GitSessionContext {
  sessionId: string;
  preExistingDirtyFiles: string[];
}

const READ_ONLY_COMMANDS = new Set(["status", "diff", "log"]);
const BLOCKED_GIT_ACTIONS = [
  "push",
  "commit",
  "reset",
  "clean",
  "rebase",
  "merge",
  "cherry-pick"
];

export class GitSessionContextStore {
  private readonly store = new Map<string, GitSessionContext>();

  public capturePreExistingDirtyFiles(
    sessionId: string,
    snapshot: GitStatusSnapshot
  ): GitSessionContext {
    const existing = this.store.get(sessionId);
    if (existing) {
      return existing;
    }

    const context: GitSessionContext = {
      sessionId,
      preExistingDirtyFiles: [...snapshot.dirtyFiles]
    };
    this.store.set(sessionId, context);
    return context;
  }

  public getBySessionId(sessionId: string): GitSessionContext | undefined {
    return this.store.get(sessionId);
  }
}

export class GitAwarenessTool {
  public constructor(private readonly runGit: GitCommandRunner) {}

  public async inspectStatus(): Promise<GitStatusSnapshot> {
    const result = await this.executeReadOnlyCommand(["status", "--short"]);
    return parseGitStatus(result.stdout);
  }

  public async inspectDiff(input?: {
    staged?: boolean;
    path?: string;
  }): Promise<string> {
    const args = ["diff", "--no-color"];
    if (input?.staged) {
      args.push("--staged");
    }
    if (input?.path) {
      args.push("--", input.path);
    }

    const result = await this.executeReadOnlyCommand(args);
    return result.stdout;
  }

  public async inspectRecentLog(limit = 20): Promise<GitLogEntry[]> {
    const boundedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(100, Math.floor(limit)))
      : 20;
    const result = await this.executeReadOnlyCommand([
      "log",
      `-${boundedLimit}`,
      "--pretty=format:%h%x09%s"
    ]);

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [hash, ...subjectParts] = line.split("\t");
        return {
          hash: hash ?? "",
          subject: subjectParts.join("\t").trim()
        };
      })
      .filter((entry) => entry.hash.length > 0 && entry.subject.length > 0);
  }

  public async createDraftCommitMessage(): Promise<DraftCommitMessageResult> {
    const status = await this.inspectStatus();
    const diff = await this.inspectDiff();
    const recentLog = await this.inspectRecentLog(5);
    const changedFilesLine =
      status.dirtyFiles.length > 0
        ? `Affected files: ${status.dirtyFiles.join(", ")}.`
        : "No changed files detected.";
    const diffIntentLine = describeDiffIntent(diff);
    const recentStyleHint =
      recentLog.length > 0
        ? `Recent style hint: ${recentLog[0]?.subject}.`
        : "Recent style hint unavailable.";

    return {
      status,
      diff,
      recentLog,
      draftMessage: `${status.hasChanges ? "Update" : "Review"} workspace changes.\n\n${changedFilesLine}\n${diffIntentLine}\n${recentStyleHint}`
    };
  }

  public assertReadOnlyMvpCommand(command: string): void {
    const normalized = command.trim().toLowerCase();
    if (normalized.length === 0) {
      throw new Error("Git command must not be empty.");
    }

    const firstToken = normalized.split(/\s+/)[0];
    if (!firstToken) {
      throw new Error("Git command must not be empty.");
    }

    if (BLOCKED_GIT_ACTIONS.includes(firstToken)) {
      throw new Error(
        `Git action "${firstToken}" is blocked in MVP read-only mode.`
      );
    }

    if (!READ_ONLY_COMMANDS.has(firstToken)) {
      throw new Error(`Git action "${firstToken}" is not allowed in MVP mode.`);
    }
  }

  private async executeReadOnlyCommand(args: string[]): Promise<GitCommandResult> {
    this.assertReadOnlyMvpCommand(args[0] ?? "");
    const result = await this.runGit(args);
    if (result.exitCode !== 0) {
      const stderr = result.stderr.trim();
      throw new Error(
        stderr.length > 0
          ? `Git command failed: ${stderr}`
          : "Git command failed with non-zero exit code."
      );
    }

    return result;
  }
}

function parseGitStatus(stdout: string): GitStatusSnapshot {
  const dirtyFiles = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[MADRCU?!\s]{1,3}/, "").trim())
    .filter((line) => line.length > 0);

  return {
    raw: stdout,
    dirtyFiles,
    hasChanges: dirtyFiles.length > 0
  };
}

function describeDiffIntent(diff: string): string {
  const trimmed = diff.trim();
  if (trimmed.length === 0) {
    return "Diff intent: no textual diff was detected.";
  }

  const filesChanged = (trimmed.match(/^diff --git /gm) ?? []).length;
  const additions = (trimmed.match(/^\+(?!\+\+)/gm) ?? []).length;
  const deletions = (trimmed.match(/^-(?!--)/gm) ?? []).length;
  return `Diff intent: touches ${filesChanged} file(s), with ${additions} addition line(s) and ${deletions} deletion line(s).`;
}
