<!-- markdownlint-disable MD022 MD032 -->

# PRD: Overeact Code

## 1. Overview

### Problem
Existing open-source AI coding extensions for VS Code often feel weaker than products like Cursor and Claude Code: they may expose chat and simple edits, but struggle with reliable task execution, tool choice, context management, verification, and controlled autonomy.

### Solution
Overeact Code is a VS Code extension for AI-assisted engineering. The MVP provides a local agent loop in a side chat/composer panel. The agent can understand a task, gather relevant project context, propose a plan, edit files through patches, run checks, react to diagnostics, inspect git state, and summarize verified results.

### Goals
- Enable the author to use the extension regularly for small real development tasks.
- Provide a reliable `plan -> edit -> verify -> retry -> summary` loop inside VS Code.
- Make tool usage explicit, inspectable, and permission-controlled.
- Support OpenAI-compatible providers such as Bothub through configurable base URLs, API keys, and model selection.
- Avoid context pollution by using retrieval-first project exploration instead of loading broad, irrelevant context.

### Non-Goals
- Full Cursor clone UI in the first version.
- Inline editor edits in the first version.
- Multi-agent orchestration in the first version.
- MCP/custom tool ecosystem in the first version.
- Team administration, billing, hosted accounts, or cloud sync in the first version.
- Guaranteed enterprise compliance in the first version.

## 2. Target Audience

### Primary Users
The first user is the product author, using the extension as a dogfooding tool for real coding tasks.

The broader intended audience is experienced VS Code users and AI-assisted developers who want Cursor-like agent quality without leaving VS Code, and who care about provider choice, transparency, and control.

### User Needs
- Use an AI agent in VS Code without switching to a separate IDE.
- Configure an OpenAI-compatible model provider, including custom base URL and API key.
- Assign different models to different task types, such as planning, coding, reviewing, summarization, and tool decisions.
- Let the agent inspect only relevant project context.
- See what tools the agent used and why.
- Review file changes before applying them.
- Run tests, linters, or other verification commands as part of the agent loop.
- Keep control over file edits, terminal commands, and risky actions through policies.

## 3. MVP Scope

### Must-Have Features
- Side chat/composer panel: accepts task requests and displays plan, progress, tool activity, diffs, verification results, and final summary.
- Local agent loop: executes the main flow `understand task -> retrieve context -> plan -> edit -> verify -> retry if needed -> summarize`.
- Retrieval-first context management: searches for relevant files and symbols before reading, and avoids adding broad irrelevant context.
- Filesystem tools: search files, read files, create or update files through patches, and show diff previews.
- Terminal tools: run user-approved or policy-approved commands, capture output, and use failures as feedback.
- VS Code diagnostics integration: read Problems/linter/type errors and feed them back into the agent loop.
- Git awareness: inspect status, diff, and recent log so the agent can avoid overwriting unrelated user work and produce accurate summaries.
- Semantic/project search: locate relevant code and docs without scanning the entire repository into context.
- Policy-based permissions: allow users to define which reads, writes, commands, and git actions can run automatically or require confirmation.
- OpenAI-compatible provider configuration: configure base URL, API key, and model routing for different agent tasks.

### Later Features
- Inline edit mode: deferred until the side composer and patch workflow are reliable.
- Multi-agent task execution: deferred until single-agent task execution is stable.
- MCP/custom tool support: deferred until the internal tool model and permission system are proven.
- Persistent project memory: deferred beyond retrieval-first context and task summaries.
- Team/shared policies: deferred until local personal usage is successful.
- PR automation: deferred beyond git awareness and summary generation.

## 4. User Flows

### Flow: Configure Provider
1. User opens Overeact Code settings.
2. User enters an OpenAI-compatible base URL, API key, and default model.
3. User optionally assigns models to planning, coding, review, summarization, and tool-decision tasks.
4. Extension validates configuration with a lightweight test request.
5. User sees whether the provider is ready.

