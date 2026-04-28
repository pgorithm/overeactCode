# Common Context

## Purpose

This file is a quick orientation guide for AI agents: only non-obvious pitfalls
that frequently break local runs, builds, tests, migrations, security checks, agentic flows,
etc.

## Rules

- Before starting a task, read this file fully.
- Keep entries minimal: one line per gotcha, focused on "symptom -> check/fix".
- Do not duplicate README/docstrings/playbooks; link to source docs instead.
- Agent-facing docs ownership: `AGENTS.md` bootstraps, `.cursor/rules/` holds always-on guardrails, `.cursor/skills/` holds role workflows, `docs/prompts/` holds user-run workflows, and `docs/tasks/tasks.template.json` is the queue schema canon.

## Known Gotchas

- RALPH orchestration gotchas live in `.cursor/rules/ralph-orchestrator-loop.mdc`.
