import * as assert from "assert";
import { AgentLoopController } from "../../agentSession";

suite("Agent loop state machine", () => {
  test("moves through main phases in expected order", () => {
    const loop = new AgentLoopController();
    const sessionId = "loop-1";

    loop.begin(sessionId);
    loop.markContextRetrieved(sessionId);
    loop.proposePlan(sessionId, "Update extension message handling.");
    loop.decidePlan(sessionId, "accept");
    loop.beginEditing(sessionId);
    loop.finishEditing(sessionId);
    loop.finishVerification(sessionId, "completed");
    const finalState = loop.publishSummary(
      sessionId,
      "Completed requested changes and verification."
    );

    assert.strictEqual(finalState.status, "completed");
    assert.deepStrictEqual(finalState.phaseHistory, [
      "task_understood",
      "context_retrieved",
      "plan_proposed",
      "plan_approved",
      "editing_started",
      "editing_finished",
      "verification_finished",
      "summary_published"
    ]);
  });

  test("requires retrieval before plan and editing", () => {
    const loop = new AgentLoopController();
    const sessionId = "loop-2";

    loop.begin(sessionId);
    assert.strictEqual(loop.canReadLargeFiles(sessionId), false);
    assert.throws(
      () => loop.proposePlan(sessionId, "Plan before retrieval."),
      /Retrieval must complete/
    );
    assert.throws(
      () => loop.beginEditing(sessionId),
      /Retrieval must complete/
    );

    loop.markContextRetrieved(sessionId);
    assert.strictEqual(loop.canReadLargeFiles(sessionId), true);
    loop.proposePlan(sessionId, "Plan after retrieval.");
    loop.decidePlan(sessionId, "accept");
    const editingState = loop.beginEditing(sessionId);
    assert.strictEqual(editingState.status, "editing");
  });

  test("waits for plan approval when user requests changes", () => {
    const loop = new AgentLoopController();
    const sessionId = "loop-3";

    loop.begin(sessionId);
    loop.markContextRetrieved(sessionId);
    loop.proposePlan(sessionId, "Initial plan for user task.");
    const requestedChanges = loop.decidePlan(sessionId, "request_changes");
    assert.strictEqual(requestedChanges.planApproved, false);
    assert.strictEqual(requestedChanges.lastPlanDecision, "request_changes");
    assert.throws(
      () => loop.beginEditing(sessionId),
      /Editing cannot start before plan approval/
    );

    loop.proposePlan(sessionId, "Revised plan after feedback.");
    const accepted = loop.decidePlan(sessionId, "accept");
    assert.strictEqual(accepted.planApproved, true);

    const editingState = loop.beginEditing(sessionId);
    assert.strictEqual(editingState.status, "editing");
  });

  test("captures verification feedback and returns to planning for targeted retry", () => {
    const loop = new AgentLoopController();
    const sessionId = "loop-4";

    loop.begin(sessionId, { maxRetryLimit: 2 });
    loop.markContextRetrieved(sessionId);
    loop.proposePlan(sessionId, "Implement feature and verify.");
    loop.decidePlan(sessionId, "accept");
    loop.beginEditing(sessionId);
    loop.finishEditing(sessionId);

    const stateAfterFailure = loop.handleVerificationFailure(sessionId, {
      failedCommands: [
        {
          command: "npm test",
          stdout: "",
          stderr: "1 failing",
          exitCode: 1,
          durationMs: 840
        }
      ],
      diagnostics: {
        preExistingCount: 2,
        likelyNewCount: 1,
        summary: "1 likely new TypeScript error introduced by recent changes."
      },
      retryGuidance: "Fix the new TS error and rerun tests before next retry."
    });

    assert.strictEqual(stateAfterFailure.status, "planning");
    assert.strictEqual(stateAfterFailure.retryCount, 1);
    assert.strictEqual(stateAfterFailure.planApproved, false);
    assert.ok(stateAfterFailure.lastVerificationFeedback);
    assert.strictEqual(
      stateAfterFailure.lastVerificationFeedback?.failedCommands[0].command,
      "npm test"
    );
    assert.strictEqual(
      stateAfterFailure.lastVerificationFeedback?.diagnostics.likelyNewCount,
      1
    );
    assert.strictEqual(
      stateAfterFailure.lastVerificationFeedback?.retryGuidance,
      "Fix the new TS error and rerun tests before next retry."
    );
  });

  test("provides failed command and diagnostics feedback before retry", () => {
    const loop = new AgentLoopController();
    const sessionId = "loop-4b";

    loop.begin(sessionId, { maxRetryLimit: 2 });
    loop.markContextRetrieved(sessionId);
    loop.proposePlan(sessionId, "Implement feature and verify.");
    loop.decidePlan(sessionId, "accept");
    loop.beginEditing(sessionId);
    loop.finishEditing(sessionId);

    const stateAfterFailure = loop.runVerificationLoop(sessionId, {
      failedCommands: [
        {
          command: "npm test",
          stdout: "",
          stderr: "1 failing",
          exitCode: 1,
          durationMs: 420
        }
      ],
      diagnostics: {
        preExistingCount: 1,
        likelyNewCount: 2,
        summary: "2 likely new diagnostics after patch apply."
      }
    });

    assert.strictEqual(stateAfterFailure.status, "planning");
    assert.strictEqual(stateAfterFailure.retryCount, 1);
    assert.ok(stateAfterFailure.lastVerificationFeedback);
    assert.match(
      stateAfterFailure.lastVerificationFeedback?.retryGuidance ?? "",
      /npm test/
    );
    assert.match(
      stateAfterFailure.lastVerificationFeedback?.retryGuidance ?? "",
      /2 likely new diagnostics/
    );
  });

  test("completes verification after successful retry and publishes summary", () => {
    const loop = new AgentLoopController();
    const sessionId = "loop-4c";

    loop.begin(sessionId, { maxRetryLimit: 2 });
    loop.markContextRetrieved(sessionId);
    loop.proposePlan(sessionId, "Initial implementation pass.");
    loop.decidePlan(sessionId, "accept");
    loop.beginEditing(sessionId);
    loop.finishEditing(sessionId);

    const failedAttempt = loop.runVerificationLoop(sessionId, {
      failedCommands: [
        {
          command: "npm run compile",
          stdout: "",
          stderr: "TS2322",
          exitCode: 2,
          durationMs: 130
        }
      ],
      diagnostics: {
        preExistingCount: 0,
        likelyNewCount: 1,
        summary: "One new TS error."
      }
    });
    assert.strictEqual(failedAttempt.status, "planning");

    loop.proposePlan(sessionId, "Fix compile error and rerun checks.");
    loop.decidePlan(sessionId, "accept");
    loop.beginEditing(sessionId);
    loop.finishEditing(sessionId);

    const successAttempt = loop.runVerificationLoop(sessionId, {
      failedCommands: [],
      diagnostics: {
        preExistingCount: 1,
        likelyNewCount: 0,
        summary: "Only baseline diagnostics remain."
      }
    });
    assert.strictEqual(successAttempt.status, "completed");
    assert.strictEqual(successAttempt.lastVerificationFeedback, null);

    const summarized = loop.publishSummary(
      sessionId,
      "Verification succeeded after one targeted retry."
    );
    assert.strictEqual(summarized.summary, "Verification succeeded after one targeted retry.");
    assert.deepStrictEqual(summarized.phaseHistory.slice(-2), [
      "verification_finished",
      "summary_published"
    ]);
  });

  test("moves session to blocked when retry limit is exhausted", () => {
    const loop = new AgentLoopController();
    const sessionId = "loop-5";

    loop.begin(sessionId, { maxRetryLimit: 1 });
    loop.markContextRetrieved(sessionId);
    loop.proposePlan(sessionId, "Apply risky refactor.");
    loop.decidePlan(sessionId, "accept");
    loop.beginEditing(sessionId);
    loop.finishEditing(sessionId);

    loop.handleVerificationFailure(sessionId, {
      failedCommands: [],
      diagnostics: {
        preExistingCount: 0,
        likelyNewCount: 1,
        summary: "First retry requested."
      },
      retryGuidance: "Address diagnostics and retry."
    });
    const exhausted = loop.handleVerificationFailure(sessionId, {
      failedCommands: [],
      diagnostics: {
        preExistingCount: 0,
        likelyNewCount: 2,
        summary: "Retry limit exceeded."
      },
      retryGuidance: "Escalate with unresolved blockers."
    });

    assert.strictEqual(exhausted.status, "blocked");
    assert.strictEqual(exhausted.retryCount, 2);
    assert.strictEqual(
      exhausted.phaseHistory[exhausted.phaseHistory.length - 1],
      "verification_finished"
    );
  });

  test("can mark session as failed when retry limit is exhausted", () => {
    const loop = new AgentLoopController();
    const sessionId = "loop-5b";

    loop.begin(sessionId, { maxRetryLimit: 1 });
    loop.markContextRetrieved(sessionId);
    loop.proposePlan(sessionId, "Attempt risky migration.");
    loop.decidePlan(sessionId, "accept");
    loop.beginEditing(sessionId);
    loop.finishEditing(sessionId);

    loop.runVerificationLoop(sessionId, {
      failedCommands: [
        {
          command: "npm test",
          stdout: "",
          stderr: "failing",
          exitCode: 1,
          durationMs: 500
        }
      ],
      diagnostics: {
        preExistingCount: 0,
        likelyNewCount: 1,
        summary: "Initial failure."
      }
    });
    const failedState = loop.runVerificationLoop(
      sessionId,
      {
        failedCommands: [
          {
            command: "npm test",
            stdout: "",
            stderr: "still failing",
            exitCode: 1,
            durationMs: 510
          }
        ],
        diagnostics: {
          preExistingCount: 0,
          likelyNewCount: 1,
          summary: "Retry exhausted."
        }
      },
      { terminalStatusOnLimit: "failed" }
    );

    assert.strictEqual(failedState.status, "failed");
    assert.strictEqual(failedState.retryCount, 2);
  });
});
