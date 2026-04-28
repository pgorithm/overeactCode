import * as assert from "assert";
import {
  createPatchReviewState,
  resolvePatchAfterPermission,
  resolvePatchReviewDecision
} from "../../patchReview";
import { type PatchProposal } from "../../patchProposal";

suite("Patch review UI state", () => {
  const baseProposal: PatchProposal = {
    id: "proposal-1",
    sessionId: "session-1",
    fileUri: "file:///workspace/src/extension.ts",
    diff: "@@ mock section\n-const pending = true;\n+const pending = false;",
    status: "proposed",
    createdAt: "2026-04-28T20:00:00.000Z"
  };

  test("creates patch review state from proposal", () => {
    const review = createPatchReviewState({
      proposal: baseProposal,
      toolCallId: "tool-1"
    });

    assert.strictEqual(review.sessionId, "session-1");
    assert.strictEqual(review.proposalId, "proposal-1");
    assert.strictEqual(review.toolCallId, "tool-1");
    assert.strictEqual(review.status, "proposed");
    assert.ok(review.diff.includes("@@ mock section"));
  });

  test("approve keeps patch awaiting permission when policy requires confirm", () => {
    const result = resolvePatchReviewDecision({
      decision: "approve",
      policyEvaluation: {
        decision: "confirm",
        reason: "File writes require explicit confirmation by safe default.",
        reasonCode: "safe_default_confirm_write"
      }
    });

    assert.strictEqual(result.status, "awaiting_policy_decision");
    assert.strictEqual(result.resolution, "awaiting_user_permission");
    assert.strictEqual(result.sessionSignal, "continue_execution");
  });

  test("reject marks patch rejected and emits adapt feedback", () => {
    const result = resolvePatchReviewDecision({
      decision: "reject",
      policyEvaluation: {
        decision: "confirm",
        reason: "File writes require explicit confirmation by safe default.",
        reasonCode: "safe_default_confirm_write"
      }
    });

    assert.strictEqual(result.status, "rejected");
    assert.strictEqual(result.resolution, "rejected");
    assert.strictEqual(result.sessionSignal, "blocked_adapt");
    assert.ok(result.logMessage.includes("adapt"));
  });

  test("permission approval applies patch, permission rejection keeps rejected", () => {
    const approved = resolvePatchAfterPermission({ approved: true });
    assert.strictEqual(approved.status, "applied");
    assert.strictEqual(approved.resolution, "applied");

    const rejected = resolvePatchAfterPermission({ approved: false });
    assert.strictEqual(rejected.status, "rejected");
    assert.strictEqual(rejected.resolution, "rejected");
    assert.strictEqual(rejected.sessionSignal, "blocked_adapt");
  });
});

