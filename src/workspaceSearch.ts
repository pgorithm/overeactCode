export interface WorkspaceFileSearchResult {
  uri: string;
  filePath: string;
  fileName: string;
  source: "file_pattern" | "text_query";
  matchCount: number;
  preview: string | null;
}

export interface WorkspaceSymbolSearchResult {
  name: string;
  kind: string;
  containerName: string;
  filePath: string;
  uri: string;
  range: {
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
  };
}

export interface SearchUri {
  fsPath: string;
  toString: () => string;
}

export interface SearchRange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

export interface WorkspaceSymbolLike {
  name: string;
  kind: number | string;
  containerName?: string;
  location: {
    uri: SearchUri;
    range: SearchRange;
  };
}

export interface WorkspaceSearchApi {
  findFiles: (
    include: string,
    exclude?: string,
    maxResults?: number
  ) => PromiseLike<readonly SearchUri[]>;
  asRelativePath: (pathOrUri: string | SearchUri, includeWorkspaceFolder?: boolean) => string;
  executeWorkspaceSymbolProvider: (
    query: string
  ) => PromiseLike<readonly WorkspaceSymbolLike[] | undefined>;
  symbolKindToString?: (kind: number | string) => string;
}

export function createWorkspaceSearchApi(): WorkspaceSearchApi {
  const vscodeApi = require("vscode") as typeof import("vscode");
  return {
    findFiles: (include, exclude, maxResults) =>
      vscodeApi.workspace.findFiles(include, exclude, maxResults),
    asRelativePath: (pathOrUri, includeWorkspaceFolder) =>
      vscodeApi.workspace.asRelativePath(pathOrUri as unknown as string, includeWorkspaceFolder),
    executeWorkspaceSymbolProvider: (query) =>
      vscodeApi.commands.executeCommand<readonly WorkspaceSymbolLike[]>(
        "vscode.executeWorkspaceSymbolProvider",
        query
      ),
    symbolKindToString: (kind) => {
      if (typeof kind === "string") {
        return kind;
      }

      return vscodeApi.SymbolKind[kind] ?? "Unknown";
    }
  };
}

export class WorkspaceSearchTool {
  public constructor(private readonly api: WorkspaceSearchApi = createWorkspaceSearchApi()) {}

  public async searchFiles(input: {
    include?: string;
    textQuery?: string;
    exclude?: string;
    maxResults?: number;
  }): Promise<WorkspaceFileSearchResult[]> {
    const include = input.include?.trim();
    const textQuery = input.textQuery?.trim();
    if (!include && !textQuery) {
      throw new Error("Workspace search requires include pattern or text query.");
    }

    if (textQuery) {
      return this.searchByTextQuery(textQuery, include, input.exclude, input.maxResults);
    }

    return this.searchByGlob(include!, input.exclude, input.maxResults);
  }

  public async searchSymbols(
    query: string,
    maxResults = 50
  ): Promise<WorkspaceSymbolSearchResult[]> {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      throw new Error("Symbol search query must not be empty.");
    }

    const symbols = await this.api.executeWorkspaceSymbolProvider(trimmedQuery);
    const limited = [...(symbols ?? [])].slice(0, maxResults);
    return limited.map((symbol) => ({
      name: symbol.name,
      kind: this.resolveSymbolKind(symbol.kind),
      containerName: symbol.containerName ?? "",
      filePath: this.api.asRelativePath(symbol.location.uri, false),
      uri: symbol.location.uri.toString(),
      range: {
        startLine: symbol.location.range.startLine,
        startCharacter: symbol.location.range.startCharacter,
        endLine: symbol.location.range.endLine,
        endCharacter: symbol.location.range.endCharacter
      }
    }));
  }

  private async searchByGlob(
    include: string,
    exclude?: string,
    maxResults = 50
  ): Promise<WorkspaceFileSearchResult[]> {
    const matches = await this.api.findFiles(include, exclude, maxResults);
    return matches.map((match) => ({
      uri: match.toString(),
      filePath: this.api.asRelativePath(match, false),
      fileName: pathBasename(this.api.asRelativePath(match, false)),
      source: "file_pattern",
      matchCount: 1,
      preview: null
    }));
  }

  private async searchByTextQuery(
    textQuery: string,
    include?: string,
    exclude?: string,
    maxResults = 50
  ): Promise<WorkspaceFileSearchResult[]> {
    const candidates = await this.api.findFiles(
      include ?? "**/*",
      exclude,
      Math.max(maxResults * 4, maxResults)
    );
    const lowered = textQuery.toLowerCase();
    const matches: WorkspaceFileSearchResult[] = [];
    for (const candidate of candidates) {
      const filePath = this.api.asRelativePath(candidate, false);
      const fileName = pathBasename(filePath);
      const searchable = `${filePath} ${fileName}`.toLowerCase();
      if (!searchable.includes(lowered)) {
        continue;
      }

      matches.push({
        uri: candidate.toString(),
        filePath,
        fileName,
        source: "text_query",
        matchCount: 1,
        preview: null
      });
    }

    return matches.slice(0, maxResults);
  }

  private resolveSymbolKind(kind: number | string): string {
    if (this.api.symbolKindToString) {
      return this.api.symbolKindToString(kind);
    }

    if (typeof kind === "string") {
      return kind;
    }

    return `kind-${kind}`;
  }
}

function pathBasename(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? value;
}
