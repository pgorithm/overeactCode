import * as assert from "assert";
import { ContextItemStore } from "../../contextItem";
import { AgentLoopController } from "../../agentSession";
import { FileReadTool } from "../../fileReadTool";
import { FilesystemToolExecutor } from "../../filesystemToolExecutor";
import { PatchEditingBoundary } from "../../patchEditingBoundary";
import { PatchProposalStore } from "../../patchProposal";
import { ToolCallRecordStore } from "../../toolCallRecord";
import { WorkspaceSearchTool, type WorkspaceSearchApi } from "../../workspaceSearch";

suite("Filesystem tool executor", () => {
  test("creates succeeded ToolCallRecord for allowed read_file", async () => {
    const toolCallStore = new ToolCallRecordStore();
    const fileReadTool = new FileReadTool(
      {
        readFile: async () => "export const value = 1;"
      },
      new ContextItemStore()
    );
    const executor = new FilesystemToolExecutor({
      toolCallStore,
      fileReadTool,
      workspaceSearchTool: new WorkspaceSearchTool(createSearchApi()),
      patchProposalStore: new PatchProposalStore(),
      patchEditingBoundary: new PatchEditingBoundary()
    });

    const result = await executor.executeRead({
      sessionId: "session-read-1",
      sourceUri: "file:///workspace/src/extension.ts",
      reason: "Need command registration context."
    });

    assert.strictEqual(result.outcome, "succeeded");
    assert.strictEqual(result.sessionSignal, "continue");
    assert.ok(result.data);
    assert.strictEqual(result.data?.contextItem.sourceType, "file");
    assert.strictEqual(result.toolCall.toolName, "workspace.read_file");
    assert.strictEqual(result.toolCall.status, "succeeded");
    assert.strictEqual(result.toolCall.permissionDecision, "approved");
  });

  test("denied write_file returns adapt/guidance signal and denied ToolCallRecord", async () => {
    const toolCallStore = new ToolCallRecordStore();
    const loopController = new AgentLoopController();
    loopController.begin("session-write-1", { maxRetryLimit: 2 });
    loopController.markContextRetrieved("session-write-1");
    loopController.proposePlan("session-write-1", "Try to write outside workspace.");
    loopController.decidePlan("session-write-1", "accept");
    loopController.beginEditing("session-write-1");
    loopController.finishEditing("session-write-1");
    const executor = new FilesystemToolExecutor({
      toolCallStore,
      fileReadTool: new FileReadTool({
        readFile: async () => "unused"
      }),
      workspaceSearchTool: new WorkspaceSearchTool(createSearchApi()),
      patchProposalStore: new PatchProposalStore(),
      patchEditingBoundary: new PatchEditingBoundary(),
      loopController
    });

    const result = await executor.executePatchProposal({
      sessionId: "session-write-1",
      fileUri: "file:///outside/secrets.env",
      diff: "@@ -1 +1 @@\n-old\n+new",
      scope: "outside_workspace"
    });

    assert.strictEqual(result.outcome, "denied");
    assert.strictEqual(result.sessionSignal, "adapt_or_guidance");
    assert.strictEqual(result.data, null);
    assert.strictEqual(result.toolCall.toolName, "workspace.write_file");
    assert.strictEqual(result.toolCall.permissionDecision, "denied");
    assert.strictEqual(result.toolCall.status, "denied");
    const loopState = loopController.getState("session-write-1");
    assert.ok(loopState);
    assert.strictEqual(loopState?.status, "planning");
    assert.strictEqual(loopState?.retryCount, 1);
  });
});

function createSearchApi(): WorkspaceSearchApi {
  return {
    findFiles: async () => [],
    asRelativePath: () => "",
    executeWorkspaceSymbolProvider: async () => []
  };
}
