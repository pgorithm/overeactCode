import * as assert from "assert";
import {
  DiagnosticsTool,
  type DiagnosticsApi,
  type WorkspaceDiagnostic
} from "../../diagnostics";

suite("Diagnostics adapter", () => {
  test("reads workspace diagnostics when no touched files are provided", () => {
    let workspaceCalls = 0;
    const api = createApi({
      getWorkspaceDiagnostics: () => {
        workspaceCalls += 1;
        return [[mockUri("/workspace/src/a.ts"), [mockDiagnostic("Workspace issue", 1, 77)]]];
      }
    });

    const tool = new DiagnosticsTool(api);
    const result = tool.readDiagnostics();

    assert.strictEqual(workspaceCalls, 1);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.filePath, "src/a.ts");
    assert.strictEqual(result[0]?.severity, "warning");
  });

  test("reads diagnostics for touched files only", () => {
    const requestedUris: string[] = [];
    const api = createApi({
      getDiagnosticsForUri: (uri) => {
        requestedUris.push(uri.toString());
        if (uri.toString() === "file:///workspace/src/new.ts") {
          return [mockDiagnostic("New error", 0, 10)];
        }

        return [];
      }
    });

    const tool = new DiagnosticsTool(api);
    const result = tool.readDiagnostics({
      touchedFileUris: ["file:///workspace/src/new.ts"]
    });

    assert.deepStrictEqual(requestedUris, ["file:///workspace/src/new.ts"]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.filePath, "src/new.ts");
    assert.strictEqual(result[0]?.severity, "error");
    assert.strictEqual(result[0]?.code, "10");
  });

  test("classifies pre-existing and likely new diagnostics with baseline", () => {
    const tool = new DiagnosticsTool(createApi({}));
    const preExisting = createDiagnostic("src/a.ts", "Rule violation");
    const likelyNew = createDiagnostic("src/b.ts", "Type mismatch");
    const summary = tool.summarizeAgainstBaseline(
      [preExisting, likelyNew],
      [preExisting]
    );

    assert.strictEqual(summary.baselineAvailable, true);
    assert.strictEqual(summary.preExisting.length, 1);
    assert.strictEqual(summary.preExisting[0]?.filePath, "src/a.ts");
    assert.strictEqual(summary.likelyNew.length, 1);
    assert.strictEqual(summary.likelyNew[0]?.filePath, "src/b.ts");
  });

  test("marks all diagnostics as likely new without baseline", () => {
    const tool = new DiagnosticsTool(createApi({}));
    const current = [createDiagnostic("src/current.ts", "Current diagnostic")];
    const summary = tool.summarizeAgainstBaseline(current);

    assert.strictEqual(summary.baselineAvailable, false);
    assert.strictEqual(summary.preExisting.length, 0);
    assert.strictEqual(summary.likelyNew.length, 1);
    assert.strictEqual(summary.likelyNew[0]?.filePath, "src/current.ts");
  });
});

function createApi(overrides: Partial<DiagnosticsApi>): DiagnosticsApi {
  return {
    getWorkspaceDiagnostics: overrides.getWorkspaceDiagnostics ?? (() => []),
    getDiagnosticsForUri: overrides.getDiagnosticsForUri ?? (() => []),
    asRelativePath:
      overrides.asRelativePath ??
      ((pathOrUri) => {
        const uri = typeof pathOrUri === "string" ? mockUri(pathOrUri) : pathOrUri;
        return uri.toString().replace("file:///workspace/", "");
      }),
    parseUri:
      overrides.parseUri ??
      ((value) => ({
        toString: () => value
      }))
  };
}

function mockUri(path: string): { toString: () => string } {
  return {
    toString: () => `file://${path}`
  };
}

function mockDiagnostic(message: string, severity: number, code: number) {
  return {
    message,
    severity,
    source: "ts",
    code,
    range: {
      start: { line: 1, character: 2 },
      end: { line: 1, character: 4 }
    }
  };
}

function createDiagnostic(filePath: string, message: string): WorkspaceDiagnostic {
  return {
    filePath,
    uri: `file:///workspace/${filePath}`,
    message,
    severity: "error",
    source: "ts",
    code: "2339",
    range: {
      start: { line: 1, character: 1 },
      end: { line: 1, character: 3 }
    }
  };
}
