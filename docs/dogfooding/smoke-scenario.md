# Overeact Code Dogfooding Smoke Scenario

This scenario validates that the MVP flow works for a small real coding task in local VS Code usage.

## Preconditions

- The extension is compiled and tests pass (`npm run compile`, `npm test`).
- Provider settings are configured:
  - `Overeact Code: Configure Provider`
  - `Overeact Code: Configure Provider API Key`
- Open any small test workspace with a TypeScript file.

## Packaging / Launch Check

Use the local Extension Development Host flow as the packaging sanity check for MVP:

1. Press `F5` in the extension project to launch Extension Development Host.
2. Confirm no critical activation errors in the Extension Host output.
3. Run `Overeact Code: Open` from Command Palette and verify the side composer opens.

## Smoke Scenario (Small Real Task)

1. In side composer, submit a small safe task (example: "rename one local variable and update related references in current file").
2. Verify the agent shows a plan before edits.
3. Approve a safe action when prompted by policy/permission UI.
4. Verify progress sections update:
   - plan/progress stage,
   - tool activity,
   - verification results.
5. Verify final summary includes:
   - changed files,
   - checks run,
   - unresolved issues/assumptions,
   - suggested next steps.

## Unresolved MVP Questions (Dogfooding Notes)

- API baseline: what minimum provider response behavior should be required for "ready" state.
- Search depth: how far retrieval should go before asking user to narrow scope.
- Verification discovery: how to pick project verification commands when scripts are incomplete or custom.
- Model routing UI: whether end users need explicit routing controls in MVP UI or settings-only is enough.
- Policy format: how much policy customization should be exposed to users without reducing safety defaults.
