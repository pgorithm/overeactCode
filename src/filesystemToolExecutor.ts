import {
  evaluatePermissionPolicy,
  type PermissionPolicy,
  type PermissionScope
} from "./permissionPolicy";
import {
  ToolCallRecordStore,
  type ToolCallRecord
} from "./toolCallRecord";
import { FileReadTool, type FileReadResult } from "./fileReadTool";
import {
  WorkspaceSearchTool,
  type WorkspaceFileSearchResult
} from "./workspaceSearch";
import { PatchProposalStore, type PatchProposal } from "./patchProposal";
import { PatchEditingBoundary } from "./patchEditingBoundary";
import { AgentLoopController } from "./agentSession";

export interface FilesystemToolExecutorDependencies {
  readonly toolCallStore: ToolCallRecordStore;
  readonly fileReadTool: FileReadTool;
  readonly workspaceSearchTool: WorkspaceSearchTool;
  readonly patchProposalStore: PatchProposalStore;
  readonly patchEditingBoundary: PatchEditingBoundary;
  readonly loopController?: AgentLoopController;
}

export interface ToolExecutionResult<TData> {
  readonly sessionId: string;
  readonly toolCall: ToolCallRecord;
  readonly outcome: "succeeded" | "denied";
  readonly sessionSignal: "continue" | "adapt_or_guidance";
  readonly data: TData | null;
}

interface BaseToolInput {
  readonly sessionId: string;
  readonly policies?: readonly PermissionPolicy[];
  readonly scope?: PermissionScope;
  readonly userConfirmed?: boolean;
}

export interface ExecuteSearchInput extends BaseToolInput {
  readonly include?: string;
  readonly textQuery?: string;
  readonly exclude?: string;
  readonly maxResults?: number;
}

export interface ExecuteReadInput extends BaseToolInput {
  readonly sourceUri: string;
  readonly reason: string;
  readonly maxRawContentChars?: number;
}

export interface ExecutePatchProposalInput extends BaseToolInput {
  readonly fileUri: string;
  readonly diff: string;
}

export class FilesystemToolExecutor {
  private readonly toolCallStore: ToolCallRecordStore;
  private readonly fileReadTool: FileReadTool;
  private readonly workspaceSearchTool: WorkspaceSearchTool;
  private readonly patchProposalStore: PatchProposalStore;
  private readonly patchEditingBoundary: PatchEditingBoundary;
  private readonly loopController?: AgentLoopController;

  public constructor(dependencies: FilesystemToolExecutorDependencies) {
    this.toolCallStore = dependencies.toolCallStore;
    this.fileReadTool = dependencies.fileReadTool;
    this.workspaceSearchTool = dependencies.workspaceSearchTool;
    this.patchProposalStore = dependencies.patchProposalStore;
    this.patchEditingBoundary = dependencies.patchEditingBoundary;
    this.loopController = dependencies.loopController;
  }

  public async executeSearch(
    input: ExecuteSearchInput
  ): Promise<ToolExecutionResult<WorkspaceFileSearchResult[] | null>> {
    const record = this.toolCallStore.createPendingRecord({
      sessionId: input.sessionId,
      toolName: "workspace.search",
      inputSummary: input.textQuery
        ? `Search files by query "${input.textQuery}".`
        : `Search files by include pattern "${input.include ?? "**/*"}".`
    });
    const evaluation = evaluatePermissionPolicy(
      {
        scope: input.scope ?? "workspace",
        actionType: "read_file",
        target: input.textQuery ?? input.include ?? "*"
      },
      input.policies ?? []
    );

    if (evaluation.decision === "deny") {
      return this.resolveDenied(record, evaluation.reason);
    }

    if (evaluation.decision === "confirm" && !input.userConfirmed) {
      return this.resolveDenied(record, evaluation.reason);
    }

    this.toolCallStore.setPermissionDecision(record.id, "approved");
    this.toolCallStore.markRunning(record.id);
    const results = await this.workspaceSearchTool.searchFiles({
      include: input.include,
      textQuery: input.textQuery,
      exclude: input.exclude,
      maxResults: input.maxResults
    });
    const finished = this.toolCallStore.markFinished(
      record.id,
      "succeeded",
      `Search returned ${results.length} file candidates.`
    );
    return {
      sessionId: input.sessionId,
      toolCall: finished,
      outcome: "succeeded",
      sessionSignal: "continue",
      data: results
    };
  }

