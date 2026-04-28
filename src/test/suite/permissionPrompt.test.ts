import * as assert from "assert";
import { evaluatePermissionPolicy } from "../../permissionPolicy";
import {
  buildPolicyDeniedResult,
  createPermissionPromptState,
  resolvePermissionPromptDecision
} from "../../permissionPrompt";

suite("Permission prompt view model", () => {
  test("creates confirmation prompt and approve returns user_approved", () => {
    const prompt = createPermissionPromptState({
      sessionId: "session-1",
      toolCallId: "call-1",
      actionSummary: {
        scope: "workspace",
        actionType: "write_file",
        target: "src/extension.ts"
      },
      evaluation: evaluatePermissionPolicy(
        {
          scope: "workspace",
          actionType: "write_file",
          target: "src/extension.ts"
        },
        []
      )
    });

    assert.ok(prompt, "Expected confirmation prompt for file write.");
    assert.strictEqual(prompt?.status, "awaiting_user_decision");
    const resolution = resolvePermissionPromptDecision({
      prompt: prompt!,
      decision: "approve"
    });

    assert.strictEqual(resolution.resolution, "user_approved");
    assert.strictEqual(resolution.sessionSignal, "continue_execution");
  });

  test("reject returns blocked adapt signal", () => {
    const prompt = createPermissionPromptState({
      sessionId: "session-2",
      toolCallId: "call-2",
      actionSummary: {
        scope: "workspace",
        actionType: "run_command",
        target: "npm test"
      },
      evaluation: evaluatePermissionPolicy(
        {
          scope: "workspace",
          actionType: "run_command",
          target: "npm test"
        },
        []
      )
    });

    assert.ok(prompt, "Expected confirmation prompt for command execution.");
    const resolution = resolvePermissionPromptDecision({
      prompt: prompt!,
      decision: "reject"
    });

    assert.strictEqual(resolution.resolution, "user_rejected");
    assert.strictEqual(resolution.sessionSignal, "blocked_adapt");
  });

  test("policy denied command returns blocked reason for UI", () => {
    const prompt = createPermissionPromptState({
      sessionId: "session-3",
      toolCallId: "call-3",
      actionSummary: {
        scope: "workspace",
        actionType: "run_command",
        target: "rm -rf /tmp/build"
      },
      evaluation: evaluatePermissionPolicy(
        {
          scope: "workspace",
          actionType: "run_command",
          target: "rm -rf /tmp/build"
        },
        []
      )
    });

    assert.ok(prompt, "Expected policy denied state for risky command.");
    assert.strictEqual(prompt?.status, "resolved_policy_denied");

    const result = buildPolicyDeniedResult(prompt!);
    assert.strictEqual(result.resolution, "policy_denied");
    assert.strictEqual(result.sessionSignal, "blocked_adapt");
    assert.ok(result.logMessage.includes("policy_denied"));
  });
});
