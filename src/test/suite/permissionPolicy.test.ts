import * as assert from "assert";
import {
  evaluatePermissionPolicy,
  type PermissionPolicy
} from "../../permissionPolicy";

suite("Permission policy evaluator", () => {
  test("allows workspace read_file by safe default", () => {
    const result = evaluatePermissionPolicy(
      {
        scope: "workspace",
        actionType: "read_file",
        target: "src/extension.ts"
      },
      []
    );

    assert.strictEqual(result.decision, "allow");
    assert.strictEqual(result.reasonCode, "safe_default_allow_read_workspace");
  });

  test("requires confirmation for run_command without allow rule", () => {
    const result = evaluatePermissionPolicy(
      {
        scope: "workspace",
        actionType: "run_command",
        target: "npm test"
      },
      []
    );

    assert.strictEqual(result.decision, "confirm");
    assert.strictEqual(result.reasonCode, "safe_default_confirm_command");
  });

  test("deny policy blocks matching action with policy_denied", () => {
    const policies: PermissionPolicy[] = [
      {
        scope: "workspace",
        actionType: "run_command",
        pattern: "git push *",
        decision: "deny",
        reason: "No remote writes allowed in this flow."
      }
    ];

    const result = evaluatePermissionPolicy(
      {
        scope: "workspace",
        actionType: "run_command",
        target: "git push origin main"
      },
      policies
    );

    assert.strictEqual(result.decision, "deny");
    assert.strictEqual(result.reasonCode, "policy_denied");
    assert.ok(result.reason.includes("No remote writes allowed"));
  });

  test("explicit allow policy returns explainable reason", () => {
    const policies: PermissionPolicy[] = [
      {
        scope: "workspace",
        actionType: "run_command",
        pattern: "npm run *",
        decision: "allow",
        reason: "Project scripts are allowed."
      }
    ];

    const result = evaluatePermissionPolicy(
      {
        scope: "workspace",
        actionType: "run_command",
        target: "npm run compile"
      },
      policies
    );

    assert.strictEqual(result.decision, "allow");
    assert.strictEqual(result.reasonCode, "matched_policy");
    assert.ok(result.reason.includes("Project scripts are allowed."));
  });
});
