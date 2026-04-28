import * as assert from "assert";
import { ensureTargetedContextSelection } from "../../privacyGuards";

suite("Privacy guards", () => {
  test("requires retrieval-first before provider context selection", () => {
    assert.throws(
      () =>
        ensureTargetedContextSelection({
          retrievalCompleted: false,
          selectedContextItems: ["src/extension.ts#selection"]
        }),
      /Retrieval-first policy/
    );
  });

  test("requires at least one targeted context item", () => {
    assert.throws(
      () =>
        ensureTargetedContextSelection({
          retrievalCompleted: true,
          selectedContextItems: []
        }),
      /select at least one targeted context item/i
    );
  });

  test("returns sanitized targeted context items", () => {
    const selected = ensureTargetedContextSelection({
      retrievalCompleted: true,
      selectedContextItems: [
        "src/provider.ts#L10 api_key=sk-test-value",
        "curl with Authorization: Bearer tokenvalue123"
      ]
    });

    assert.strictEqual(selected.length, 2);
    assert.ok(selected[0].includes("[REDACTED]"));
    assert.ok(!selected[0].includes("sk-test-value"));
    assert.ok(selected[1].includes("[REDACTED]"));
    assert.ok(!selected[1].includes("tokenvalue123"));
  });
});
