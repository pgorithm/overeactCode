import * as assert from "assert";
import {
  AgentLoopController,
  type AgentSession
} from "../../agentSession";
import { buildComposerViewModel } from "../../composerViewModel";
import { ToolCallRecordStore } from "../../toolCallRecord";

suite("Composer view model", () => {
  test("exposes current stage and next step", () => {
    const loop = new AgentLoopController();
    const session: AgentSession = {
      id: "session-1",
      workspaceUri: "workspace://test",
      userRequest: "Add verification summary",
      status: "planning",
      createdAt: "2026-04-28T00:00:00.000Z",
      updatedAt: "2026-04-28T00:00:00.000Z"
    };
    const loopState = loop.begin(session.id);
    loop.markContextRetrieved(session.id);
    loop.proposePlan(session.id, "Show plan, progress and verification details.");
    const store = new ToolCallRecordStore();

    const viewModel = buildComposerViewModel({
      session,
      loopState,
      toolActivity: [],
      finalSummary: {
        changedFiles: ["src/extension.ts"],
        checksRun: ["npm run compile"],
        unresolvedIssues: [],
        assumptions: [],
        suggestedNextSteps: ["Open side composer and confirm plan block."]
      }
    });

    assert.strictEqual(viewModel.currentStage, "planning");
    assert.match(viewModel.nextStep, /plan approval/i);
    assert.match(viewModel.planSummary, /Show plan, progress/i);
    assert.ok(viewModel.progressUpdates.length >= 3);
    assert.strictEqual(store.getBySessionId(session.id).length, 0);
  });

  test("shows compact tool activity with inspectable remainder", () => {
    const loop = new AgentLoopController();
    const session: AgentSession = {
      id: "session-2",
      workspaceUri: "workspace://test",
      userRequest: "Render tool activity",
      status: "verifying",
      createdAt: "2026-04-28T00:00:00.000Z",
      updatedAt: "2026-04-28T00:00:00.000Z"
    };
    const loopState = loop.begin(session.id);
    const store = new ToolCallRecordStore();
    for (let index = 0; index < 5; index += 1) {
      store.createPendingRecord({
        sessionId: session.id,
        toolName: `tool.${index}`,
        inputSummary: "mock call"
      });
    }

    const viewModel = buildComposerViewModel({
      session,
      loopState,
      toolActivity: store.getBySessionId(session.id),
      finalSummary: {
        changedFiles: [],
        checksRun: [],
        unresolvedIssues: [],
        assumptions: [],
        suggestedNextSteps: []
      }
    });

    assert.strictEqual(viewModel.toolActivityDefault.length, 3);
    assert.strictEqual(viewModel.hiddenToolActivityCount, 2);
  });

  test("includes verification and final summary details", () => {
    const loop = new AgentLoopController();
    const session: AgentSession = {
      id: "session-3",
      workspaceUri: "workspace://test",
      userRequest: "Finalize summary",
      status: "completed",
      createdAt: "2026-04-28T00:00:00.000Z",
      updatedAt: "2026-04-28T00:00:00.000Z"
    };
    loop.begin(session.id, { maxRetryLimit: 2 });
    loop.markContextRetrieved(session.id);
    loop.proposePlan(session.id, "Implement summary rendering.");
    loop.decidePlan(session.id, "accept");
    loop.beginEditing(session.id);
    loop.finishEditing(session.id);
    const completedState = loop.runVerificationLoop(session.id, {
      failedCommands: [],
      diagnostics: {
        preExistingCount: 1,
        likelyNewCount: 0,
        summary: "Only baseline diagnostics remain."
      }
    });

    const viewModel = buildComposerViewModel({
      session,
      loopState: completedState,
      toolActivity: [],
      finalSummary: {
        changedFiles: ["src/composerViewModel.ts", "src/extension.ts"],
        checksRun: ["npm run compile", "npm test"],
        unresolvedIssues: ["Manual host validation is still required."],
        assumptions: ["User approves side composer wording."],
        suggestedNextSteps: ["Run Extension Development Host smoke scenario."]
      }
    });

    assert.strictEqual(viewModel.verification.status, "passed");
    assert.strictEqual(viewModel.finalSummary.changedFiles.length, 2);
    assert.strictEqual(viewModel.finalSummary.checksRun[1], "npm test");
    assert.match(viewModel.finalSummary.suggestedNextSteps[0], /Extension Development Host/i);
  });

  test("redacts secrets from tool activity and final summary", () => {
    const loop = new AgentLoopController();
    const session: AgentSession = {
      id: "session-4",
      workspaceUri: "workspace://test",
      userRequest: "Check privacy safety",
      status: "planning",
      createdAt: "2026-04-28T00:00:00.000Z",
      updatedAt: "2026-04-28T00:00:00.000Z"
    };
    const loopState = loop.begin(session.id);
    const store = new ToolCallRecordStore();
    store.createPendingRecord({
      sessionId: session.id,
      toolName: "provider.connectivity",
      inputSummary: "api_key=sk-secret-value"
    });

    const viewModel = buildComposerViewModel({
      session,
      loopState,
      toolActivity: store.getBySessionId(session.id),
      finalSummary: {
        changedFiles: [],
        checksRun: ["curl -H 'Authorization: Bearer secret-token-123'"],
        unresolvedIssues: ["provider error with key sk-secret-value"],
        assumptions: [],
        suggestedNextSteps: []
      }
    });

    assert.ok(
      !viewModel.toolActivityDefault[0].inputSummary.includes("sk-secret-value")
    );
    assert.ok(viewModel.toolActivityDefault[0].inputSummary.includes("[REDACTED]"));
    assert.ok(!viewModel.finalSummary.checksRun[0].includes("secret-token-123"));
    assert.ok(viewModel.finalSummary.checksRun[0].includes("[REDACTED]"));
    assert.ok(!viewModel.finalSummary.unresolvedIssues[0].includes("sk-secret-value"));
  });
});
