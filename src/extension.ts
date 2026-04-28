import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    "overeactCode.openComposer",
    async () => {
      await vscode.window.showInformationMessage("Overeact Code composer is coming soon.");
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
