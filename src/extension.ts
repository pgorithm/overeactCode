import * as vscode from "vscode";
import { AgentLoopController, AgentSessionStore } from "./agentSession";
import {
  buildComposerViewModel,
  type ComposerFinalSummary
} from "./composerViewModel";
import { DiagnosticsTool, type WorkspaceDiagnostic } from "./diagnostics";
import { PatchEditingBoundary } from "./patchEditingBoundary";
import { PatchProposalStore } from "./patchProposal";
import {
  createPatchReviewState,
  resolvePatchAfterPermission,
  resolvePatchReviewDecision,
  type PatchReviewState
} from "./patchReview";
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
  private readonly patchReviewsBySession = new Map<string, PatchReviewState>();
  private readonly patchReviewsByToolCallId = new Map<string, PatchReviewState>();
  private readonly patchProposalStore = new PatchProposalStore();
  private readonly patchEditingBoundary = new PatchEditingBoundary();
  private readonly loopController = new AgentLoopController();

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
      if (isPatchPreviewRequestMessage(message)) {
        void this.openPatchDiffPreview(message.sessionId, message.proposalId);
        return;
      }

      if (isPatchReviewDecisionMessage(message)) {
        void this.handlePatchReviewDecision(webviewView, message);
        return;
      }

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
      const composerViewModel = this.createMockComposerViewModel(
        session,
        toolActivity
      );
      void webviewView.webview.postMessage({
        type: "sessionCreated",
        session: this.sessionStore.getById(session.id) ?? session,
        composerViewModel,
        toolActivity,
        patchReview: this.patchReviewsBySession.get(session.id) ?? null,
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
    const patchProposal = this.patchProposalStore.createProposal({
      sessionId,
      fileUri: "file:///workspace/src/extension.ts",
      diff: "@@ mock section\n-const pending = true;\n+const pending = false;"
    });
    this.patchEditingBoundary.createEditRequest({
      proposal: patchProposal
    });
    const patchReview = createPatchReviewState({
      proposal: patchProposal,
      toolCallId: fileWriteRecord.id
    });
    this.patchReviewsBySession.set(sessionId, patchReview);
    this.patchReviewsByToolCallId.set(fileWriteRecord.id, patchReview);
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
    const relatedPatchReview = this.patchReviewsByToolCallId.get(prompt.toolCallId);
    if (resolved.resolution === "user_approved") {
      this.toolCallStore.markRunning(prompt.toolCallId);
      const patchResolution = resolvePatchAfterPermission({ approved: true });
      if (relatedPatchReview) {
        this.patchProposalStore.updateStatus(relatedPatchReview.proposalId, "applied");
        const updatedPatchReview: PatchReviewState = {
          ...relatedPatchReview,
          status: patchResolution.status
        };
        this.patchReviewsBySession.set(message.sessionId, updatedPatchReview);
        this.patchReviewsByToolCallId.set(prompt.toolCallId, updatedPatchReview);
      }
      this.toolCallStore.markFinished(
        prompt.toolCallId,
        "succeeded",
        relatedPatchReview ? patchResolution.logMessage : resolved.logMessage
      );
    } else {
      const patchResolution = resolvePatchAfterPermission({ approved: false });
      if (relatedPatchReview) {
        this.patchProposalStore.updateStatus(relatedPatchReview.proposalId, "rejected");
        const updatedPatchReview: PatchReviewState = {
          ...relatedPatchReview,
          status: patchResolution.status
        };
        this.patchReviewsBySession.set(message.sessionId, updatedPatchReview);
        this.patchReviewsByToolCallId.set(prompt.toolCallId, updatedPatchReview);
      }
      this.toolCallStore.markFinished(
        prompt.toolCallId,
        "failed",
        relatedPatchReview ? patchResolution.logMessage : resolved.logMessage
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
      patchReview: this.patchReviewsBySession.get(message.sessionId) ?? null,
      toolActivity: this.toolCallStore.getBySessionId(message.sessionId)
    });
  }

  private async handlePatchReviewDecision(
    webviewView: vscode.WebviewView,
    message: PatchReviewDecisionMessage
  ): Promise<void> {
    const patchReview = this.patchReviewsBySession.get(message.sessionId);
    if (!patchReview || patchReview.proposalId !== message.proposalId) {
      return;
    }

    const policyEvaluation = evaluatePermissionPolicy(
      {
        scope: "workspace",
        actionType: "write_file",
        target: "src/extension.ts"
      },
      []
    );
    const reviewResult = resolvePatchReviewDecision({
      decision: message.decision,
      policyEvaluation
    });
    const updatedPatchReview: PatchReviewState = {
      ...patchReview,
      status: reviewResult.status
    };
    this.patchReviewsBySession.set(message.sessionId, updatedPatchReview);
    this.patchReviewsByToolCallId.set(patchReview.toolCallId, updatedPatchReview);

    if (reviewResult.resolution === "rejected") {
      this.patchProposalStore.updateStatus(patchReview.proposalId, "rejected");
      this.toolCallStore.setPermissionDecision(patchReview.toolCallId, "denied");
      this.toolCallStore.markFinished(
        patchReview.toolCallId,
        "failed",
        reviewResult.logMessage
      );
      const session = this.sessionStore.updateStatus(message.sessionId, "blocked");
      void webviewView.webview.postMessage({
        type: "patchReviewResolved",
        sessionId: message.sessionId,
        proposalId: message.proposalId,
        resolution: reviewResult.resolution,
        sessionSignal: reviewResult.sessionSignal,
        status: session.status,
        patchReview: updatedPatchReview,
        toolActivity: this.toolCallStore.getBySessionId(message.sessionId)
      });
      return;
    }

    if (reviewResult.resolution === "applied") {
      this.patchProposalStore.updateStatus(patchReview.proposalId, "applied");
      this.toolCallStore.setPermissionDecision(patchReview.toolCallId, "approved");
      this.toolCallStore.markRunning(patchReview.toolCallId);
      this.toolCallStore.markFinished(
        patchReview.toolCallId,
        "succeeded",
        reviewResult.logMessage
      );
      void webviewView.webview.postMessage({
        type: "patchReviewResolved",
        sessionId: message.sessionId,
        proposalId: message.proposalId,
        resolution: reviewResult.resolution,
        sessionSignal: reviewResult.sessionSignal,
        status: "planning",
        patchReview: updatedPatchReview,
        toolActivity: this.toolCallStore.getBySessionId(message.sessionId)
      });
      return;
    }

    const confirmPrompt = createPermissionPromptState({
      sessionId: message.sessionId,
      toolCallId: patchReview.toolCallId,
      actionSummary: {
        scope: "workspace",
        actionType: "write_file",
        target: "src/extension.ts"
      },
      evaluation: policyEvaluation
    });
    if (confirmPrompt) {
      this.permissionPromptsBySession.set(message.sessionId, confirmPrompt);
    }

    void webviewView.webview.postMessage({
      type: "patchReviewResolved",
      sessionId: message.sessionId,
      proposalId: message.proposalId,
      resolution: reviewResult.resolution,
      sessionSignal: reviewResult.sessionSignal,
      status: "planning",
      patchReview: updatedPatchReview,
      permissionPrompt: this.permissionPromptsBySession.get(message.sessionId) ?? null,
      toolActivity: this.toolCallStore.getBySessionId(message.sessionId)
    });
  }

  private async openPatchDiffPreview(
    sessionId: string,
    proposalId: string
  ): Promise<void> {
    const patchReview = this.patchReviewsBySession.get(sessionId);
    if (!patchReview || patchReview.proposalId !== proposalId) {
      return;
    }

    const preview = extractDiffPreview(patchReview.diff);
    const beforeDoc = await vscode.workspace.openTextDocument({
      language: "plaintext",
      content: preview.before
    });
    const afterDoc = await vscode.workspace.openTextDocument({
      language: "plaintext",
      content: preview.after
    });
    await vscode.commands.executeCommand(
      "vscode.diff",
      beforeDoc.uri,
      afterDoc.uri,
      `Patch Preview: ${patchReview.fileUri}`
    );
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

  private createMockComposerViewModel(
    session: { id: string; status: "planning" | "editing" | "verifying" | "blocked" | "completed" | "failed" | "idle" },
    toolActivity: ReturnType<ToolCallRecordStore["getBySessionId"]>
  ) {
    this.loopController.begin(session.id, { maxRetryLimit: 2 });
    this.loopController.markContextRetrieved(session.id);
    this.loopController.proposePlan(
      session.id,
      "1) Confirm scope from targeted files. 2) Apply minimal patch proposal. 3) Run compile/tests and summarize risks."
    );
    this.loopController.decidePlan(session.id, "accept");
    this.loopController.beginEditing(session.id);
    this.loopController.finishEditing(session.id);
    this.loopController.runVerificationLoop(session.id, {
      failedCommands: [],
      diagnostics: {
        preExistingCount: 1,
        likelyNewCount: 0,
        summary: "No likely new diagnostics after verification."
      }
    });
    const loopState = this.loopController.publishSummary(
      session.id,
      "Updated composer rendering with plan, progress, tool activity, verification result and final summary."
    );
    const completedSession = this.sessionStore.updateStatus(session.id, "completed");
    const finalSummary: ComposerFinalSummary = {
      changedFiles: ["src/extension.ts", "src/composerViewModel.ts"],
      checksRun: ["npm run compile", "npm test"],
      unresolvedIssues: ["Manual Extension Development Host validation is still required."],
      assumptions: ["Workspace has one active root for session context."],
      suggestedNextSteps: [
        "Run the side composer flow in Extension Development Host.",
        "Review detailed tool activity only when needed."
      ]
    };

    return buildComposerViewModel({
      session: completedSession,
      loopState,
      toolActivity,
      finalSummary
    });
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
    <label>Plan</label>
    <div class="empty-state" id="planState">No plan proposed yet.</div>
  </div>
  <div class="section">
    <label>Tool activity</label>
    <div class="empty-state" id="toolActivityState">No tool calls captured yet.</div>
    <button id="toggleToolActivityButton" style="display:none;">Show details</button>
  </div>
  <div class="section">
    <label>Verification</label>
    <div class="empty-state" id="verificationState">No verification output yet.</div>
  </div>
  <div class="section">
    <label>Final summary</label>
    <div class="empty-state" id="finalSummaryState">No final summary yet.</div>
  </div>
  <div class="section">
    <label>Diagnostics</label>
    <div class="empty-state" id="diagnosticsState">No diagnostics snapshot captured yet.</div>
    <div class="note">Diagnostics are IDE-reported and can be stale until the next analysis pass.</div>
  </div>
  <div class="section">
    <label>Patch review</label>
    <div class="empty-state" id="patchReviewState">No patch proposals yet.</div>
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
    const planState = document.getElementById("planState");
    const toolActivityState = document.getElementById("toolActivityState");
    const toggleToolActivityButton = document.getElementById("toggleToolActivityButton");
    const verificationState = document.getElementById("verificationState");
    const finalSummaryState = document.getElementById("finalSummaryState");
    const diagnosticsState = document.getElementById("diagnosticsState");
    const patchReviewState = document.getElementById("patchReviewState");
    const permissionPromptState = document.getElementById("permissionPromptState");
    let toolActivityRecords = [];
    let fullToolActivityRecords = [];
    let showFullToolActivity = false;

    function renderToolActivity(records, hiddenCount, showAll) {
      if (!Array.isArray(records) || records.length === 0) {
        toolActivityState.textContent = "No tool calls captured yet.";
        toggleToolActivityButton.style.display = "none";
        return;
      }

      toggleToolActivityButton.style.display = hiddenCount > 0 ? "inline-block" : "none";
      toggleToolActivityButton.textContent = showAll ? "Hide details" : "Show details";
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
      if (hiddenCount > 0 && !showAll) {
        const muted = document.createElement("div");
        muted.className = "muted";
        muted.textContent = hiddenCount + " additional tool calls hidden.";
        toolActivityState.appendChild(muted);
      }
    }

    function renderComposerViewModel(viewModel) {
      if (!viewModel) {
        return;
      }
      progressState.className = "prompt-card";
      progressState.innerHTML =
        "<strong>Current stage: " + viewModel.currentStage + "</strong>" +
        "<span class='muted'>Next step: " + viewModel.nextStep + "</span>" +
        "<span class='muted'>Progress updates: " + viewModel.progressUpdates.join(" -> ") + "</span>";

      planState.className = "prompt-card";
      planState.innerHTML = "<strong>Approved plan</strong><span>" + viewModel.planSummary + "</span>";

      verificationState.className = "prompt-card";
      verificationState.innerHTML =
        "<strong>Status: " + viewModel.verification.status + "</strong>" +
        "<span class='muted'>Retry count: " + viewModel.verification.retryCount + "</span>" +
        "<span>Diagnostics: " + viewModel.verification.diagnosticsSummary + "</span>" +
        "<span>Failed commands: " +
        (viewModel.verification.failedCommands.length > 0
          ? viewModel.verification.failedCommands.join(", ")
          : "none") +
        "</span>";

      const finalSummary = viewModel.finalSummary;
      finalSummaryState.className = "prompt-card";
      finalSummaryState.innerHTML =
        "<strong>Changed files</strong><span>" + finalSummary.changedFiles.join(", ") + "</span>" +
        "<strong>Checks run</strong><span>" + finalSummary.checksRun.join(", ") + "</span>" +
        "<strong>Unresolved issues</strong><span>" + finalSummary.unresolvedIssues.join("; ") + "</span>" +
        "<strong>Assumptions</strong><span>" + finalSummary.assumptions.join("; ") + "</span>" +
        "<strong>Suggested next steps</strong><span>" + finalSummary.suggestedNextSteps.join("; ") + "</span>";

      toolActivityRecords = Array.isArray(viewModel.toolActivityDefault)
        ? viewModel.toolActivityDefault.slice()
        : [];
      showFullToolActivity = false;
      renderToolActivity(toolActivityRecords, viewModel.hiddenToolActivityCount || 0, showFullToolActivity);
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

    function renderPatchReview(sessionId, review) {
      if (!review) {
        patchReviewState.textContent = "No patch proposals yet.";
        patchReviewState.className = "empty-state";
        return;
      }

      patchReviewState.className = "prompt-card";
      patchReviewState.innerHTML =
        "<strong>Patch proposal</strong>" +
        "<span class='muted'>Target: " + review.fileUri + "</span>" +
        "<span class='muted'>Status: " + review.status + "</span>" +
        "<div class='actions'>" +
          "<button id='openDiffPreviewButton'>Open diff preview</button>" +
          "<button id='approvePatchButton'>Approve patch</button>" +
          "<button id='rejectPatchButton'>Reject patch</button>" +
        "</div>";

      const openDiffPreviewButton = document.getElementById("openDiffPreviewButton");
      const approvePatchButton = document.getElementById("approvePatchButton");
      const rejectPatchButton = document.getElementById("rejectPatchButton");
      if (review.status !== "proposed") {
        approvePatchButton.disabled = true;
        rejectPatchButton.disabled = true;
      }

      openDiffPreviewButton.addEventListener("click", () => {
        vscode.postMessage({
          type: "openPatchDiffPreview",
          sessionId,
          proposalId: review.proposalId
        });
      });
      approvePatchButton.addEventListener("click", () => {
        vscode.postMessage({
          type: "patchReviewDecision",
          sessionId,
          proposalId: review.proposalId,
          decision: "approve"
        });
      });
      rejectPatchButton.addEventListener("click", () => {
        vscode.postMessage({
          type: "patchReviewDecision",
          sessionId,
          proposalId: review.proposalId,
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
    toggleToolActivityButton.addEventListener("click", () => {
      showFullToolActivity = !showFullToolActivity;
      const visibleRecords = showFullToolActivity
        ? fullToolActivityRecords
        : toolActivityRecords;
      const hiddenCount = showFullToolActivity
        ? 0
        : Math.max(fullToolActivityRecords.length - toolActivityRecords.length, 0);
      renderToolActivity(visibleRecords, hiddenCount, showFullToolActivity);
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message && message.type === "permissionResolved") {
        progressState.textContent =
          "Permission result: " + message.resolution + " (" + message.sessionSignal + "). Session status: " + message.status + ".";
        renderPatchReview(message.sessionId, message.patchReview);
        renderToolActivity(message.toolActivity, 0, true);
        renderPermissionPrompt(message.sessionId, null);
        return;
      }

      if (message && message.type === "patchReviewResolved") {
        progressState.textContent =
          "Patch review: " + message.resolution + " (" + message.sessionSignal + "). Session status: " + message.status + ".";
        renderPatchReview(message.sessionId, message.patchReview);
        renderToolActivity(message.toolActivity, 0, true);
        renderPermissionPrompt(message.sessionId, message.permissionPrompt || null);
        return;
      }

      if (!message || message.type !== "sessionCreated" || !message.session) {
        return;
      }

      if (message.composerViewModel) {
        fullToolActivityRecords = Array.isArray(message.toolActivity) ? message.toolActivity : [];
        renderComposerViewModel(message.composerViewModel);
      } else {
        progressState.textContent = "Session " + message.session.id + " created with status " + message.session.status + ".";
        renderToolActivity(message.toolActivity, 0, true);
      }
      renderDiagnosticsSummary(message.diagnosticsSummary);
      renderPatchReview(message.session.id, message.patchReview);
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

interface PatchPreviewRequestMessage {
  type: "openPatchDiffPreview";
  sessionId: string;
  proposalId: string;
}

interface PatchReviewDecisionMessage {
  type: "patchReviewDecision";
  sessionId: string;
  proposalId: string;
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

function isPatchPreviewRequestMessage(
  value: unknown
): value is PatchPreviewRequestMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "sessionId" in value &&
    "proposalId" in value &&
    (value as { type: unknown }).type === "openPatchDiffPreview" &&
    typeof (value as { sessionId: unknown }).sessionId === "string" &&
    typeof (value as { proposalId: unknown }).proposalId === "string"
  );
}

function isPatchReviewDecisionMessage(
  value: unknown
): value is PatchReviewDecisionMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "sessionId" in value &&
    "proposalId" in value &&
    "decision" in value &&
    (value as { type: unknown }).type === "patchReviewDecision" &&
    typeof (value as { sessionId: unknown }).sessionId === "string" &&
    typeof (value as { proposalId: unknown }).proposalId === "string" &&
    ((value as { decision: unknown }).decision === "approve" ||
      (value as { decision: unknown }).decision === "reject")
  );
}

function extractDiffPreview(diff: string): { before: string; after: string } {
  const beforeLines: string[] = [];
  const afterLines: string[] = [];

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("@@")) {
      continue;
    }
    if (line.startsWith("-")) {
      beforeLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith("+")) {
      afterLines.push(line.slice(1));
      continue;
    }
    beforeLines.push(line);
    afterLines.push(line);
  }

  return {
    before: beforeLines.join("\n"),
    after: afterLines.join("\n")
  };
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
