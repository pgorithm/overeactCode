import * as assert from "assert";
import { ContextItemStore } from "../../contextItem";
import { FileReadTool } from "../../fileReadTool";
import { type PermissionPolicy } from "../../permissionPolicy";

suite("File read tool and ContextItem store", () => {
  test("reads a file only after policy decision and stores reason in ContextItem", async () => {
    let readCalls = 0;
    const contextStore = new ContextItemStore();
    const tool = new FileReadTool(
      {
        readFile: async (uri: string) => {
          readCalls += 1;
          assert.strictEqual(uri, "file:///workspace/src/extension.ts");
          return "export function activate() {}";
        }
      },
      contextStore
    );

    const result = await tool.readWorkspaceFile({
      sessionId: "session-1",
      sourceUri: "file:///workspace/src/extension.ts",
      reason: "Needed command registration context for implementation."
    });

    assert.strictEqual(readCalls, 1);
    assert.strictEqual(result.policyDecision.decision, "allow");
    assert.strictEqual(result.contextItem.sourceType, "file");
    assert.strictEqual(
      result.contextItem.reason,
      "Needed command registration context for implementation."
    );
    assert.strictEqual(result.contextItem.rawContent, "export function activate() {}");
    assert.strictEqual(result.contextItem.summary, null);
  });

  test("does not execute read when policy requires confirmation but user did not confirm", async () => {
    let readCalls = 0;
    const policies: PermissionPolicy[] = [
      {
        scope: "workspace",
        actionType: "read_file",
        pattern: "*",
        decision: "confirm",
        reason: "Read requires explicit user confirmation."
      }
    ];
    const tool = new FileReadTool({
      readFile: async () => {
        readCalls += 1;
        return "should-not-be-read";
      }
    });

    await assert.rejects(
      () =>
        tool.readWorkspaceFile({
          sessionId: "session-2",
          sourceUri: "file:///workspace/src/providerConfiguration.ts",
          reason: "Need provider defaults.",
          policies
        }),
      /requires confirmation/i
    );

    assert.strictEqual(readCalls, 0);
  });

  test("stores summary context instead of raw content for oversized files", async () => {
    const oversized = "A".repeat(5000);
    const contextStore = new ContextItemStore();
    const tool = new FileReadTool(
      {
        readFile: async () => oversized
      },
      contextStore
    );

    const result = await tool.readWorkspaceFile({
      sessionId: "session-3",
      sourceUri: "file:///workspace/src/largeFile.ts",
      reason: "Need high-level structure only.",
      maxRawContentChars: 1000
    });

    assert.strictEqual(result.contextItem.rawContent, null);
    assert.ok(result.contextItem.summary);
    assert.ok(
      result.contextItem.summary?.includes("Summarized oversized file content"),
      "summary should explain that raw content was replaced"
    );
  });
});
