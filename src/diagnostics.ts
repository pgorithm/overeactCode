export interface DiagnosticPosition {
  line: number;
  character: number;
}

export interface DiagnosticRange {
  start: DiagnosticPosition;
  end: DiagnosticPosition;
}

export interface WorkspaceDiagnostic {
  filePath: string;
  uri: string;
  message: string;
  severity: "error" | "warning" | "information" | "hint";
  source: string;
  code: string;
  range: DiagnosticRange;
}

export interface DiagnosticsSummary {
  preExisting: WorkspaceDiagnostic[];
  likelyNew: WorkspaceDiagnostic[];
  baselineAvailable: boolean;
}

interface VscodeDiagnosticLike {
  message: string;
  severity: number;
  source?: string;
  code?: string | number | { value: string | number };
  range: {
    start: DiagnosticPosition;
    end: DiagnosticPosition;
  };
}

interface VscodeUriLike {
  toString(): string;
}

export interface DiagnosticsApi {
  getWorkspaceDiagnostics: () => [VscodeUriLike, readonly VscodeDiagnosticLike[]][];
  getDiagnosticsForUri: (uri: VscodeUriLike) => readonly VscodeDiagnosticLike[];
  asRelativePath: (pathOrUri: string | VscodeUriLike, includeWorkspaceFolder?: boolean) => string;
  parseUri: (value: string) => VscodeUriLike;
}

export function createDiagnosticsApi(): DiagnosticsApi {
  const vscodeApi = require("vscode") as typeof import("vscode");
  return {
    getWorkspaceDiagnostics: () => vscodeApi.languages.getDiagnostics(),
    getDiagnosticsForUri: (uri) =>
      vscodeApi.languages.getDiagnostics(uri as unknown as import("vscode").Uri),
    asRelativePath: (pathOrUri, includeWorkspaceFolder) =>
      vscodeApi.workspace.asRelativePath(
        pathOrUri as unknown as string,
        includeWorkspaceFolder
      ),
    parseUri: (value) => vscodeApi.Uri.parse(value)
  };
}

export class DiagnosticsTool {
  public constructor(private readonly api: DiagnosticsApi = createDiagnosticsApi()) {}

  public readDiagnostics(input?: {
    touchedFileUris?: string[];
  }): WorkspaceDiagnostic[] {
    if (input?.touchedFileUris && input.touchedFileUris.length > 0) {
      return input.touchedFileUris.flatMap((uriValue) =>
        this.collectForUri(this.api.parseUri(uriValue))
      );
    }

    return this.collectAll();
  }

  public summarizeAgainstBaseline(
    currentDiagnostics: WorkspaceDiagnostic[],
    baselineDiagnostics?: WorkspaceDiagnostic[]
  ): DiagnosticsSummary {
    if (!baselineDiagnostics) {
      return {
        preExisting: [],
        likelyNew: currentDiagnostics,
        baselineAvailable: false
      };
    }

    const baselineKeys = new Set(baselineDiagnostics.map((entry) => toDiagnosticKey(entry)));
    const preExisting: WorkspaceDiagnostic[] = [];
    const likelyNew: WorkspaceDiagnostic[] = [];
    for (const diagnostic of currentDiagnostics) {
      if (baselineKeys.has(toDiagnosticKey(diagnostic))) {
        preExisting.push(diagnostic);
      } else {
        likelyNew.push(diagnostic);
      }
    }

    return {
      preExisting,
      likelyNew,
      baselineAvailable: true
    };
  }

  private collectAll(): WorkspaceDiagnostic[] {
    return this.api
      .getWorkspaceDiagnostics()
      .flatMap(([uri, diagnostics]) => this.mapDiagnostics(uri, diagnostics));
  }

  private collectForUri(uri: VscodeUriLike): WorkspaceDiagnostic[] {
    return this.mapDiagnostics(uri, this.api.getDiagnosticsForUri(uri));
  }

  private mapDiagnostics(
    uri: VscodeUriLike,
    diagnostics: readonly VscodeDiagnosticLike[]
  ): WorkspaceDiagnostic[] {
    return diagnostics.map((diagnostic) => ({
      filePath: this.api.asRelativePath(uri, false),
      uri: uri.toString(),
      message: diagnostic.message,
      severity: mapSeverity(diagnostic.severity),
      source: diagnostic.source ?? "vscode",
      code: normalizeCode(diagnostic.code),
      range: {
        start: diagnostic.range.start,
        end: diagnostic.range.end
      }
    }));
  }
}

function mapSeverity(value: number): WorkspaceDiagnostic["severity"] {
  if (value === 0) {
    return "error";
  }
  if (value === 1) {
    return "warning";
  }
  if (value === 2) {
    return "information";
  }

  return "hint";
}

function normalizeCode(value: VscodeDiagnosticLike["code"]): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object" && "value" in value) {
    return String(value.value);
  }

  return "unknown";
}

function toDiagnosticKey(value: WorkspaceDiagnostic): string {
  return [
    value.filePath,
    value.message,
    value.severity,
    value.source,
    value.code,
    value.range.start.line,
    value.range.start.character,
    value.range.end.line,
    value.range.end.character
  ].join("|");
}
