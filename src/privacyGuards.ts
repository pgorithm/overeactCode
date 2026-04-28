import type { ComposerFinalSummary } from "./composerViewModel";
import type { ToolCallRecord } from "./toolCallRecord";

const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /\bsk-[a-z0-9_-]{6,}\b/gi,
  /\bBearer\s+[a-z0-9._-]{6,}\b/gi,
  /\bapi[_-]?key\s*[=:]\s*["']?[a-z0-9._-]{6,}["']?/gi
];

function redactSensitiveText(value: string): string {
  return SECRET_PATTERNS.reduce((current, pattern) => {
    return current.replace(pattern, "[REDACTED]");
  }, value);
}

function sanitizeStringList(values: readonly string[]): string[] {
  return values.map((entry) => redactSensitiveText(entry));
}

export function sanitizeToolCallRecord(record: ToolCallRecord): ToolCallRecord {
  return {
    ...record,
    inputSummary: redactSensitiveText(record.inputSummary),
    outputSummary: redactSensitiveText(record.outputSummary)
  };
}

export function sanitizeFinalSummary(
  summary: ComposerFinalSummary
): ComposerFinalSummary {
  return {
    changedFiles: sanitizeStringList(summary.changedFiles),
    checksRun: sanitizeStringList(summary.checksRun),
    unresolvedIssues: sanitizeStringList(summary.unresolvedIssues),
    assumptions: sanitizeStringList(summary.assumptions),
    suggestedNextSteps: sanitizeStringList(summary.suggestedNextSteps)
  };
}

export interface ProviderContextSelectionInput {
  retrievalCompleted: boolean;
  selectedContextItems: readonly string[];
}

export function ensureTargetedContextSelection(
  input: ProviderContextSelectionInput
): readonly string[] {
  if (!input.retrievalCompleted) {
    throw new Error(
      "Retrieval-first policy: complete targeted retrieval before provider call."
    );
  }

  if (input.selectedContextItems.length === 0) {
    throw new Error(
      "Retrieval-first policy: select at least one targeted context item."
    );
  }

  return input.selectedContextItems.map((item) => redactSensitiveText(item));
}
