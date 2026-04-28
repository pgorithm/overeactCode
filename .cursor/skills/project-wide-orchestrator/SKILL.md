---
name: project-wide-orchestrator
description: Orchestrates repo-wide investigation by dispatching bounded parallel subagents, synthesizing their findings into one report, and avoiding over-dispatch. Use when the request requires coverage of the whole project (global code review, security review, architecture-wide documentation planning).
---

# Project-Wide Orchestrator

## Purpose

Use this skill when the user asks a question that requires broad repository coverage and synthesis across many subsystems.

Do not use it for local tasks that are answerable from a small file set.

## Start Gate (mandatory)

Before launching any subagents, classify the request:

1. **Global scope required** if at least one is true:
   - User explicitly asks to inspect "whole project", "entire repo", "all modules".
   - The question type is global by nature:
     - full code review,
     - full security review,
     - project-wide documentation package planning,
     - architecture/standards consistency audit.
   - You cannot produce a reliable answer without sampling most major areas.
2. **Local scope** otherwise.

If local scope: do not invoke orchestrator flow.

## Dispatch Budget (anti-overkill)

Choose worker count by estimated breadth:

- **2-3 workers**: small-to-medium global review.
- **4-6 workers**: large repo, normal deep scan (default).
- **7-8 workers max**: only for very broad, explicitly deep audits.

Hard limits:

- Never exceed **8** workers.
- Never create nested orchestration deeper than:
  - `orchestrator -> worker`, or
  - `orchestrator -> worker -> specialist` (rare, targeted).
- Forbid uncontrolled recursion (`worker -> worker -> worker` loops).

## Domain Partitioning

Assign workers to non-overlapping slices. Prefer this split:

1. API/routes and contracts
2. Services/business logic
3. Data layer/migrations
4. Security/auth/rate-limits/secrets handling
5. Bot/integrations/background jobs
6. Tests/quality gates/docs (merge this with another slice if worker budget is low)

If repo topology differs, adapt slices by directories but keep overlap minimal.

## Worker Prompt Contract

Each worker prompt must include:

1. Exact scope (directories/files).
2. Question to answer for that scope.
3. Evidence requirement:
   - cite concrete file paths/symbols,
   - separate facts from assumptions.
4. Output format:
   - findings,
   - risks,
   - unknowns,
   - confidence.
5. Constraint:
   - no edits unless explicitly requested.

## Escalation Rule

Allow a worker to spawn at most **one** specialist subagent only if:

- it hits a genuinely deep subdomain (for example a large security subsystem), and
- the specialist reduces risk of shallow conclusions.

The worker must then return one merged mini-summary to parent orchestrator.

## Synthesis Protocol

After workers finish:

1. Merge all outputs into one map of the project.
2. Deduplicate repeated observations.
3. Resolve contradictions explicitly.
4. Mark unresolved unknowns and what evidence is missing.
5. Produce one final response with:
   - **Coverage map** (what was scanned),
   - **Key findings** (ordered by severity/impact),
   - **Risks and gaps**,
   - **Recommended next actions**.

## Stop Conditions

Stop dispatching new workers when:

- all planned domain slices are covered, or
- additional workers would only duplicate existing coverage.

If uncertain between "one more worker" vs "synthesize now", prefer synthesize now.
