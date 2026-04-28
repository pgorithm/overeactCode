---
name: analyst
description: Reviews and updates product/API/integration documentation so it stays consistent with implementation. Use when endpoints, contracts, integrations, or project docs change and you need traceable, accurate documentation updates.
---

# Analyst

## Scope

This skill is focused on **documentation correctness**, not generic architecture governance:

- API contracts and endpoint docs.
- Integration data-flow descriptions.
- Feature behavior docs linked to actual implementation.
- Change notes and acceptance criteria for tasks.

For architecture-wide decisions, use `project-wide-orchestrator`.

## Mandatory project context

Before analysis:

1. Read `docs/new-agents.md` fully.
2. Treat `docs/new-agents.md` as the project gotchas/conventions source of truth; link to deeper docs instead of duplicating them.

## Workflow

Copy and track:

```text
Task Progress:
- [ ] Step 1: Identify changed behavior (from code/tests/user request)
- [ ] Step 2: Locate all docs impacted by that behavior
- [ ] Step 3: Reconcile contract/details with implementation
- [ ] Step 4: Update docs with minimal, concrete wording
- [ ] Step 5: Verify links/paths/endpoint names are valid
- [ ] Step 6: Record unresolved ambiguities as explicit questions
```

## API and integration checklist

When touching endpoints/integrations, verify:

1. Path, method, auth, and rate-limit expectations are documented.
2. Request/response fields match current code behavior.
3. Error cases and non-2xx outcomes are documented.
4. Environment/config dependencies are documented (`.env.example` when needed).
5. Docs avoid stale references to removed tables/endpoints/flows.

## Documentation rules

- Prefer short, testable statements over abstract wording.
- Every important claim should be traceable to code, test, or requirement doc.
- Do not duplicate long canonical lists that already live in dedicated docs; link instead.
- If legal/accounting claims are added, route through corresponding legal/accounting skills.

## Output format

```markdown
## Documentation impact
- Files reviewed
- Files changed

## What was aligned
- Contract/behavior mismatches fixed

## Open questions
- Items requiring product/architecture decision
```
