import * as assert from "assert";
import {
  executeTerminalCommand,
  type CommandExecutionResult
} from "../../terminalTool";

suite("Terminal command executor", () => {
  test("captures stdout, exit code 0, and duration for successful command", async () => {
    const result = await executeTerminalCommand(
      {
        command: "npm run compile",
        policyDecision: "allow"
      },
      {
        runProcess: async () => ({
          stdout: "compiled",
          stderr: "",
          exitCode: 0,
          durationMs: 15
        })
      }
    );

    assert.strictEqual(result.status, "succeeded");
    assert.strictEqual(result.stdout, "compiled");
    assert.strictEqual(result.stderr, "");
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.durationMs, 15);
    assert.strictEqual(result.reason, null);
  });

  test("captures stderr and failed status for non-zero exit code", async () => {
    const result = await executeTerminalCommand(
      {
        command: "npm test",
        policyDecision: "allow"
      },
      {
        runProcess: async () => ({
          stdout: "",
          stderr: "tests failed",
          exitCode: 1,
          durationMs: 44
        })
      }
    );

    assert.strictEqual(result.status, "failed");
    assert.strictEqual(result.stdout, "");
    assert.strictEqual(result.stderr, "tests failed");
    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.durationMs, 44);
    assert.strictEqual(result.reason, null);
  });

  test("does not start process when command is denied", async () => {
    let processStarted = false;
    const result = await executeTerminalCommand(
      {
        command: "rm -rf /tmp/build",
        policyDecision: "deny",
        deniedReason: "Risky command is blocked by safe default policy."
      },
      {
        runProcess: async (): Promise<CommandExecutionResult> => {
          processStarted = true;
          return {
            stdout: "",
            stderr: "",
            exitCode: 0,
            durationMs: 0
          };
        }
      }
    );

    assert.strictEqual(processStarted, false);
    assert.strictEqual(result.status, "denied");
    assert.strictEqual(result.stdout, "");
    assert.strictEqual(result.stderr, "");
    assert.strictEqual(result.exitCode, null);
    assert.strictEqual(result.durationMs, 0);
    assert.strictEqual(
      result.reason,
      "Risky command is blocked by safe default policy."
    );
  });
});
