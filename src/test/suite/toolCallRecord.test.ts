import * as assert from "assert";
import {
  TOOL_CALL_STATUSES,
  ToolCallRecordStore
} from "../../toolCallRecord";

suite("ToolCallRecord model", () => {
  test("supports required tool call statuses", () => {
    assert.deepStrictEqual(TOOL_CALL_STATUSES, [
      "pending",
      "approved",
      "denied",
      "running",
      "succeeded",
      "failed"
    ]);
  });

  test("tracks approved tool call lifecycle with timestamps", () => {
    const store = new ToolCallRecordStore();
    const pending = store.createPendingRecord({
      id: "call-1",
      sessionId: "session-1",
      toolName: "workspace.search",
      inputSummary: "Find relevant files"
    });

    assert.strictEqual(pending.status, "pending");
    assert.strictEqual(pending.permissionDecision, "pending");
    assert.strictEqual(pending.startedAt, null);
    assert.strictEqual(pending.finishedAt, null);

    const approved = store.setPermissionDecision(
      pending.id,
      "approved",
      () => "2026-04-28T18:30:00.000Z"
    );
    assert.strictEqual(approved.status, "approved");
    assert.strictEqual(approved.permissionDecision, "approved");
    assert.strictEqual(approved.finishedAt, null);

    const running = store.markRunning(approved.id, () =>
      "2026-04-28T18:30:01.000Z"
    );
    assert.strictEqual(running.status, "running");
    assert.strictEqual(running.startedAt, "2026-04-28T18:30:01.000Z");
    assert.strictEqual(running.finishedAt, null);

    const completed = store.markFinished(
      running.id,
      "succeeded",
      "Found 3 files for planning context.",
      () => "2026-04-28T18:30:02.000Z"
    );
    assert.strictEqual(completed.status, "succeeded");
    assert.strictEqual(completed.outputSummary, "Found 3 files for planning context.");
    assert.strictEqual(completed.startedAt, "2026-04-28T18:30:01.000Z");
    assert.strictEqual(completed.finishedAt, "2026-04-28T18:30:02.000Z");
  });

  test("marks denied tool call without running", () => {
    const store = new ToolCallRecordStore();
    const pending = store.createPendingRecord({
      id: "call-2",
      sessionId: "session-2",
      toolName: "run_command",
      inputSummary: "Run npm test"
    });

    const denied = store.setPermissionDecision(
      pending.id,
      "denied",
      () => "2026-04-28T18:40:00.000Z"
    );

    assert.strictEqual(denied.status, "denied");
    assert.strictEqual(denied.permissionDecision, "denied");
    assert.strictEqual(denied.startedAt, null);
    assert.strictEqual(denied.finishedAt, "2026-04-28T18:40:00.000Z");
  });

  test("redacts secrets in tool call summaries", () => {
    const store = new ToolCallRecordStore();
    const pending = store.createPendingRecord({
      id: "call-3",
      sessionId: "session-3",
      toolName: "provider.connectivity",
      inputSummary: "Check provider with api_key=sk-secret-abc123"
    });
    const approved = store.setPermissionDecision(pending.id, "approved");
    const running = store.markRunning(approved.id);
    const completed = store.markFinished(
      running.id,
      "failed",
      "Authorization: Bearer tokensecret123 failed."
    );

    assert.ok(!pending.inputSummary.includes("sk-secret-abc123"));
    assert.ok(pending.inputSummary.includes("[REDACTED]"));
    assert.ok(!completed.outputSummary.includes("tokensecret123"));
    assert.ok(completed.outputSummary.includes("[REDACTED]"));
  });
});
