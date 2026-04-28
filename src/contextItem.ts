import { randomUUID } from "crypto";

export const CONTEXT_SOURCE_TYPES = ["file"] as const;

export type ContextSourceType = (typeof CONTEXT_SOURCE_TYPES)[number];

export interface ContextItem {
  id: string;
  sessionId: string;
  sourceType: ContextSourceType;
  sourceUri: string;
  reason: string;
  rawContent: string | null;
  summary: string | null;
  createdAt: string;
}

export interface CreateFileContextInput {
  sessionId: string;
  sourceUri: string;
  reason: string;
  content: string;
  id?: string;
  maxRawContentChars?: number;
}

export class ContextItemStore {
  private readonly items = new Map<string, ContextItem>();

  public createFileContext(
    input: CreateFileContextInput,
    nowFactory: () => string = () => new Date().toISOString()
  ): ContextItem {
    const payload = summarizeIfOversized(
      input.content,
      input.maxRawContentChars ?? 4000
    );

    const item: ContextItem = {
      id: input.id ?? randomUUID(),
      sessionId: input.sessionId,
      sourceType: "file",
      sourceUri: input.sourceUri,
      reason: input.reason,
      rawContent: payload.rawContent,
      summary: payload.summary,
      createdAt: nowFactory()
    };

    this.items.set(item.id, item);
    return item;
  }

  public getBySessionId(sessionId: string): ContextItem[] {
    return [...this.items.values()].filter((item) => item.sessionId === sessionId);
  }
}

function summarizeIfOversized(
  content: string,
  maxRawContentChars: number
): { rawContent: string | null; summary: string | null } {
  if (content.length <= maxRawContentChars) {
    return {
      rawContent: content,
      summary: null
    };
  }

  const headLength = Math.max(120, Math.floor(maxRawContentChars * 0.2));
  const head = content.slice(0, headLength).replace(/\s+/g, " ").trim();
  return {
    rawContent: null,
    summary: `Summarized oversized file content (${content.length} chars). Head preview: ${head}`
  };
}
