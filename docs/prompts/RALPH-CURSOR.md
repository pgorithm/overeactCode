# RALPH Cursor Entry Point

Работаем по Ральф-методологии с очередью `docs/tasks/tasks.json`.

Этот файл — только маршрутизатор. Не дублируй здесь solo/worker/orchestrator протоколы.

## Обязательная инициализация

1. Прочитай `docs/new-agents.md`.
2. Прочитай `docs/tasks/tasks.json`.
3. Выполни в корне репозитория `git log --oneline -20`.
4. Выбери режим по контексту запуска.

## Режимы

- **Solo:** если пользователь просит одного агента выполнить следующую задачу, следуй `docs/prompts/RALPH-CURSOR_SOLO.md`.
- **Orchestrator:** если пользователь запускает `docs/prompts/RALPH-CURSOR_ORCHESTRATOR.md`, просит вести очередь целиком, параллелить задачи или работать с `docs/tasks/tasks.json` как control-plane, следуй `docs/prompts/RALPH-CURSOR_ORCHESTRATOR.md` и always-on guardrail `.cursor/rules/ralph-orchestrator-loop.mdc`.
- **Worker under orchestrator:** если задача уже выдана через claim (`status = "work in progress"` и твой `assignee`), следуй `.cursor/skills/orchestrator-worker/SKILL.md` и инструкциям диспетчера.

## Канонические источники

- Структура очереди: `docs/tasks/tasks.template.json`.
- Роли оркестратора: `.cursor/skills/orchestrator-dispatcher/`, `.cursor/skills/orchestrator-worker/`, `.cursor/skills/orchestrator-test-coordinator/`, `.cursor/skills/orchestrator-reviewer/`.
- Non-stop завершение оркестраторного цикла: `.cursor/rules/ralph-orchestrator-loop.mdc`.