### Flow: Implement Task
1. User opens the side composer and describes a coding task.
2. Agent summarizes the task and retrieves relevant project context.
3. Agent proposes a short implementation plan.
4. User approves the plan or asks for changes.
5. Agent edits files through patch operations and shows diff previews.
6. Agent runs configured verification commands or reads VS Code diagnostics.
7. If checks fail, agent diagnoses the failure and retries within policy limits.
8. Agent returns a final summary with files changed, checks run, unresolved issues, and suggested next steps.

### Flow: Permission Decision
1. Agent requests a file write, terminal command, or git inspection.
2. Permission engine checks workspace policies.
3. If allowed, the action runs and is logged.
4. If confirmation is required, user approves or rejects the action.
5. If denied, agent adapts the plan or asks the user for guidance.

## 5. Functional Requirements

### FR-001: Provider Configuration
Description: Users can configure an OpenAI-compatible provider for all AI calls.

Acceptance Criteria:
- Given a new installation, when the user opens settings, then they can enter base URL, API key, and default model.
- Given valid provider settings, when the user runs a test request, then the extension confirms connectivity.
- Given invalid provider settings, when the user runs a test request, then the extension shows a clear error without exposing the secret.
- Given multiple task categories, when the user configures model routing, then the agent uses the selected model for each category.

Technical Considerations:
- Support OpenAI-compatible chat/completions APIs first.
- Store API keys in VS Code secret storage, not plain text settings.
- Bothub is a target provider, but the implementation should not hardcode Bothub-specific assumptions unless required.

### FR-002: Side Composer
Description: Users can submit tasks and observe agent progress in a VS Code side panel.

Acceptance Criteria:
- Given the extension is installed, when the user opens Overeact Code, then a side panel is available.
- Given a task is running, when the agent uses tools, then the panel displays concise tool activity and status.
- Given the agent proposes file changes, when the user opens the diff preview, then they can inspect the changes before applying them.
- Given the task completes, when the final response is shown, then it includes changed files, checks run, and remaining risks.

Technical Considerations:
- MVP does not require inline editor UI.
- The panel should optimize for transparency without dumping raw logs by default.

### FR-003: Retrieval-First Context Gathering
Description: The agent must gather relevant context deliberately instead of loading the whole project.

Acceptance Criteria:
- Given a task, when the agent starts, then it performs targeted file, symbol, or semantic search before reading large files.
- Given search results, when the agent selects files to read, then it records a short reason for important context choices.
- Given irrelevant files are found, when they are not used, then they are not added to the active context.
- Given context grows too large, when the agent continues the task, then it summarizes prior findings instead of retaining unnecessary raw content.

Technical Considerations:
- MVP can use a practical local index or VS Code/search APIs before introducing a sophisticated embedding pipeline.
- Persistent project memory is a later feature unless needed for basic summaries.

### FR-004: Filesystem And Patch Tools
Description: The agent can read project files and propose controlled file edits.

Acceptance Criteria:
- Given a user task, when the agent needs code context, then it can search and read files within the workspace.
- Given a planned edit, when the agent prepares changes, then it creates a patch or equivalent structured edit rather than blind text replacement.
- Given a patch is ready, when the user reviews it, then the diff is visible before application unless policy allows automatic application.
- Given a file has unrelated user changes, when the agent edits it, then it preserves those changes and does not revert them.

Technical Considerations:
- Use VS Code workspace APIs for file access where possible.
- Track whether changes were agent-created, user-created, or pre-existing.

### FR-005: Terminal And Verification Tools
Description: The agent can run verification commands and use their output to continue the task.

Acceptance Criteria:
- Given a task requires verification, when a suitable command is known, then the agent can request to run it.
- Given command execution is allowed by policy, when the command runs, then stdout, stderr, exit code, and duration are captured.
- Given a command fails, when the failure is relevant, then the agent analyzes the output before proposing a fix.
- Given a command is unsafe or denied, when the agent cannot run it, then it explains the limitation and offers an alternative.

Technical Considerations:
- Commands must be permission-controlled.
- MVP should support common commands from the current workspace, not invent project-specific commands without evidence.

