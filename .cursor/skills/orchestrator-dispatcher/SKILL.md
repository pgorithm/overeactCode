---
name: orchestrator-dispatcher
description: Coordinates task distribution for RALPH queues, selects ready tasks by dependency and priority, performs atomic task claims, and manages lease/recovery state. Use when running or supervising parallel execution of docs/tasks/tasks.json, or when the user asks to orchestrate workers.
---

# Orchestrator Dispatcher

## Role

Dispatcher is the control-plane agent for parallel execution of `docs/tasks/tasks.json`.
It does not implement product code tasks unless explicitly asked for emergency takeover.

## Required Inputs

1. Read `docs/new-agents.md` fully before any action.
2. Read `docs/prompts/RALPH-CURSOR.md`.
3. Read `docs/prompts/RALPH-CURSOR_ORCHESTRATOR.md`.
4. Read current `docs/tasks/tasks.json`.

## Task Selection Rules

- Only tasks with `status = "pending"` are eligible.
- All `dependencies` must be `done`.
- Choose highest priority first (`critical > high > medium > low`).
- Prefer tasks with low file-overlap risk for parallel starts.

## Atomic Claim Protocol

Before launching a worker:

1. Re-read `docs/tasks/tasks.json`.
2. Re-check the target task is still `pending`.
3. In one update set:
   - `status = "work in progress"`
   - `assignee = <worker-id>`
   - `claimed_at = <ISO timestamp>`
   - `lease_until = <ISO timestamp>`
4. Persist file.
5. Immediately run a sanity-check diff for `docs/tasks/tasks.json`: only the intended claimed `TASK-xxx` block may change.
6. If unrelated task blocks changed, do **not** launch worker; restore foreign task blocks, record `status_reason` as `queue_corruption: <who/what changed>`, and re-run claim.
7. Only then start worker execution.

If claim fails due to concurrent update, re-read queue and choose another task.

## Parallel worker launch (K>1)

- After claiming **K** tasks, start **K separate worker sessions** in parallel (e.g. multiple **Task** invocations with `run_in_background=true`, one claimed task per Task). The dispatcher session must not silently serialize all implementation work when independent workers are available and the orchestrator policy allows K>1.
- Run the post-claim sanity-check for each claimed task before launching any worker in the batch; if any claim is corrupt, fix queue state first and relaunch only after all claims are clean.
- Each worker prompt must include task id, worker id (`assignee`), and pointers to `orchestrator-worker` + `RALPH-CURSOR.md` + `RALPH-CURSOR_ORCHESTRATOR.md`.
- Full-suite test ownership stays with **Test Coordinator** per orchestrator policy; workers run narrow/smoke tests only.

## Lease and Recovery

- If lease expires and no progress artifacts appear, reclaim task.
- Recovery action:
  - `status = "pending"` for transient failure, or `status = "blocked"` for real blocker.
  - clear `assignee`, `claimed_at`, `lease_until`
  - write short `status_reason`.

## Boundaries

- Dispatcher may modify only orchestration metadata and statuses.
- Dispatcher must not mark `done` directly unless review is explicitly skipped by project rules.
- Dispatcher must not alter task scope, acceptance criteria, or delete tasks.
- Dispatcher must schedule test-coordinator pass before reviewer `done` decision in parallel mode.

## Status Pipeline

Use strict flow:

`pending -> work in progress -> needs_review -> done`

Service states allowed: `blocked`, `failed`.

## Dispatcher Output Format

After each orchestration cycle, report:

```text
В работе: TASK-...
На ревью: TASK-...
Блокеры: TASK-... (reason)
Готово: N/M
Следующая к запуску: TASK-...
```
