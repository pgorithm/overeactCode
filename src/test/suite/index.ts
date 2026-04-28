import * as path from "path";
import * as Mocha from "mocha";

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: "tdd",
    color: true
  });

  const testsRoot = path.resolve(__dirname);
  mocha.addFile(path.resolve(testsRoot, "./extension.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./agentSession.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./agentLoop.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./providerConfiguration.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./permissionPolicy.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./permissionPrompt.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./toolCallRecord.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./workspaceSearch.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./patchProposal.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./patchReview.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./diagnostics.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./fileReadTool.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./gitAwareness.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./terminalTool.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./composerViewModel.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./filesystemToolExecutor.test.js"));
  mocha.addFile(path.resolve(testsRoot, "./privacyGuards.test.js"));

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
        return;
      }

      resolve();
    });
  });
}