### FR-006: VS Code Diagnostics Feedback
Description: The agent can read diagnostics from VS Code Problems and use them as verification feedback.

Acceptance Criteria:
- Given diagnostics exist, when the agent checks the workspace, then it can list relevant diagnostics for touched files.
- Given diagnostics were pre-existing, when the agent summarizes the task, then it distinguishes them from likely newly introduced issues when possible.
- Given diagnostics point to an agent edit, when the agent is allowed to continue, then it attempts a targeted fix.

Technical Considerations:
- Diagnostics can be stale; the UI should indicate that they are IDE-reported, not always final truth.

### FR-007: Git Awareness
Description: The agent can inspect git state to avoid damaging user work and to summarize changes accurately.

Acceptance Criteria:
- Given a git repository, when a task starts, then the agent can inspect status and identify dirty files.
- Given changes exist before the task, when the agent edits files, then it avoids reverting unrelated work.
- Given the task completes, when the agent summarizes, then it can cite changed files and high-level diff intent.
- Given a user asks for commit help, when the feature is available, then the agent can draft a commit message, but does not push automatically.

Technical Considerations:
- MVP requires status, diff, and recent log awareness.
- Commit creation can be later unless needed for dogfooding.

### FR-008: Policy-Based Permissions
Description: Users can configure rules that decide which agent actions are automatic, require confirmation, or are denied.

Acceptance Criteria:
- Given default settings, when the agent attempts file writes or terminal commands, then risky actions require confirmation.
- Given a user configures allow rules, when an action matches a rule, then it can run without repeated prompts.
- Given a user configures deny rules, when an action matches a rule, then it is blocked and logged.
- Given an action is blocked, when the agent continues, then it updates the plan or asks for user input.

Technical Considerations:
- Policies should cover at least file paths, command patterns, git actions, and network/tool access categories.
- Defaults should favor safety over autonomy.

### FR-009: Agent Progress And Final Summary
Description: The agent must make progress understandable without exposing excessive internal noise.

Acceptance Criteria:
- Given a task is running, when the agent completes major steps, then the panel shows short progress updates.
- Given tool calls occur, when the user inspects activity, then they can see inputs, outputs, and permission decisions at a useful level.
- Given the task finishes, when the final summary is produced, then it includes what changed, what was verified, what failed or was skipped, and remaining questions.
- Given the agent is uncertain, when summarizing, then it states assumptions instead of claiming success without evidence.

Technical Considerations:
- The product should avoid presenting hidden reasoning as a raw transcript. Summaries and tool logs are enough for MVP.

## 6. Data Model

### Entity: ProviderConfig
- `id`: string, unique identifier
- `name`: string, display name
- `baseUrl`: string, OpenAI-compatible endpoint base URL
- `apiKeySecretRef`: string, reference to VS Code secret storage entry
- `defaultModel`: string, default model identifier
- `createdAt`: datetime
- `updatedAt`: datetime

Relationships:
- ProviderConfig has many ModelAssignments.

### Entity: ModelAssignment
- `id`: string, unique identifier
- `providerId`: string, related provider
- `taskType`: enum, one of `planning`, `coding`, `review`, `summarization`, `tool_decision`
- `model`: string, provider-specific model name
- `temperature`: number, optional generation setting
- `maxTokens`: number, optional output budget

Relationships:
- ModelAssignment belongs to ProviderConfig.

### Entity: AgentSession
- `id`: string, unique identifier
- `workspaceUri`: string, workspace where the session runs
- `userRequest`: string, original task request
- `status`: enum, one of `idle`, `planning`, `editing`, `verifying`, `blocked`, `completed`, `failed`
- `createdAt`: datetime
- `updatedAt`: datetime

Relationships:
- AgentSession has many ToolCallRecords.
- AgentSession has many ContextItems.
- AgentSession has many PatchProposals.

