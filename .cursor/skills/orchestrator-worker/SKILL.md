---
name: orchestrator-worker
description: Executes one claimed RALPH task under orchestrator control, implements acceptance criteria, runs task-focused quality gates, and returns a handoff report without editing queue files. Use when a worker agent is assigned a task from docs/tasks/tasks.json.
---

# Orchestrator Worker

## Role

Worker executes exactly one assigned task from `docs/tasks/tasks.json` and prepares an isolated implementation handoff for review.

## Required Inputs

1. Read `docs/new-agents.md` fully.
2. Read `docs/prompts/RALPH-CURSOR.md`.
3. Read `docs/prompts/RALPH-CURSOR_ORCHESTRATOR.md`.
4. Read assigned task in `docs/tasks/tasks.json`.

## Start Conditions

Begin only if all are true:

- Task `status` is `work in progress`.
- Task `assignee` matches current worker.
- Dependencies are already `done`.

If any condition fails, stop and return control to dispatcher.

## Execution Scope

- Work on one task only.
- Implement all `acceptance_criteria`.
- Do not modify unrelated code.
- Do not modify orchestration queue files: `docs/tasks/tasks.json` and `docs/tasks/progress.md` are single-writer files owned by the dispatcher/orchestrator control plane.

## Mandatory Quality Gate

Run in repository root using project scripts:

1. `npm run compile`
2. Task-focused test commands from `test_steps` (typically `npm test` for this extension repo) or the narrowest safe subset relevant to changed paths.

Fallback only if npm is unavailable in PATH:

1. `npm.cmd run compile`
2. `npm.cmd test` (or targeted subset command)

Then execute all manual `test_steps` and record outcomes.

Full-suite test run used for `done` decision is owned by `orchestrator-test-coordinator` in parallel mode.

## Transition to Review

After successful implementation and checks:

1. Do **not** edit `docs/tasks/tasks.json`.
2. Do **not** edit `docs/tasks/progress.md`.
3. Return a structured handoff report to the dispatcher/orchestrator with:
   - lint command and result
   - targeted test command(s) and result
   - `test_steps` outcomes (or explicit manual-needed note)
   - explicit handoff note: "awaiting test-coordinator full-suite verdict"
   - short change summary
   - changed files list
  - explicit note that worker did not create commits and commit is owned by orchestrator/reviewer

If gate fails:

- do not edit queue metadata
- return `status_reason` and failure artifacts in the handoff report
- stop if retry would require changing unrelated files

## Boundaries

- Worker must not set `done` when `review_required = true`.
- Worker must not re-prioritize queue or reassign other tasks.
- Worker must not edit `docs/tasks/tasks.json` at all.
- Worker must not edit `docs/tasks/progress.md` at all.
