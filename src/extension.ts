import * as vscode from "vscode";
import { AgentSessionStore } from "./agentSession";
import { DiagnosticsTool, type WorkspaceDiagnostic } from "./diagnostics";
import { evaluatePermissionPolicy } from "./permissionPolicy";
import {
  buildPolicyDeniedResult,
  createPermissionPromptState,
  resolvePermissionPromptDecision,
  type PermissionPromptState
} from "./permissionPrompt";
import { ToolCallRecordStore } from "./toolCallRecord";
import {
  ProviderSecretStorageAdapter,
  saveProviderConfiguration,
  sanitizeErrorMessage
} from "./providerConfiguration";

const COMPOSER_VIEW_ID = "overeactCode.composerView";

class OvereactComposerViewProvider implements vscode.WebviewViewProvider {
  private readonly permissionPromptsBySession = new Map<string, PermissionPromptState>();

  public constructor(
    private readonly sessionStore: AgentSessionStore,
    private readonly toolCallStore: ToolCallRecordStore,
    private readonly diagnosticsTool: DiagnosticsTool,
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
      if (isPermissionDecisionMessage(message)) {
        this.handlePermissionDecision(webviewView, message);
        return;
      }

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
      const toolActivity = this.createMockToolActivity(session.id);
      void webviewView.webview.postMessage({
        type: "sessionCreated",
        session,
        toolActivity,
        diagnosticsSummary: this.createMockDiagnosticsSummary(),
        permissionPrompt: this.permissionPromptsBySession.get(session.id) ?? null
      });
    });
    webviewView.webview.html = this.getHtml();
  }

  private createMockToolActivity(sessionId: string) {
    const pendingRecord = this.toolCallStore.createPendingRecord({
      sessionId,
      toolName: "workspace.search",
      inputSummary: "Search TypeScript files related to the request."
    });

    this.toolCallStore.setPermissionDecision(
      pendingRecord.id,
      "approved",
      () => "2026-04-28T18:00:00.000Z"
    );
    this.toolCallStore.markRunning(pendingRecord.id, () =>
      "2026-04-28T18:00:01.000Z"
    );
    this.toolCallStore.markFinished(
      pendingRecord.id,
      "succeeded",
      "Found 4 relevant files for the initial plan.",
      () => "2026-04-28T18:00:02.000Z"
    );

    const fileWriteRecord = this.toolCallStore.createPendingRecord({
      sessionId,
      toolName: "workspace.write_file",
      inputSummary: "Apply patch proposal to src/extension.ts."
    });
    const confirmPrompt = createPermissionPromptState({
      sessionId,
      toolCallId: fileWriteRecord.id,
      actionSummary: {
        scope: "workspace",
        actionType: "write_file",
        target: "src/extension.ts"
      },
      evaluation: evaluatePermissionPolicy(
        {
          scope: "workspace",
          actionType: "write_file",
          target: "src/extension.ts"
        },
        []
      )
    });
    if (confirmPrompt) {
      this.permissionPromptsBySession.set(sessionId, confirmPrompt);
    }

    const deniedRecord = this.toolCallStore.createPendingRecord({
      sessionId,
      toolName: "run_command",
      inputSummary: "Run rm -rf /tmp/build"
    });
    const deniedPrompt = createPermissionPromptState({
      sessionId,
      toolCallId: deniedRecord.id,
      actionSummary: {
        scope: "workspace",
        actionType: "run_command",
        target: "rm -rf /tmp/build"
      },
      evaluation: evaluatePermissionPolicy(
        {
          scope: "workspace",
          actionType: "run_command",
          target: "rm -rf /tmp/build"
        },
        []
      )
    });
    if (deniedPrompt?.status === "resolved_policy_denied") {
      this.toolCallStore.setPermissionDecision(
        deniedRecord.id,
        "denied",
        () => "2026-04-28T18:00:03.000Z"
      );
      const deniedResult = buildPolicyDeniedResult(deniedPrompt);
      this.toolCallStore.markFinished(
        deniedRecord.id,
        "failed",
        deniedResult.logMessage,
        () => "2026-04-28T18:00:04.000Z"
      );
    }

    return this.toolCallStore.getBySessionId(sessionId);
  }

  private handlePermissionDecision(
    webviewView: vscode.WebviewView,
    message: PermissionDecisionMessage
  ): void {
    const prompt = this.permissionPromptsBySession.get(message.sessionId);
    if (!prompt || prompt.status !== "awaiting_user_decision") {
      return;
    }

    const resolved = resolvePermissionPromptDecision({
      prompt,
      decision: message.decision
    });
    this.toolCallStore.setPermissionDecision(
      prompt.toolCallId,
      resolved.resolution === "user_approved" ? "approved" : "denied"
    );
    if (resolved.resolution === "user_approved") {
      this.toolCallStore.markRunning(prompt.toolCallId);
      this.toolCallStore.markFinished(
        prompt.toolCallId,
        "succeeded",
        resolved.logMessage
      );
    } else {
      this.toolCallStore.markFinished(
        prompt.toolCallId,
        "failed",
        resolved.logMessage
      );
      this.sessionStore.updateStatus(message.sessionId, "blocked");
    }

    this.permissionPromptsBySession.delete(message.sessionId);
    const session = this.sessionStore.getById(message.sessionId);
    void webviewView.webview.postMessage({
      type: "permissionResolved",
      sessionId: message.sessionId,
      resolution: resolved.resolution,
      sessionSignal: resolved.sessionSignal,
      status: session?.status ?? "planning",
      toolActivity: this.toolCallStore.getBySessionId(message.sessionId)
    });
  }

  private createMockDiagnosticsSummary() {
    const baselineDiagnostics: WorkspaceDiagnostic[] = [
      {
        filePath: "src/extension.ts",
        uri: "file:///workspace/src/extension.ts",
        message: "Prefer explicit return type.",
        severity: "warning",
        source: "eslint",
        code: "explicit-function-return-type",
        range: {
          start: { line: 12, character: 0 },
          end: { line: 12, character: 15 }
        }
      }
    ];
    const currentDiagnostics: WorkspaceDiagnostic[] = [
      ...baselineDiagnostics,
      {
        filePath: "src/diagnostics.ts",
        uri: "file:///workspace/src/diagnostics.ts",
        message: "Type 'undefined' is not assignable to type 'string'.",
        severity: "error",
        source: "ts",
        code: "2322",
        range: {
          start: { line: 44, character: 12 },
          end: { line: 44, character: 22 }
        }
      }
    ];

    return this.diagnosticsTool.summarizeAgainstBaseline(
      currentDiagnostics,
      baselineDiagnostics
    );
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
    .activity-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .activity-item {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 8px;
      font-size: 12px;
      line-height: 1.3;
      display: grid;
      gap: 4px;
    }
    .muted {
      color: var(--vscode-descriptionForeground);
    }
    .prompt-card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 10px;
      display: grid;
      gap: 6px;
      font-size: 12px;
    }
    .actions {
      display: flex;
      gap: 8px;
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
  <div class="section">
    <label>Tool activity</label>
    <div class="empty-state" id="toolActivityState">No tool calls captured yet.</div>
  </div>
  <div class="section">
    <label>Diagnostics</label>
    <div class="empty-state" id="diagnosticsState">No diagnostics snapshot captured yet.</div>
    <div class="note">Diagnostics are IDE-reported and can be stale until the next analysis pass.</div>
  </div>
  <div class="section">
    <label>Permission decisions</label>
    <div class="empty-state" id="permissionPromptState">No pending permission decisions.</div>
  </div>
  <div class="note">Inline edit mode is not included in MVP yet.</div>
  <script>
    const vscode = acquireVsCodeApi();
    const taskInput = document.getElementById("taskInput");
    const createSessionButton = document.getElementById("createSessionButton");
    const progressState = document.getElementById("progressState");
    const toolActivityState = document.getElementById("toolActivityState");
    const diagnosticsState = document.getElementById("diagnosticsState");
    const permissionPromptState = document.getElementById("permissionPromptState");

    function renderToolActivity(records) {
      if (!Array.isArray(records) || records.length === 0) {
        toolActivityState.textContent = "No tool calls captured yet.";
        return;
      }

      const list = document.createElement("ul");
      list.className = "activity-list";
      records.forEach((record) => {
        const item = document.createElement("li");
        item.className = "activity-item";
        item.innerHTML =
          "<strong>" + record.toolName + "</strong>" +
          "<span class='muted'>Status: " + record.status + ", permission: " + record.permissionDecision + "</span>" +
          "<span>Input: " + record.inputSummary + "</span>" +
          "<span>Output: " + (record.outputSummary || "Pending") + "</span>";
        list.appendChild(item);
      });

      toolActivityState.innerHTML = "";
      toolActivityState.classList.remove("empty-state");
      toolActivityState.appendChild(list);
    }

    function renderDiagnosticsSummary(summary) {
      if (!summary) {
        diagnosticsState.textContent = "No diagnostics snapshot captured yet.";
        return;
      }

      const preExistingCount = Array.isArray(summary.preExisting) ? summary.preExisting.length : 0;
      const likelyNewCount = Array.isArray(summary.likelyNew) ? summary.likelyNew.length : 0;
      const baselineText = summary.baselineAvailable
        ? "Baseline available"
        : "No baseline yet";

      diagnosticsState.classList.remove("empty-state");
      diagnosticsState.innerHTML =
        "<strong>IDE diagnostics snapshot</strong>" +
        "<div class='muted'>" + baselineText + " - potentially stale until next refresh.</div>" +
        "<div>Pre-existing: " + preExistingCount + "</div>" +
        "<div>Likely new: " + likelyNewCount + "</div>";
    }

    function renderPermissionPrompt(sessionId, prompt) {
      if (!prompt || prompt.status !== "awaiting_user_decision") {
        permissionPromptState.textContent = "No pending permission decisions.";
        permissionPromptState.className = "empty-state";
        return;
      }

      permissionPromptState.className = "prompt-card";
      permissionPromptState.innerHTML =
        "<strong>Confirmation required</strong>" +
        "<span>" + prompt.promptMessage + "</span>" +
        "<span class='muted'>Action: " + prompt.actionSummary.actionType + " (" + prompt.actionSummary.scope + ")</span>" +
        "<span class='muted'>Target: " + prompt.actionSummary.target + "</span>" +
        "<span class='muted'>Reason: " + prompt.decisionReason + "</span>" +
        "<div class='actions'>" +
          "<button id='approvePermissionButton'>Approve</button>" +
          "<button id='rejectPermissionButton'>Reject</button>" +
        "</div>";

      const approveButton = document.getElementById("approvePermissionButton");
      const rejectButton = document.getElementById("rejectPermissionButton");
      approveButton.addEventListener("click", () => {
        vscode.postMessage({
          type: "permissionDecision",
          sessionId,
          decision: "approve"
        });
      });
      rejectButton.addEventListener("click", () => {
        vscode.postMessage({
          type: "permissionDecision",
          sessionId,
          decision: "reject"
        });
      });
    }

    createSessionButton.addEventListener("click", () => {
      vscode.postMessage({
        type: "createSession",
        userRequest: taskInput.value
      });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message && message.type === "permissionResolved") {
        progressState.textContent =
          "Permission result: " + message.resolution + " (" + message.sessionSignal + "). Session status: " + message.status + ".";
        renderToolActivity(message.toolActivity);
        renderPermissionPrompt(message.sessionId, null);
        return;
      }

      if (!message || message.type !== "sessionCreated" || !message.session) {
        return;
      }

      progressState.textContent = "Session " + message.session.id + " created with status " + message.session.status + ".";
      renderToolActivity(message.toolActivity);
      renderDiagnosticsSummary(message.diagnosticsSummary);
      renderPermissionPrompt(message.session.id, message.permissionPrompt);
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

interface PermissionDecisionMessage {
  type: "permissionDecision";
  sessionId: string;
  decision: "approve" | "reject";
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

function isPermissionDecisionMessage(
  value: unknown
): value is PermissionDecisionMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "sessionId" in value &&
    "decision" in value &&
    (value as { type: unknown }).type === "permissionDecision" &&
    typeof (value as { sessionId: unknown }).sessionId === "string" &&
    ((value as { decision: unknown }).decision === "approve" ||
      (value as { decision: unknown }).decision === "reject")
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const secretStorage = new ProviderSecretStorageAdapter(context.secrets);
  const sessionStore = new AgentSessionStore();
  const toolCallStore = new ToolCallRecordStore();
  const viewProvider = new OvereactComposerViewProvider(
    sessionStore,
    toolCallStore,
    new DiagnosticsTool(),
    () => vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? "workspace://unknown"
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
