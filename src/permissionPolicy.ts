export const PERMISSION_DECISIONS = ["allow", "confirm", "deny"] as const;

export type PermissionDecision = (typeof PERMISSION_DECISIONS)[number];

export type PermissionScope = "workspace" | "outside_workspace" | "global";

export type PermissionActionType =
  | "read_file"
  | "write_file"
  | "run_command"
  | "git_write";

export interface PermissionPolicy {
  scope: PermissionScope;
  actionType: PermissionActionType;
  pattern: string;
  decision: PermissionDecision;
  reason?: string;
}

export interface PermissionEvaluationInput {
  scope: PermissionScope;
  actionType: PermissionActionType;
  target: string;
}

export interface PermissionEvaluationResult {
  decision: PermissionDecision;
  reason: string;
  reasonCode: string;
}

export function evaluatePermissionPolicy(
  input: PermissionEvaluationInput,
  policies: readonly PermissionPolicy[]
): PermissionEvaluationResult {
  for (const policy of policies) {
    if (
      policy.scope === input.scope &&
      policy.actionType === input.actionType &&
      patternMatches(policy.pattern, input.target)
    ) {
      return {
        decision: policy.decision,
        reason:
          policy.reason ??
          `Matched policy ${policy.actionType}:${policy.scope}:${policy.pattern}.`,
        reasonCode:
          policy.decision === "deny" ? "policy_denied" : "matched_policy"
      };
    }
  }

  if (input.actionType === "read_file" && input.scope === "workspace") {
    return {
      decision: "allow",
      reason: "Safe default allows reading files inside workspace.",
      reasonCode: "safe_default_allow_read_workspace"
    };
  }

  if (input.actionType === "write_file") {
    if (input.scope === "outside_workspace") {
      return {
        decision: "deny",
        reason: "Writing files outside workspace is denied by safe default.",
        reasonCode: "policy_denied"
      };
    }

    return {
      decision: "confirm",
      reason: "File writes require explicit confirmation by safe default.",
      reasonCode: "safe_default_confirm_write"
    };
  }

  if (input.actionType === "run_command") {
    if (isRiskyCommand(input.target)) {
      return {
        decision: "deny",
        reason: "Risky command is blocked by safe default policy.",
        reasonCode: "policy_denied"
      };
    }

    return {
      decision: "confirm",
      reason: "Terminal commands require explicit confirmation by safe default.",
      reasonCode: "safe_default_confirm_command"
    };
  }

  if (input.actionType === "git_write") {
    if (isRiskyGitWrite(input.target)) {
      return {
        decision: "deny",
        reason: "Risky git write is blocked by safe default policy.",
        reasonCode: "policy_denied"
      };
    }

    return {
      decision: "confirm",
      reason: "Git write actions require explicit confirmation by safe default.",
      reasonCode: "safe_default_confirm_git_write"
    };
  }

  return {
    decision: "confirm",
    reason: "Action requires explicit confirmation by default.",
    reasonCode: "safe_default_confirm"
  };
}

function patternMatches(pattern: string, value: string): boolean {
  if (pattern === "*") {
    return true;
  }

  const escapedPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const regex = new RegExp(`^${escapedPattern}$`, "i");
  return regex.test(value);
}

function isRiskyCommand(command: string): boolean {
  return /(?:^|\s)(rm\s+-rf|del\s+\/f|shutdown|reboot|format\s+[a-z]:)/i.test(
    command
  );
}

function isRiskyGitWrite(command: string): boolean {
  return /(reset\s+--hard|push\s+--force|clean\s+-fd)/i.test(command);
}
