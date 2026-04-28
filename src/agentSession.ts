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
