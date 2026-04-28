import * as assert from "assert";
import {
  PATCH_PROPOSAL_STATUSES,
  PatchProposalStore
} from "../../patchProposal";
import { PatchEditingBoundary } from "../../patchEditingBoundary";

suite("PatchProposal model", () => {
  test("supports required patch proposal statuses", () => {
    assert.deepStrictEqual(PATCH_PROPOSAL_STATUSES, [
      "proposed",
      "applied",
      "rejected",
      "superseded"
    ]);
  });

  test("stores structured diff content for file proposal", () => {
    const store = new PatchProposalStore();
    const proposal = store.createProposal(
      {
        id: "patch-1",
        sessionId: "session-1",
        fileUri: "file:///workspace/src/example.ts",
        diff: [
          "@@ function example()",
          "- return oldValue;",
          "+ return newValue;"
        ].join("\n")
      },
      () => "2026-04-28T19:30:00.000Z"
    );

    assert.strictEqual(proposal.id, "patch-1");
    assert.strictEqual(proposal.sessionId, "session-1");
    assert.strictEqual(proposal.fileUri, "file:///workspace/src/example.ts");
    assert.ok(proposal.diff.includes("@@ function example()"));
    assert.ok(proposal.diff.includes("- return oldValue;"));
    assert.ok(proposal.diff.includes("+ return newValue;"));
    assert.strictEqual(proposal.status, "proposed");
    assert.strictEqual(proposal.createdAt, "2026-04-28T19:30:00.000Z");
  });

  test("updates patch proposal lifecycle statuses", () => {
    const store = new PatchProposalStore();
    const proposal = store.createProposal({
      id: "patch-2",
      sessionId: "session-2",
      fileUri: "file:///workspace/src/lifecycle.ts",
      diff: "@@ -1,1 +1,1 @@\n-old\n+new"
    });

    const applied = store.updateStatus(proposal.id, "applied");
    assert.strictEqual(applied.status, "applied");

    const superseded = store.updateStatus(proposal.id, "superseded");
    assert.strictEqual(superseded.status, "superseded");

    const rejected = store.updateStatus(proposal.id, "rejected");
    assert.strictEqual(rejected.status, "rejected");
  });

  test("rejects edit attempt without patch proposal", () => {
    const boundary = new PatchEditingBoundary();

    assert.throws(
      () =>
        boundary.rejectBlindTextReplacement({
          fileUri: "file:///workspace/src/unsafe.ts",
          replacementText: "console.log('unsafe replace');"
        }),
      /Blind text replacement is not allowed/
    );
  });
});
