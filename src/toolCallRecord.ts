import { randomUUID } from "crypto";

export const TOOL_CALL_STATUSES = [
  "pending",
  "approved",
  "denied",
  "running",
  "succeeded",
  "failed"
] as const;

export const TOOL_PERMISSION_DECISIONS = [
  "pending",
  "approved",
  "denied"
] as const;

export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];
export type ToolPermissionDecision = (typeof TOOL_PERMISSION_DECISIONS)[number];

export interface ToolCallRecord {
  id: string;
  sessionId: string;
  toolName: string;
  inputSummary: string;
  outputSummary: string;
  status: ToolCallStatus;
  permissionDecision: ToolPermissionDecision;
  startedAt: string | null;
  finishedAt: string | null;
}

type TimestampFactory = () => string;

export class ToolCallRecordStore {
  private readonly records = new Map<string, ToolCallRecord>();

  public createPendingRecord(input: {
    id?: string;
    sessionId: string;
    toolName: string;
    inputSummary: string;
    outputSummary?: string;
  }): ToolCallRecord {
    const record: ToolCallRecord = {
      id: input.id ?? randomUUID(),
      sessionId: input.sessionId,
      toolName: input.toolName,
      inputSummary: input.inputSummary,
      outputSummary: input.outputSummary ?? "",
      status: "pending",
      permissionDecision: "pending",
      startedAt: null,
      finishedAt: null
    };

    this.records.set(record.id, record);
    return record;
  }

  public setPermissionDecision(
    recordId: string,
    decision: Extract<ToolPermissionDecision, "approved" | "denied">,
    nowFactory: TimestampFactory = () => new Date().toISOString()
  ): ToolCallRecord {
    const record = this.getRecordOrThrow(recordId);
    if (record.status !== "pending") {
      throw new Error(
        `Tool call ${recordId} can only be permission-reviewed from pending status.`
      );
    }

    const updated: ToolCallRecord = {
      ...record,
      permissionDecision: decision,
      status: decision,
      finishedAt: decision === "denied" ? nowFactory() : record.finishedAt
    };

    this.records.set(recordId, updated);
    return updated;
  }

  public markRunning(
    recordId: string,
    nowFactory: TimestampFactory = () => new Date().toISOString()
  ): ToolCallRecord {
    const record = this.getRecordOrThrow(recordId);
    if (record.status !== "approved") {
      throw new Error(`Tool call ${recordId} can only start from approved status.`);
    }

    const updated: ToolCallRecord = {
      ...record,
      status: "running",
      startedAt: nowFactory()
    };

    this.records.set(recordId, updated);
    return updated;
  }

  public markFinished(
    recordId: string,
    completion: Extract<ToolCallStatus, "succeeded" | "failed">,
    outputSummary: string,
    nowFactory: TimestampFactory = () => new Date().toISOString()
  ): ToolCallRecord {
    const record = this.getRecordOrThrow(recordId);
    if (record.status !== "running") {
      throw new Error(
        `Tool call ${recordId} can only be completed from running status.`
      );
    }

    const updated: ToolCallRecord = {
      ...record,
      status: completion,
      outputSummary,
      finishedAt: nowFactory()
    };

    this.records.set(recordId, updated);
    return updated;
  }

  public getBySessionId(sessionId: string): ToolCallRecord[] {
    return [...this.records.values()].filter(
      (record) => record.sessionId === sessionId
    );
  }

  private getRecordOrThrow(recordId: string): ToolCallRecord {
    const record = this.records.get(recordId);
    if (!record) {
      throw new Error(`Tool call record ${recordId} was not found.`);
    }

    return record;
  }
}
