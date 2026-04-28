import { randomUUID } from "crypto";

export const AGENT_SESSION_STATUSES = [
  "idle",
  "planning",
  "editing",
  "verifying",
  "blocked",
  "completed",
  "failed"
] as const;

export type AgentSessionStatus = (typeof AGENT_SESSION_STATUSES)[number];

export interface AgentSession {
  id: string;
  workspaceUri: string;
  userRequest: string;
  status: AgentSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export type AgentLoopPhase =
  | "task_understood"
  | "context_retrieved"
  | "plan_proposed"
  | "plan_change_requested"
  | "plan_approved"
  | "editing_started"
  | "editing_finished"
  | "verification_finished"
  | "retry_requested"
  | "summary_published";

export type PlanApprovalDecision = "accept" | "request_changes";

export interface AgentLoopState {
  sessionId: string;
  status: AgentSessionStatus;
  retrievalCompleted: boolean;
  planSummary: string | null;
  planApproved: boolean;
  lastPlanDecision: PlanApprovalDecision | null;
  retryCount: number;
  summary: string | null;
  phaseHistory: AgentLoopPhase[];
}

export class AgentSessionStore {
  private readonly sessions = new Map<string, AgentSession>();

  public createSession(input: {
    workspaceUri: string;
    userRequest: string;
    id?: string;
  }): AgentSession {
    const now = new Date().toISOString();
    const session: AgentSession = {
      id: input.id ?? randomUUID(),
      workspaceUri: input.workspaceUri,
      userRequest: input.userRequest,
      status: "planning",
      createdAt: now,
      updatedAt: now
    };

    this.sessions.set(session.id, session);
    return session;
  }

  public updateStatus(
    sessionId: string,
    status: AgentSessionStatus,
    nowFactory: () => string = () => new Date().toISOString()
  ): AgentSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Agent session ${sessionId} was not found.`);
    }

    const updated: AgentSession = {
      ...session,
      status,
      updatedAt: nowFactory()
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  public getById(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }
}

export class AgentLoopController {
  private readonly loopStateBySession = new Map<string, AgentLoopState>();

  public begin(sessionId: string): AgentLoopState {
    const state: AgentLoopState = {
      sessionId,
      status: "planning",
      retrievalCompleted: false,
      planSummary: null,
      planApproved: false,
      lastPlanDecision: null,
      retryCount: 0,
      summary: null,
      phaseHistory: ["task_understood"]
    };
    this.loopStateBySession.set(sessionId, state);
    return state;
  }

  public markContextRetrieved(sessionId: string): AgentLoopState {
    const state = this.requireState(sessionId);
    if (!state.retrievalCompleted) {
      state.retrievalCompleted = true;
      state.phaseHistory.push("context_retrieved");
    }
    return state;
  }

  public canReadLargeFiles(sessionId: string): boolean {
    return this.requireState(sessionId).retrievalCompleted;
  }

  public proposePlan(sessionId: string, planSummary: string): AgentLoopState {
    const state = this.requireState(sessionId);
    if (!state.retrievalCompleted) {
      throw new Error(
        "Retrieval must complete before proposing a plan for the session."
      );
    }
    state.planSummary = planSummary;
    state.planApproved = false;
    state.lastPlanDecision = null;
    state.status = "planning";
    state.phaseHistory.push("plan_proposed");
    return state;
  }

  public decidePlan(
    sessionId: string,
    decision: PlanApprovalDecision
  ): AgentLoopState {
    const state = this.requireState(sessionId);
    if (!state.planSummary) {
      throw new Error("Plan approval requires an existing proposed plan.");
    }
    if (decision === "accept") {
      state.planApproved = true;
      state.lastPlanDecision = decision;
      state.phaseHistory.push("plan_approved");
      return state;
    }

    state.planApproved = false;
    state.lastPlanDecision = decision;
    state.phaseHistory.push("plan_change_requested");
    return state;
  }

  public beginEditing(sessionId: string): AgentLoopState {
    const state = this.requireState(sessionId);
    if (!state.retrievalCompleted) {
      throw new Error("Retrieval must complete before editing begins.");
    }
    if (!state.planApproved) {
      throw new Error("Editing cannot start before plan approval.");
    }
    state.status = "editing";
    state.phaseHistory.push("editing_started");
    return state;
  }

  public finishEditing(sessionId: string): AgentLoopState {
    const state = this.requireState(sessionId);
    state.status = "verifying";
    state.phaseHistory.push("editing_finished");
    return state;
  }

  public finishVerification(
    sessionId: string,
    result: "completed" | "failed"
  ): AgentLoopState {
    const state = this.requireState(sessionId);
    state.status = result;
    state.phaseHistory.push("verification_finished");
    return state;
  }

  public requestRetry(sessionId: string): AgentLoopState {
    const state = this.requireState(sessionId);
    state.retryCount += 1;
    state.status = "planning";
    state.planApproved = false;
    state.lastPlanDecision = null;
    state.phaseHistory.push("retry_requested");
    return state;
  }

  public publishSummary(sessionId: string, summary: string): AgentLoopState {
    const state = this.requireState(sessionId);
    state.summary = summary;
    state.phaseHistory.push("summary_published");
    return state;
  }

  public getState(sessionId: string): AgentLoopState | undefined {
    return this.loopStateBySession.get(sessionId);
  }

  private requireState(sessionId: string): AgentLoopState {
    const state = this.loopStateBySession.get(sessionId);
    if (!state) {
      throw new Error(
        `Agent loop state for session ${sessionId} was not found.`
      );
    }
    return state;
  }
}