### Entity: ContextItem
- `id`: string, unique identifier
- `sessionId`: string, related session
- `sourceType`: enum, one of `file`, `symbol`, `diagnostic`, `git_diff`, `terminal_output`, `summary`
- `sourceUri`: string, optional source path or identifier
- `reason`: string, why this context was selected
- `contentRef`: string, reference to stored content or summary
- `tokenEstimate`: number, approximate context size

Relationships:
- ContextItem belongs to AgentSession.

### Entity: ToolCallRecord
- `id`: string, unique identifier
- `sessionId`: string, related session
- `toolName`: string
- `inputSummary`: string
- `outputSummary`: string
- `status`: enum, one of `pending`, `approved`, `denied`, `running`, `succeeded`, `failed`
- `permissionDecision`: enum, one of `auto_allowed`, `user_approved`, `user_denied`, `policy_denied`
- `startedAt`: datetime
- `finishedAt`: datetime

Relationships:
- ToolCallRecord belongs to AgentSession.

### Entity: PermissionPolicy
- `id`: string, unique identifier
- `scope`: enum, one of `workspace`, `global`
- `actionType`: enum, one of `read_file`, `write_file`, `run_command`, `git_read`, `git_write`, `network`
- `pattern`: string, path, command, or action pattern
- `decision`: enum, one of `allow`, `confirm`, `deny`
- `createdAt`: datetime
- `updatedAt`: datetime

Relationships:
- PermissionPolicy applies to AgentSession actions.

### Entity: PatchProposal
- `id`: string, unique identifier
- `sessionId`: string, related session
- `fileUri`: string
- `diff`: string
- `status`: enum, one of `proposed`, `applied`, `rejected`, `superseded`
- `createdAt`: datetime

Relationships:
- PatchProposal belongs to AgentSession.

## 7. UX and UI Principles

- The side panel is the primary interface for MVP.
- The user should always know what the agent is doing now, what it plans next, and what requires approval.
- Tool logs should be inspectable but summarized by default.
- Diffs should be reviewed before application unless policy explicitly allows auto-apply.
- The UI should make context selection visible enough to build trust without forcing the user to manage raw token budgets.
- Errors should be actionable: failed provider calls, denied permissions, failed commands, and diagnostics should explain the next possible step.

## 8. Platform and Technical Recommendations

### Recommended Platform
The first version should be a VS Code desktop extension.

### Suggested Stack
- Frontend: VS Code Webview for the side chat/composer panel.
- Extension host: TypeScript with VS Code Extension API.
- Agent core: TypeScript modules inside the extension package for MVP.
- Persistence: VS Code global/workspace state for non-secret settings; VS Code SecretStorage for API keys.
- Search: VS Code workspace search and language features first; optional local index later.
- Backend: none for MVP.
- Database: none for MVP; local extension storage is enough.
- Hosting/Infrastructure: marketplace or local `.vsix` distribution for early testing.

### Tradeoffs
- Keeping the agent core inside the extension reduces MVP complexity, but long-running tasks and isolation may become harder later.
- Starting with OpenAI-compatible providers maximizes flexibility, but provider quirks will still require careful error handling.
- Retrieval-first context is simpler than persistent memory, but may repeat some exploration between sessions.
- Policy-based permissions add complexity, but they are central to safe autonomy and user trust.

## 9. Integrations

- OpenAI-compatible API provider: sends prompts and receives model responses. Must support configurable base URL, API key, model names, and model assignments.
- Bothub: target OpenAI-compatible provider. Treat as a configuration target rather than a hardcoded dependency unless specific API behavior requires it.
- VS Code Extension API: panels, workspace files, diagnostics, commands, secrets, settings, and git-related extension integration where available.
- Git CLI or VS Code Git extension APIs: status, diff, and log inspection.
- Local shell/terminal: command execution for tests, linters, and project-specific checks.

## 10. Security, Privacy, and Compliance

