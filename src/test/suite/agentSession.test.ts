import * as assert from "assert";
import { AgentSessionStore, AGENT_SESSION_STATUSES } from "../../agentSession";

suite("AgentSession model", () => {
  test("creates session with PRD fields and planning status", () => {
    const store = new AgentSessionStore();
    const session = store.createSession({
      id: "session-1",
      workspaceUri: "file:///workspace",
      userRequest: "Add session lifecycle state"
    });

    assert.strictEqual(session.id, "session-1");
    assert.strictEqual(session.workspaceUri, "file:///workspace");
    assert.strictEqual(session.userRequest, "Add session lifecycle state");
    assert.strictEqual(session.status, "planning");
    assert.ok(session.createdAt.length > 0);
    assert.strictEqual(session.updatedAt, session.createdAt);
  });

  test("supports all required statuses type-safely", () => {
    assert.deepStrictEqual(AGENT_SESSION_STATUSES, [
      "idle",
      "planning",
      "editing",
      "verifying",
      "blocked",
      "completed",
      "failed"
    ]);
  });

  test("updates session status and refreshed updatedAt", () => {
    const store = new AgentSessionStore();
    const session = store.createSession({
      id: "session-2",
      workspaceUri: "file:///workspace",
      userRequest: "Write tests for session transitions"
    });

    const updated = store.updateStatus(session.id, "verifying", () =>
      "2026-04-28T15:10:00.000Z"
    );

    assert.strictEqual(updated.status, "verifying");
    assert.strictEqual(updated.createdAt, session.createdAt);
    assert.strictEqual(updated.updatedAt, "2026-04-28T15:10:00.000Z");
  });
});
