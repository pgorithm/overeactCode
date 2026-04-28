import * as assert from "assert";
import * as vscode from "vscode";

suite("Overeact Code Smoke Test", () => {
  test("registers open composer command", async () => {
    const extension = vscode.extensions.getExtension("overeact.overeact-code");
    assert.ok(extension, "Extension should be discoverable by VS Code.");
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("overeactCode.openComposer"));
  });
});
