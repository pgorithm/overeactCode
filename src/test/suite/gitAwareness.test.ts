import * as assert from "assert";
import {
  GitAwarenessTool,
  GitSessionContextStore,
  type GitCommandResult,
  type GitCommandRunner
} from "../../gitAwareness";
import { evaluatePermissionPolicy } from "../../permissionPolicy";

suite("Git awareness tool adapter", () => {
  test("inspects status, diff and recent log from git command outputs", async () => {
    const commands: string[] = [];
    const tool = new GitAwarenessTool(async (args) => {
      const key = args.join(" ");
      commands.push(key);
      if (key === "status --short") {
        return success(" M src/extension.ts\n?? src/newFile.ts\n");
      }
      if (key === "diff --no-color") {
        return success("diff --git a/src/extension.ts b/src/extension.ts\n+new line");
      }
      if (key === "log -3 --pretty=format:%h%x09%s") {
        return success("abc123\tfeat: add session\nfff222\tfix: policy");
      }

      return {
        stdout: "",
        stderr: `Unexpected command: ${key}`,
        exitCode: 1
      };
    });

    const status = await tool.inspectStatus();
    const diff = await tool.inspectDiff();
    const log = await tool.inspectRecentLog(3);

    assert.deepStrictEqual(commands, [
      "status --short",
      "diff --no-color",
      "log -3 --pretty=format:%h%x09%s"
    ]);
    assert.deepStrictEqual(status.dirtyFiles, ["src/extension.ts", "src/newFile.ts"]);
    assert.strictEqual(status.hasChanges, true);
    assert.ok(diff.includes("diff --git"));
    assert.deepStrictEqual(log, [
      { hash: "abc123", subject: "feat: add session" },
      { hash: "fff222", subject: "fix: policy" }
    ]);
  });

  test("captures pre-existing dirty files in session context", async () => {
    const tool = new GitAwarenessTool(async (args) => {
      if (args.join(" ") === "status --short") {
        return success(" M src/agentSession.ts\n D src/old.ts\n");
      }

      return success("");
    });

    const store = new GitSessionContextStore();
    const snapshot = await tool.inspectStatus();
    const context = store.capturePreExistingDirtyFiles("session-1", snapshot);

    assert.deepStrictEqual(context.preExistingDirtyFiles, [
      "src/agentSession.ts",
      "src/old.ts"
    ]);

    const secondSnapshot = {
      raw: "",
      dirtyFiles: [],
      hasChanges: false
    };
    const preserved = store.capturePreExistingDirtyFiles("session-1", secondSnapshot);
    assert.deepStrictEqual(preserved.preExistingDirtyFiles, [
      "src/agentSession.ts",
      "src/old.ts"
    ]);
  });

  test("blocks git push and destructive git action", () => {
    const policyResult = evaluatePermissionPolicy(
      {
        scope: "workspace",
        actionType: "git_write",
        target: "git push --force origin main"
      },
      []
    );
    assert.strictEqual(policyResult.decision, "deny");
    assert.strictEqual(policyResult.reasonCode, "policy_denied");

    const tool = new GitAwarenessTool(createNoopRunner());
    assert.throws(
      () => tool.assertReadOnlyMvpCommand("push origin main"),
      /blocked in MVP read-only mode/
    );
    assert.throws(
      () => tool.assertReadOnlyMvpCommand("commit -m \"test\""),
      /blocked in MVP read-only mode/
    );
    assert.throws(
      () => tool.assertReadOnlyMvpCommand("reset --hard HEAD"),
      /blocked in MVP read-only mode/
    );
  });

  test("creates draft message from status diff and recent log", async () => {
    const commands: string[] = [];
    const tool = new GitAwarenessTool(async (args) => {
      const key = args.join(" ");
      commands.push(key);
      if (key === "status --short") {
        return success(" M src/extension.ts\n?? src/newFile.ts\n");
      }
      if (key === "diff --no-color") {
        return success(
          "diff --git a/src/extension.ts b/src/extension.ts\n@@ -1 +1 @@\n-old\n+new"
        );
      }
      if (key === "log -5 --pretty=format:%h%x09%s") {
        return success("abc123\tfeat: add session flow");
      }
      return {
        stdout: "",
        stderr: `Unexpected command: ${key}`,
        exitCode: 1
      };
    });

    const result = await tool.createDraftCommitMessage();

    assert.deepStrictEqual(commands, [
      "status --short",
      "diff --no-color",
      "log -5 --pretty=format:%h%x09%s"
    ]);
    assert.strictEqual(result.status.hasChanges, true);
    assert.ok(result.diff.includes("diff --git"));
    assert.strictEqual(result.recentLog[0]?.subject, "feat: add session flow");
    assert.ok(result.draftMessage.includes("Affected files: src/extension.ts, src/newFile.ts."));
    assert.ok(result.draftMessage.includes("Diff intent: touches 1 file(s), with 1 addition line(s) and 1 deletion line(s)."));
    assert.ok(result.draftMessage.includes("Recent style hint: feat: add session flow."));
  });
});

function success(stdout: string): GitCommandResult {
  return {
    stdout,
    stderr: "",
    exitCode: 0
  };
}

function createNoopRunner(): GitCommandRunner {
  return async () => success("");
}