  public async executeRead(
    input: ExecuteReadInput
  ): Promise<ToolExecutionResult<FileReadResult | null>> {
    const record = this.toolCallStore.createPendingRecord({
      sessionId: input.sessionId,
      toolName: "workspace.read_file",
      inputSummary: `Read ${input.sourceUri}`
    });
    const evaluation = evaluatePermissionPolicy(
      {
        scope: input.scope ?? "workspace",
        actionType: "read_file",
        target: input.sourceUri
      },
      input.policies ?? []
    );
    if (evaluation.decision === "deny") {
      return this.resolveDenied(record, evaluation.reason);
    }
    if (evaluation.decision === "confirm" && !input.userConfirmed) {
      return this.resolveDenied(record, evaluation.reason);
    }

    this.toolCallStore.setPermissionDecision(record.id, "approved");
    this.toolCallStore.markRunning(record.id);
    const readResult = await this.fileReadTool.readWorkspaceFile({
      sessionId: input.sessionId,
      sourceUri: input.sourceUri,
      reason: input.reason,
      policies: input.policies,
      scope: input.scope,
      userConfirmed: input.userConfirmed,
      maxRawContentChars: input.maxRawContentChars
    });
    const finished = this.toolCallStore.markFinished(
      record.id,
      "succeeded",
      `Read ${readResult.sourceUri} and added context item ${readResult.contextItem.id}.`
    );
    return {
      sessionId: input.sessionId,
      toolCall: finished,
      outcome: "succeeded",
      sessionSignal: "continue",
      data: readResult
    };
  }

  public async executePatchProposal(
    input: ExecutePatchProposalInput
  ): Promise<ToolExecutionResult<PatchProposal | null>> {
    const record = this.toolCallStore.createPendingRecord({
      sessionId: input.sessionId,
      toolName: "workspace.write_file",
      inputSummary: `Propose patch for ${input.fileUri}`
    });
    const evaluation = evaluatePermissionPolicy(
      {
        scope: input.scope ?? "workspace",
        actionType: "write_file",
        target: input.fileUri
      },
      input.policies ?? []
    );
    if (evaluation.decision === "deny") {
      return this.resolveDenied(record, evaluation.reason);
    }
    if (evaluation.decision === "confirm" && !input.userConfirmed) {
      return this.resolveDenied(record, evaluation.reason);
    }

    this.toolCallStore.setPermissionDecision(record.id, "approved");
    this.toolCallStore.markRunning(record.id);
    const proposal = this.patchProposalStore.createProposal({
      sessionId: input.sessionId,
      fileUri: input.fileUri,
      diff: input.diff
    });
    this.patchEditingBoundary.createEditRequest({
      proposal
    });
    const finished = this.toolCallStore.markFinished(
      record.id,
      "succeeded",
      `Created patch proposal ${proposal.id} for ${proposal.fileUri}.`
    );
    return {
      sessionId: input.sessionId,
      toolCall: finished,
      outcome: "succeeded",
      sessionSignal: "continue",
      data: proposal
    };
  }

  private resolveDenied(
    record: ToolCallRecord,
    reason: string
  ): ToolExecutionResult<null> {
    this.toolCallStore.setPermissionDecision(record.id, "denied");
    if (this.loopController?.getState(record.sessionId)) {
      this.loopController.handleVerificationFailure(record.sessionId, {
        failedCommands: [],
        diagnostics: {
          preExistingCount: 0,
          likelyNewCount: 1,
          summary: `Filesystem tool call denied: ${reason}`
        },
        retryGuidance:
          "Adapt the plan to avoid denied filesystem action or request user guidance."
      });
    }
    const deniedCall = this.toolCallStore.getBySessionId(record.sessionId).find(
      (entry) => entry.id === record.id
    );
    if (!deniedCall) {
      throw new Error(`Tool call ${record.id} was not found after denial.`);
    }

    return {
      sessionId: record.sessionId,
      toolCall: deniedCall,
      outcome: "denied",
      sessionSignal: "adapt_or_guidance",
      data: null
    };
  }
}
