import * as assert from "assert";
import {
  WorkspaceSearchTool,
  type SearchUri,
  type WorkspaceSearchApi,
  type WorkspaceSymbolLike
} from "../../workspaceSearch";

suite("Workspace search adapters", () => {
  test("returns matching files for glob pattern search", async () => {
    let capturedInclude: string | undefined;
    let capturedExclude: string | undefined;
    let capturedMaxResults: number | undefined;
    let readFileCalls = 0;

    const api = createApi({
      findFiles: async (include, exclude, maxResults) => {
        capturedInclude = include;
        capturedExclude = exclude;
        capturedMaxResults = maxResults;
        return [mockUri("/workspace/src/workspaceSearch.ts")];
      },
      readFile: async () => {
        readFileCalls += 1;
        return "";
      }
    });

    const tool = new WorkspaceSearchTool(api);
    const result = await tool.searchFiles({
      include: "**/*.ts",
      exclude: "**/node_modules/**",
      maxResults: 10
    });

    assert.strictEqual(capturedInclude, "**/*.ts");
    assert.strictEqual(capturedExclude, "**/node_modules/**");
    assert.strictEqual(capturedMaxResults, 10);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.filePath, "src/workspaceSearch.ts");
    assert.strictEqual(result[0]?.source, "file_pattern");
    assert.strictEqual(readFileCalls, 0);
  });

  test("returns matching files for text query search", async () => {
    let readFileCalls = 0;
    const api = createApi({
      findFiles: async () => {
        return [
          mockUri("/workspace/src/extension.ts"),
          mockUri("/workspace/src/agentSession.ts"),
          mockUri("/workspace/src/veryLargeUnrelatedFile.log")
        ];
      },
      readFile: async () => {
        readFileCalls += 1;
        return "large unrelated file";
      }
    });

    const tool = new WorkspaceSearchTool(api);
    const results = await tool.searchFiles({
      textQuery: ".ts",
      include: "src/**/*.ts",
      maxResults: 25
    });

    assert.strictEqual(results.length, 2);
    assert.ok(results.every((entry) => entry.source === "text_query"));
    const extensionEntry = results.find((entry) => entry.fileName === "extension.ts");
    assert.ok(extensionEntry);
    assert.strictEqual(extensionEntry?.matchCount, 1);
    assert.strictEqual(extensionEntry?.preview, null);
    assert.strictEqual(readFileCalls, 0);
  });

  test("uses workspace symbol provider and returns symbol metadata", async () => {
    let requestedQuery: string | undefined;
    const api = createApi({
      executeWorkspaceSymbolProvider: async (query) => {
        requestedQuery = query;
        return [mockSymbol("AgentSessionStore", 5, "agentSession", "/workspace/src/agentSession.ts")];
      },
      symbolKindToString: (kind) => {
        if (kind === 5) {
          return "Class";
        }

        return "Unknown";
      }
    });

    const tool = new WorkspaceSearchTool(api);
    const symbols = await tool.searchSymbols("AgentSession");

    assert.strictEqual(requestedQuery, "AgentSession");
    assert.strictEqual(symbols.length, 1);
    assert.strictEqual(symbols[0]?.name, "AgentSessionStore");
    assert.strictEqual(symbols[0]?.kind, "Class");
    assert.strictEqual(symbols[0]?.filePath, "src/agentSession.ts");
  });
});

function createApi(
  overrides: Partial<WorkspaceSearchApi & { readFile: (uri: SearchUri) => Promise<string> }>
): WorkspaceSearchApi {
  return {
    findFiles:
      overrides.findFiles ??
      (async () => []),
    asRelativePath:
      overrides.asRelativePath ??
      ((pathOrUri) => {
        const uri = typeof pathOrUri === "string" ? mockUri(pathOrUri) : pathOrUri;
        return uri.fsPath.replace("/workspace/", "");
      }),
    executeWorkspaceSymbolProvider:
      overrides.executeWorkspaceSymbolProvider ??
      (async () => [] as const),
    symbolKindToString: overrides.symbolKindToString
  };
}

function mockUri(path: string): SearchUri {
  return {
    fsPath: path,
    toString: () => `file://${path}`
  };
}

function mockSymbol(
  name: string,
  kind: number | string,
  containerName: string,
  path: string
): WorkspaceSymbolLike {
  return {
    name,
    kind,
    containerName,
    location: {
      uri: mockUri(path),
      range: {
        startLine: 24,
        startCharacter: 0,
        endLine: 67,
        endCharacter: 1
      }
    }
  };
}
