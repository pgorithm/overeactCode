# Промпт для генерации docs/tasks/tasks.json по PRD Overeact Code

Ты — инициализирующий агент для долгосрочного проекта. Твоя задача — по **актуальному PRD Overeact Code** и с учётом **уже проделанной работы** из progress сформировать структурированный список **новых** задач в формате tasks.json, чтобы другие агенты могли работать инкрементально, по одной задаче за сессию.

## Контекст процесса

1. Список проблем, решений и идей хранится в **docs/tasks/currentProblems.md**.
2. Промпт **docs/prompts/generatePRDAdditions.md** по этому списку дополняет **docs/PRD.md** — уточняет функциональные требования, риски, open questions, milestones или backlog без привязки к старому разделу 3.5.
3. **Этот** промпт использует актуальный PRD и **docs/tasks/progress.md** (история выполненных задач) и создаёт **docs/tasks/tasks.json** только с новыми задачами, продолжая нумерацию с последнего ID из progress.
4. Overeact Code — TypeScript VS Code extension MVP: side composer, local agent loop, retrieval-first context, patch proposals, permission policies, terminal verification, diagnostics, git awareness и OpenAI-compatible provider configuration.

## Входные данные

1. **docs/PRD.md** — разделы **3–15**: MVP scope, flows, functional requirements, data model, technical recommendations, integrations, security/privacy, milestones, risks и open questions. Это основной источник требований для формулировки задач.
2. **docs/tasks/progress.md** — история выполнения: по нему определи последний использованный TASK-ID (например TASK-038) и не создавай задачи, которые по смыслу уже закрыты записями в progress.
3. По желанию: **docs/tasks/currentProblems.md** — для контекста (исходный список проблем).

## Выходной файл

- **Путь**: **docs/tasks/tasks.json** (создай или перезапиши этот файл).
- **Формат**: строго по шаблону `docs/tasks/tasks.template.json`.
- **Содержимое**: только **новые** задачи, соответствующие MVP PRD, milestones, open questions и текущим проблемам. ID задач продолжают нумерацию из **docs/tasks/progress.md** (например, если последняя запись — TASK-038, новые задачи — TASK-039, TASK-040, …). Задачи, которые по смыслу уже отражены в progress как выполненные, в tasks.json не включай.

## Требования к выходному файлу tasks.json

### 1. Формат задач — строго JSON

Используй JSON, а не Markdown. `docs/tasks/tasks.json` должен соответствовать `docs/tasks/tasks.template.json`; не копируй схему в этот промпт и не создавай формат без orchestration-полей.

Канон:

- структура корня, `agent_instructions` и обязательные поля задачи — `docs/tasks/tasks.template.json`;
- детальный RALPH-протокол — `docs/prompts/RALPH-CURSOR.md`, `docs/prompts/RALPH-CURSOR_ORCHESTRATOR.md` и `.cursor/skills/orchestrator-*`.

### 2. Принципы декомпозиции

**Атомарность**: Каждая задача должна быть выполнима за одну сессию агента. Если задача требует более 30 минут работы — разбей её.

**Независимость**: Минимизируй зависимости между задачами. Агент должен иметь возможность взять задачу и завершить её, не трогая другие.

**Тестируемость**: Каждая задача должна иметь конкретные шаги проверки, которые агент может выполнить end-to-end (не только unit-тесты, но и реальная проверка как пользователь).

**Приоритизация**: Сначала extension scaffold, provider/secret setup, agent session/tool log, permission model и безопасные patch/verification основы; затем UI-улучшения и dogfooding.

### 3. Категории задач

Присваивай задачам категории по смыслу требования PRD:

- **infrastructure**: scaffold VS Code extension, TypeScript config, packaging, scripts, test infra.
- **functional**: agent session lifecycle, retrieval, context tracking, patch proposals, verification loop.
- **ui**: side composer, plan/progress/tool activity/diff/permission/final summary UX.
- **integration**: OpenAI-compatible provider client, VS Code APIs, diagnostics, git, terminal execution.
- **security**: SecretStorage, permission policies, redaction, workspace privacy, command/file safety.

Не все категории обязательны в одном наборе — текущий PRD/очередь могут содержать только часть из них.

### 4. Правила для coding-агентов

В начало файла включи `agent_instructions` из `docs/tasks/tasks.template.json` без расширенного пересказа RALPH-протокола. Если нужно уточнить запуск, добавляй только ссылки на `docs/prompts/RALPH-CURSOR.md`, `docs/prompts/RALPH-CURSOR_ORCHESTRATOR.md` и `.cursor/skills/orchestrator-*`.

### 5. Количество задач

Для MVP Overeact Code число задач обычно 10–30. Группируй по milestones из PRD: scaffold/provider, session/tool log, retrieval/read-only context, patch editing, verification loop, dogfooding hardening. Если один milestone даёт больше 5–7 задач — проверь, не слишком ли мелкая декомпозиция; если одна задача смешивает разные подсистемы — разбей по смыслу.

## Выполни

1. Прочитай **docs/PRD.md**, **docs/tasks/currentProblems.md** и **docs/tasks/progress.md** (определи последний TASK-ID и уже выполненную работу).
2. Выдели требования из MVP scope, FR-001…FR-009, data model, security/privacy, milestones и open questions, которые ещё не покрыты записями в progress или текущим `tasks.json`.
3. Декомпозируй каждое такое требование в атомарные задачи; используй acceptance criteria из PRD и делай `test_steps` проверяемыми через npm/unit tests, Extension Development Host или ручной smoke flow.
4. Присвой новым задачам ID, продолжая нумерацию после последнего в progress (TASK-039, TASK-040, …).
5. Определи зависимости между новыми задачами (и при необходимости укажи зависимости от уже выполненных по progress).
6. Расставь приоритеты (critical path первым).
7. Сгенерируй **docs/tasks/tasks.json** в формате JSON по `docs/tasks/tasks.template.json` (в начале файла — блок agent_instructions, затем массив tasks только с новыми задачами).
