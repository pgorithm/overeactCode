export type TerminalPolicyDecision = "allow" | "confirm" | "deny";

export interface ExecuteTerminalCommandInput {
  command: string;
  policyDecision: TerminalPolicyDecision;
  deniedReason?: string;
}

export interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface ExecuteTerminalCommandResult {
  status: "succeeded" | "failed" | "denied";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  reason: string | null;
}

export interface TerminalExecutionDependencies {
  runProcess: (command: string) => Promise<CommandExecutionResult>;
}

export async function executeTerminalCommand(
  input: ExecuteTerminalCommandInput,
  dependencies: TerminalExecutionDependencies
): Promise<ExecuteTerminalCommandResult> {
  if (input.policyDecision === "deny") {
    return {
      status: "denied",
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: 0,
      reason:
        input.deniedReason ?? "Command is denied by policy and was not started."
    };
  }

  const result = await dependencies.runProcess(input.command);
  return {
    status: result.exitCode === 0 ? "succeeded" : "failed",
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    reason: null
  };
}
