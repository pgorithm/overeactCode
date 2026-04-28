import * as vscode from "vscode";
import { AgentSessionStore } from "./agentSession";
import {
  ProviderSecretStorageAdapter,
  saveProviderConfiguration,
  sanitizeErrorMessage
} from "./providerConfiguration";

const COMPOSER_VIEW_ID = "overeactCode.composerView";

class OvereactComposerViewProvider implements vscode.WebviewViewProvider {
  public constructor(
    private readonly sessionStore: AgentSessionStore,
    private readonly getWorkspaceUri: () => string
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = {
      enableScripts: true
    };
    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (!isCreateSessionMessage(message)) {
        return;
      }

      const userRequest = message.userRequest.trim();
      if (userRequest.length === 0) {
        void vscode.window.showWarningMessage(
          "Describe your request before creating a session."
        );
        return;
      }

      const session = this.sessionStore.createSession({
        workspaceUri: this.getWorkspaceUri(),
        userRequest
      });
      void webviewView.webview.postMessage({
        type: "sessionCreated",
        session
      });
    });
    webviewView.webview.html = this.getHtml();
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Overeact Code</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 12px;
    }
    .section {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 12px;
      margin-bottom: 6px;
      color: var(--vscode-descriptionForeground);
    }
    textarea {
      width: 100%;
      min-height: 84px;
      box-sizing: border-box;
      resize: vertical;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 8px;
    }
    button {
      margin-top: 8px;
    }
    .empty-state {
      border: 1px dashed var(--vscode-panel-border);
      border-radius: 4px;
      padding: 12px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .note {
      font-size: 12px;
      line-height: 1.4;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="section">
    <label for="taskInput">Task for Overeact Code</label>
    <textarea id="taskInput" placeholder="Describe what you want to build or fix..."></textarea>
    <button id="createSessionButton">Start session</button>
  </div>
  <div class="section">
    <label>Agent progress</label>
    <div class="empty-state" id="progressState">No active agent run yet. Progress updates will appear here in future tasks.</div>
  </div>
  <div class="note">Inline edit mode is not included in MVP yet.</div>
  <script>
    const vscode = acquireVsCodeApi();
    const taskInput = document.getElementById("taskInput");
    const createSessionButton = document.getElementById("createSessionButton");
    const progressState = document.getElementById("progressState");

    createSessionButton.addEventListener("click", () => {
      vscode.postMessage({
        type: "createSession",
        userRequest: taskInput.value
      });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || message.type !== "sessionCreated" || !message.session) {
        return;
      }

      progressState.textContent = "Session " + message.session.id + " created with status " + message.session.status + ".";
    });
  </script>
</body>
</html>`;
  }
}

interface CreateSessionMessage {
  type: "createSession";
  userRequest: string;
}

function isCreateSessionMessage(value: unknown): value is CreateSessionMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "userRequest" in value &&
    (value as { type: unknown }).type === "createSession" &&
    typeof (value as { userRequest: unknown }).userRequest === "string"
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const secretStorage = new ProviderSecretStorageAdapter(context.secrets);
  const sessionStore = new AgentSessionStore();
  const viewProvider = new OvereactComposerViewProvider(sessionStore, () =>
    vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? "workspace://unknown"
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(COMPOSER_VIEW_ID, viewProvider)
  );

  const disposable = vscode.commands.registerCommand(
    "overeactCode.openComposer",
    async () => {
      await vscode.commands.executeCommand("workbench.view.explorer");
      await vscode.commands.executeCommand(`${COMPOSER_VIEW_ID}.focus`);
    }
  );

  const configureProvider = vscode.commands.registerCommand(
    "overeactCode.configureProvider",
    async () => {
      const config = vscode.workspace.getConfiguration("overeactCode.provider");
      const baseUrl = await vscode.window.showInputBox({
        prompt: "Provider base URL",
        value: config.get<string>("baseUrl") ?? ""
      });

      if (typeof baseUrl !== "string") {
        return;
      }

      const displayName = await vscode.window.showInputBox({
        prompt: "Provider display name",
        value: config.get<string>("displayName") ?? ""
      });

      if (typeof displayName !== "string") {
        return;
      }

      const defaultModel = await vscode.window.showInputBox({
        prompt: "Default model",
        value: config.get<string>("defaultModel") ?? ""
      });

      if (typeof defaultModel !== "string") {
        return;
      }

      await saveProviderConfiguration(config, {
        baseUrl,
        displayName,
        defaultModel
      });
      vscode.window.showInformationMessage("Overeact provider settings updated.");
    }
  );

  const configureProviderKey = vscode.commands.registerCommand(
    "overeactCode.configureProviderApiKey",
    async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: "Provider API key",
        password: true,
        ignoreFocusOut: true
      });

      if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
        return;
      }

      try {
        await secretStorage.saveApiKey(apiKey);
        vscode.window.showInformationMessage("Provider API key saved securely.");
      } catch (error) {
        vscode.window.showErrorMessage(
          sanitizeErrorMessage(error, [apiKey])
        );
      }
    }
  );

  const createSession = vscode.commands.registerCommand(
    "overeactCode.createSession",
    async (requestArg?: string) => {
      const userRequest =
        typeof requestArg === "string"
          ? requestArg
          : await vscode.window.showInputBox({
              prompt: "Task for Overeact Code session",
              placeHolder: "Describe what you want to build or fix..."
            });

      if (typeof userRequest !== "string" || userRequest.trim().length === 0) {
        return;
      }

      const session = sessionStore.createSession({
        workspaceUri:
          vscode.workspace.workspaceFolders?.[0]?.uri.toString() ??
          "workspace://unknown",
        userRequest
      });
      void vscode.window.showInformationMessage(
        `Agent session ${session.id} created with status ${session.status}.`
      );
    }
  );

  context.subscriptions.push(disposable, configureProvider, configureProviderKey);
  context.subscriptions.push(createSession);
}

export function deactivate(): void {}
