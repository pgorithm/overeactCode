import {
  type PermissionActionType,
  type PermissionEvaluationResult,
  type PermissionScope
} from "./permissionPolicy";

export type PermissionPromptStatus =
  | "awaiting_user_decision"
  | "resolved_policy_denied"
  | "resolved_user_approved"
  | "resolved_user_rejected";

export type PermissionPromptDecision = "approve" | "reject";

export type PermissionResolution =
  | "user_approved"
  | "user_rejected"
  | "policy_denied";

export type SessionPermissionSignal = "continue_execution" | "blocked_adapt";

export interface PermissionPromptActionSummary {
  scope: PermissionScope;
  actionType: PermissionActionType;
  target: string;
}

export interface PermissionPromptState {
  sessionId: string;
  toolCallId: string;
  status: PermissionPromptStatus;
  actionSummary: PermissionPromptActionSummary;
  promptMessage: string;
  decisionReason: string;
  reasonCode: string;
}

export interface PermissionPromptResolutionResult {
  resolution: PermissionResolution;
  sessionSignal: SessionPermissionSignal;
  status: PermissionPromptStatus;
  logMessage: string;
}

export function createPermissionPromptState(input: {
  sessionId: string;
  toolCallId: string;
  actionSummary: PermissionPromptActionSummary;
  evaluation: PermissionEvaluationResult;
}): PermissionPromptState | null {
  const { evaluation } = input;
  if (evaluation.decision === "allow") {
    return null;
  }

  if (evaluation.decision === "deny") {
    return {
      sessionId: input.sessionId,
      toolCallId: input.toolCallId,
      status: "resolved_policy_denied",
      actionSummary: input.actionSummary,
      promptMessage:
        "Action was denied by policy and cannot be executed in this run.",
      decisionReason: evaluation.reason,
      reasonCode: evaluation.reasonCode
    };
  }

  return {
    sessionId: input.sessionId,
    toolCallId: input.toolCallId,
    status: "awaiting_user_decision",
    actionSummary: input.actionSummary,
    promptMessage: buildPromptMessage(input.actionSummary),
    decisionReason: evaluation.reason,
    reasonCode: evaluation.reasonCode
  };
}

export function resolvePermissionPromptDecision(input: {
  prompt: PermissionPromptState;
  decision: PermissionPromptDecision;
}): PermissionPromptResolutionResult {
  if (input.prompt.status !== "awaiting_user_decision") {
    throw new Error("Permission prompt is not awaiting a user decision.");
  }

  if (input.decision === "approve") {
    return {
      resolution: "user_approved",
      sessionSignal: "continue_execution",
      status: "resolved_user_approved",
      logMessage:
        "Action was approved by user and marked as user_approved for execution."
    };
  }

  return {
    resolution: "user_rejected",
    sessionSignal: "blocked_adapt",
    status: "resolved_user_rejected",
    logMessage:
      "Action was rejected by user; agent should adapt plan or ask for guidance."
  };
}

export function buildPolicyDeniedResult(
  prompt: PermissionPromptState
): PermissionPromptResolutionResult {
  if (prompt.status !== "resolved_policy_denied") {
    throw new Error("Prompt is not policy denied.");
  }

  return {
    resolution: "policy_denied",
    sessionSignal: "blocked_adapt",
    status: "resolved_policy_denied",
    logMessage: `Action denied by policy (${prompt.reasonCode}): ${prompt.decisionReason}`
  };
}

function buildPromptMessage(action: PermissionPromptActionSummary): string {
  return `Approve ${action.actionType} on ${action.target}?`;
}
