import type { AgentLoopState, AgentSession } from "./agentSession";
import type { ToolCallRecord } from "./toolCallRecord";
import { sanitizeFinalSummary, sanitizeToolCallRecord } from "./privacyGuards";

export interface ComposerFinalSummary {
  changedFiles: string[];
  checksRun: string[];
  unresolvedIssues: string[];
  assumptions: string[];
  suggestedNextSteps: string[];
}

export interface ComposerVerificationView {
  status: "pending" | "passed" | "needs_retry";
  retryCount: number;
  failedCommands: string[];
  diagnosticsSummary: string;
}

export interface ComposerViewModel {
  currentStage: string;
  nextStep: string;
  planSummary: string;
  progressUpdates: string[];
  toolActivityDefault: ToolCallRecord[];
  hiddenToolActivityCount: number;
  verification: ComposerVerificationView;
  finalSummary: ComposerFinalSummary;
}

const PHASE_LABELS: Record<string, string> = {
  task_understood: "Task understood",
  context_retrieved: "Context retrieved",
  plan_proposed: "Plan proposed",
  plan_change_requested: "Plan changes requested",
  plan_approved: "Plan approved",
  editing_started: "Editing started",
  editing_finished: "Editing finished",
  verification_finished: "Verification finished",
  retry_requested: "Retry requested",
  summary_published: "Summary published"
};

function resolveNextStep(loopState: AgentLoopState): string {
  if (loopState.status === "planning" && !loopState.planSummary) {
    return "Retrieve targeted context and propose a plan.";
  }
  if (loopState.status === "planning" && !loopState.planApproved) {
    return "Wait for plan approval or plan change request.";
  }
  if (loopState.status === "editing") {
    return "Apply approved edits and prepare verification.";
  }
  if (loopState.status === "verifying") {
    return "Run compile/tests and process diagnostics feedback.";
  }
  if (loopState.status === "completed") {
    return "Review final summary and decide follow-up work.";
  }
  if (loopState.status === "blocked" || loopState.status === "failed") {
    return "Resolve blockers before retrying the task.";
  }
  return "Continue agent loop execution.";
}

export function buildComposerViewModel(input: {
  session: AgentSession;
  loopState: AgentLoopState;
  toolActivity: ToolCallRecord[];
  finalSummary: ComposerFinalSummary;
}): ComposerViewModel {
  const phaseUpdates = input.loopState.phaseHistory.map((phase) => {
    return PHASE_LABELS[phase] ?? phase;
  });
  const toolActivityDefault = input.toolActivity
    .slice(0, 3)
    .map((record) => sanitizeToolCallRecord(record));
  const hiddenToolActivityCount = Math.max(input.toolActivity.length - 3, 0);
  const failedCommands =
    input.loopState.lastVerificationFeedback?.failedCommands.map((entry) => {
      return `${entry.command} (exit ${entry.exitCode ?? "unknown"})`;
    }) ?? [];
  const verification: ComposerVerificationView =
    input.loopState.status === "completed"
      ? {
          status: "passed",
          retryCount: input.loopState.retryCount,
          failedCommands: [],
          diagnosticsSummary: "Verification passed with no likely new issues."
        }
      : failedCommands.length > 0 ||
          (input.loopState.lastVerificationFeedback?.diagnostics.likelyNewCount ?? 0) > 0
        ? {
            status: "needs_retry",
            retryCount: input.loopState.retryCount,
            failedCommands,
            diagnosticsSummary:
              input.loopState.lastVerificationFeedback?.diagnostics.summary ??
              "Verification feedback is available."
          }
        : {
            status: "pending",
            retryCount: input.loopState.retryCount,
            failedCommands: [],
            diagnosticsSummary: "Verification has not started yet."
          };

  return {
    currentStage: input.session.status,
    nextStep: resolveNextStep(input.loopState),
    planSummary:
      input.loopState.planSummary ?? "Plan is not available for this session yet.",
    progressUpdates: phaseUpdates,
    toolActivityDefault,
    hiddenToolActivityCount,
    verification,
    finalSummary: sanitizeFinalSummary(input.finalSummary)
  };
}
