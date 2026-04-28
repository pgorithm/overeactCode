import {
  evaluatePermissionPolicy,
  type PermissionEvaluationResult,
  type PermissionPolicy,
  type PermissionScope
} from "./permissionPolicy";
import { ContextItemStore, type ContextItem } from "./contextItem";

export interface FileReadApi {
  readFile: (uri: string) => Promise<string>;
}

export interface FileReadResult {
  sourceUri: string;
  policyDecision: PermissionEvaluationResult;
  contextItem: ContextItem;
}

export interface ReadWorkspaceFileInput {
  sessionId: string;
  sourceUri: string;
  reason: string;
  policies?: readonly PermissionPolicy[];
  scope?: PermissionScope;
  userConfirmed?: boolean;
  maxRawContentChars?: number;
}

export class FileReadTool {
  public constructor(
    private readonly api: FileReadApi,
    private readonly contextStore: ContextItemStore = new ContextItemStore()
  ) {}

  public async readWorkspaceFile(
    input: ReadWorkspaceFileInput
  ): Promise<FileReadResult> {
    const evaluation = evaluatePermissionPolicy(
      {
        scope: input.scope ?? "workspace",
        actionType: "read_file",
        target: input.sourceUri
      },
      input.policies ?? []
    );

    if (evaluation.decision === "deny") {
      throw new Error(`File read denied by policy: ${evaluation.reason}`);
    }

    if (evaluation.decision === "confirm" && !input.userConfirmed) {
      throw new Error(
        `File read requires confirmation before execution: ${evaluation.reason}`
      );
    }

    const content = await this.api.readFile(input.sourceUri);
    const contextItem = this.contextStore.createFileContext({
      sessionId: input.sessionId,
      sourceUri: input.sourceUri,
      reason: input.reason,
      content,
      maxRawContentChars: input.maxRawContentChars
    });

    return {
      sourceUri: input.sourceUri,
      policyDecision: evaluation,
      contextItem
    };
  }
}