- Authentication: no product account is required for MVP. Users authenticate to their AI provider via API key.
- Authorization: local permission policies control agent actions.
- Sensitive Data: API keys must be stored using VS Code SecretStorage. Prompts may include source code and terminal output, so provider selection should be explicit.
- Workspace Privacy: the agent should not send broad project context unless selected through retrieval-first flow.
- Command Safety: terminal commands must be policy-controlled and logged.
- File Safety: writes must preserve unrelated user changes and show diffs unless auto-apply is explicitly allowed.
- Compliance: no formal compliance guarantees in MVP.

## 11. Success Metrics

- The author uses Overeact Code for at least several small real coding tasks without switching to another AI coding tool for the core loop.
- For a representative small task, the agent can gather context, propose a plan, edit files, run verification, and produce a useful summary.
- The agent avoids obvious context pollution by selecting targeted files instead of reading the entire repository.
- Permission prompts are understandable and not so frequent that they make the product unusable.
- Provider configuration works with at least one OpenAI-compatible service such as Bothub.

## 12. Milestones

### Milestone 1: Extension Skeleton And Provider Setup
- Create VS Code extension skeleton.
- Add side panel shell.
- Add provider settings for base URL, API key, default model, and model assignments.
- Store secrets securely.
- Validate provider connectivity.

### Milestone 2: Agent Session And Tool Log
- Implement AgentSession state.
- Add progress rendering in side panel.
- Add structured ToolCallRecord logging.
- Add basic permission decision flow.

### Milestone 3: Retrieval And Read-Only Context
- Implement workspace search and file reads.
- Implement git status/diff/log read tools.
- Implement VS Code diagnostics read tool.
- Add context item tracking with reasons.

### Milestone 4: Patch Editing
- Implement structured patch proposal generation.
- Show diff preview in the side panel or VS Code diff view.
- Apply or reject patches through policy/user approval.
- Preserve unrelated workspace changes.

### Milestone 5: Verification Loop
- Implement terminal command execution with policy checks.
- Capture outputs and feed failures back to the agent.
- Support retry loops with limits.
- Produce final summary with verification evidence.

### Milestone 6: Dogfooding Hardening
- Use the extension on real small tasks.
- Refine context selection prompts and tool schemas.
- Improve provider error handling.
- Tighten permission defaults and UX.

## 13. Risks and Mitigations

- Risk: The agent behaves like a generic chat tool instead of a reliable engineering agent.
  Mitigation: Build around the explicit `plan -> edit -> verify -> retry -> summary` loop and require verification evidence in final summaries.

- Risk: Context becomes noisy and expensive.
  Mitigation: Make retrieval-first behavior a core requirement and track why context items were selected.

- Risk: Permission prompts become too frequent.
  Mitigation: Provide policy rules early, with safe defaults and easy per-action approvals.

- Risk: OpenAI-compatible providers differ in subtle ways.
  Mitigation: Start with a narrow compatibility surface and clear provider diagnostics.

- Risk: VS Code extension host is not ideal for long-running agent tasks.
  Mitigation: Keep MVP simple, then consider a separate local Node.js service if dogfooding shows reliability issues.

- Risk: The agent overwrites user work.
  Mitigation: Inspect git/workspace state, use patches, preview diffs, and preserve unrelated changes.

## 14. Assumptions

- The first version is for personal dogfooding, not a polished public launch.
- TypeScript and the VS Code Extension API are the practical default stack for MVP.
- OpenAI-compatible provider support is more important than first-class support for every specific AI vendor SDK.
- Bothub can be treated as an OpenAI-compatible provider unless later testing proves otherwise.
- Retrieval-first context management is enough for MVP; persistent memory can come later.
- MCP and multi-agent orchestration are valuable later features but not MVP requirements.

## 15. Open Questions

- Which exact OpenAI-compatible API shape should be considered baseline: Chat Completions, Responses API compatibility, or both?
- Should the first implementation use a separate local agent process if extension-host responsiveness becomes an issue?
- What default verification command discovery should the agent use for unknown projects?
- How should model assignments be exposed in UI without overwhelming the user?
- What is the minimum useful semantic/project search implementation for MVP: VS Code search only, symbol search, embeddings, or a hybrid?
- Which permission policy format should be used: UI-only settings, JSON rules, or both?
