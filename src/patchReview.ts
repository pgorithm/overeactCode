import {
  type PermissionEvaluationResult
} from "./permissionPolicy";
import { type PatchProposal } from "./patchProposal";

export type PatchReviewStatus =
  | "proposed"
  | "awaiting_policy_decision"
  | "applied"
  | "rejected";

export type PatchReviewDecision = "approve" | "reject";

export interface PatchReviewState {
  proposalId: string;
  sessionId: string;
  toolCallId: string;
  fileUri: string;
  diff: string;
  status: PatchReviewStatus;
}

export type PatchReviewResolution =
  | "applied"
  | "awaiting_user_permission"
  | "rejected";

export type PatchReviewSignal = "continue_execution" | "blocked_adapt";

export interface PatchReviewDecisionResult {
  status: PatchReviewStatus;
  resolution: PatchReviewResolution;
  sessionSignal: PatchReviewSignal;
  logMessage: string;
}

export function createPatchReviewState(input: {
  proposal: PatchProposal;
  toolCallId: string;
}): PatchReviewState {
  return {
    proposalId: input.proposal.id,
    sessionId: input.proposal.sessionId,
    toolCallId: input.toolCallId,
    fileUri: input.proposal.fileUri,
    diff: input.proposal.diff,
    status: "proposed"
  };
}

export function resolvePatchReviewDecision(input: {
  decision: PatchReviewDecision;
  policyEvaluation: PermissionEvaluationResult;
}): PatchReviewDecisionResult {
  if (input.decision === "reject") {
    return {
      status: "rejected",
      resolution: "rejected",
      sessionSignal: "blocked_adapt",
      logMessage:
        "Patch proposal was rejected by user; agent should adapt plan or ask for guidance."
    };
  }

  if (input.policyEvaluation.decision === "deny") {
    return {
      status: "rejected",
      resolution: "rejected",
      sessionSignal: "blocked_adapt",
      logMessage: `Patch apply denied by policy (${input.policyEvaluation.reasonCode}): ${input.policyEvaluation.reason}`
    };
  }

  if (input.policyEvaluation.decision === "confirm") {
    return {
      status: "awaiting_policy_decision",
      resolution: "awaiting_user_permission",
      sessionSignal: "continue_execution",
      logMessage:
        "Patch approval captured; waiting for permission confirmation before apply."
    };
  }

  return {
    status: "applied",
    resolution: "applied",
    sessionSignal: "continue_execution",
    logMessage: "Patch proposal approved and applied under allow policy."
  };
}

export function resolvePatchAfterPermission(input: {
  approved: boolean;
}): PatchReviewDecisionResult {
  if (input.approved) {
    return {
      status: "applied",
      resolution: "applied",
      sessionSignal: "continue_execution",
      logMessage: "Patch proposal applied after user permission approval."
    };
  }

  return {
    status: "rejected",
    resolution: "rejected",
    sessionSignal: "blocked_adapt",
    logMessage:
      "Patch proposal was rejected during permission decision; agent should adapt plan."
  };
}

