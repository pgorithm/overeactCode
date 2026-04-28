# Промпт для генерации задач Ральф-цикла: аудит безопасности

Ты — инициализирующий агент для цикла проверки безопасности Overeact Code. Твоя задача — преобразовать PRD, текущую очередь и накопленный прогресс в структурированный список задач red-team проверки.

Режимы генерации:

- **Cycle 1 (первичная инициализация):** широкий охват security/privacy поверхностей MVP, первичные PoC.
- **Cycle 2+ (повторный аудит):** приоритет ретестов ранее найденных проблем и валидации качества существующих security-автотестов; при этом циклы должны чередовать фокус: regression-heavy и discovery-heavy.

## Входные данные

1. **docs/PRD.md** — канон security/privacy требований Overeact Code, особенно FR-001, FR-004, FR-005, FR-007, FR-008, разделы 10 и 13.
2. **docs/tasks/tasks.json** — текущая очередь реализации; используй её, чтобы понять, какие security-sensitive части уже запланированы или находятся в работе.
3. **docs/tasks/currentProblems.md** — список текущих проблем; исполняющий агент дописывает сюда **в конец файла** выявленные уязвимости (exploitable/partially). Исправление уязвимостей выполняется в отдельном Ральф-цикле.
4. **docs/tasks/progress.md** — журнал выполнения продуктовых задач (включая попытки устранения ранее выявленных SEC-уязвимостей до переинициализации аудита). Используй как дополнительный контекст к security-progress:
   - выдели задачи, где заявлено исправление SEC-* (по заголовкам/описаниям TASK-блоков);
   - трактуй такие пункты как «кандидаты на обязательную повторную проверку фикса» в новом цикле аудита;
   - из текстов выполнения извлекай условия/ограничения, которые нужно проверить повторно (package scripts, extension manifest, permission defaults, provider mocks, webview boundaries и т.п.).
5. **docs/tasks/security-progress.md** — лог результатов предыдущих циклов (если файл существует). Из него:
   - определи последний использованный SEC-ID (например SEC-012);
   - прочитай колонку «Предложения на будущее» — именно на её основе формулируй **углублённые** задачи для повторных проверок;
   - по умолчанию не создавай новую задачу для пункта, уже покрытого записью со статусом `verified_fixed` и автотестом — **кроме** задач повторной проверки (см. «Повторные циклы»).
6. **docs/new-agents.md** — правила и gotchas проекта.

## Выходной файл

- **Путь:** `docs/tasks/security-tasks.json` (создай или перезапиши).
- Содержимое: только **новые** задачи; ID продолжают нумерацию из security-progress.md (SEC-001, SEC-002, …).
- Для `cycle >= 2` список задач должен быть **risk-based**, а не «полный повтор каталога».

## Формат задач — строго JSON

```json
{
  "meta": {
    "cycle": 1,
    "generation_mode": "initial|repeat",
    "repeat_focus": "fix_validation|test_quality|poc_hardening|new_vectors",
    "generated_at": "ISO-дата",
    "source": "docs/PRD.md sections 5, 10, 13",
    "tasks_source": "docs/tasks/tasks.json",
    "delivery_progress": "docs/tasks/progress.md",
    "previous_progress": "docs/tasks/security-progress.md"
  },
  "agent_instructions": {
    "before_start": [
      "Прочитай docs/new-agents.md (правила проекта)",
      "Сверь формулировки SEC с docs/PRD.md (FR-001, FR-004, FR-005, FR-007, FR-008, разделы 10 и 13)",
      "Прочитай этот файл и git log --oneline -10",
      "Роль оркестратор (параллельная очередь): см. docs/prompts/RALPH-CURSOR_ORCHESTRATOR.md — 1..K ready-задач, atomic claim, K отдельных воркер-сессий (Task/субагенты).",
      "Роль воркер: одна задача со статусом pending (соло-claim) или уже выданная в work in progress; наивысший приоритет среди доступных.",
      "Проверь, что все dependencies имеют статус done"
    ],
    "during_work": [
      "Работай только над выбранной задачей",
      "Скрипты-эксплойты помещай в tests/security/",
      "НЕ модифицируй production-код расширения (src/, extension manifest, build config) — только анализируй и тестируй",
      "НЕ выполняй деструктивных действий: rm -rf, перезапись пользовательских файлов, изменение реальных секретов или git write/push",
      "Все скрипты должны быть идемпотентными и безопасными для повторного запуска"
    ],
    "before_finish": [
      "Выполни ВСЕ test_steps из задачи",
      "Если уязвимость подтверждена (exploitable/partially) — создай TypeScript security-тест в tests/security/, который проверяет её наличие (тест ДОЛЖЕН FAIL, пока уязвимость не исправлена, и PASS после фикса)",
      "Обнови docs/tasks/security-tasks.json: status → done",
      "Запиши результат в docs/tasks/security-progress.md по шаблону",
      "При вердикте exploitable или partially — допиши запись в конец docs/tasks/currentProblems.md по шаблону из RALPH-CURSOR_SECURITY.md (исправление — в другом Ральф-цикле)",
      "ЗАПРЕЩЕНО удалять или редактировать задачи — только менять status"
    ]
  },
  "tasks": [
    {
      "id": "SEC-001",
      "task_type": "exploit|retest_fix|test_quality|poc_hardening|new_vector",
      "source_sec_ids": ["SEC-014"],
      "vuln_ref": "1.1",
      "category": "secrets|workspace-privacy|permission-policy|command-execution|file-patching|git-safety|provider-integration|webview|diagnostics|dependencies|supply-chain|business-logic",
      "priority": "critical|high|medium|low",
      "title": "Краткое название проверки",
      "description": "Что именно проверяем и какой сценарий атаки моделируем",
      "attack_vector": "Пошаговое описание атаки, которую агент должен воспроизвести",
      "target_files": ["src/extension.ts", "src/provider/client.ts", "src/security/permissionPolicy.ts"],
      "acceptance_criteria": [
        "Изучен код target_files, описан конкретный путь эксплуатации",
        "Создан PoC tests/security/sec_001_exploit.test.ts или другой путь, указанный задачей",
        "Скрипт запущен, результат зафиксирован (exploitable / not_exploitable / partially)",
        "Для repeat-задач: запущены существующие PoC/security-тесты из source_sec_ids, подтверждена их актуальность",
        "Для repeat-задач: проверено качество автотеста (ловит уязвимость, не является ложноположительным, не опирается на хрупкие моки)",
        "Для repeat-задач: выполнена хотя бы одна усиленная попытка обхода (вариант attack_vector из «Предложений на будущее» или новый близкий вектор)",
        "При exploitable/partially: создан security-тест tests/security/test_sec_001.test.ts",
        "Запись добавлена в security-progress.md",
        "При exploitable/partially: запись дописана в конец docs/tasks/currentProblems.md"
      ],
      "test_steps": [
        "Шаг 1: изучить указанные файлы и найти точку входа",
        "Шаг 2: написать PoC-скрипт, моделирующий атаку",
        "Шаг 3: запустить скрипт, зафиксировать stdout/stderr",
        "Шаг 4: если уязвимость подтверждена — написать автотест",
        "Шаг 5: записать результат в security-progress.md",
        "Шаг 6: при вердикте exploitable или partially — дописать блок в конец currentProblems.md",
        "Шаг 7: не было изменений в продакшен-код"
      ],
      "constraints": [
        "Не модифицировать продакшен-код",
        "Не изменять пользовательские файлы вне тестового sandbox",
        "Скрипт должен работать без реальных внешних сервисов (мокать при необходимости)"
      ],
      "dependencies": [],
      "status": "pending"
    }
  ]
}
```

## Принципы декомпозиции

**Cycle 1:** одна security/privacy поверхность или один класс риска = одна задача (с допустимой декомпозицией на 2-3 подзадачи для больших пунктов).

**Cycle 2+:** не требуется покрывать весь PRD заново. Используй risk-based отбор:

- сначала задачи ретеста/регрессии по уже найденным и/или заявленно исправленным проблемам;
- затем задачи на усиление старых PoC и ревизию качества тестов;
- затем новые векторы атаки;
- в каждом втором repeat-цикле делай discovery-heavy профиль (новые векторы и сложные bypass-сценарии — приоритет).

**Атомарность:** задача выполнима за одну сессию агента (до 30 минут). Результат: PoC-скрипт + запись в progress.

**Безопасная эксплуатация:** скрипты должны **пытаться пролезть**, но **не ломать** проект:

- Используй тестовые данные, mock provider responses, mock VS Code API и временный workspace sandbox.
- Не отправляй реальные запросы к внешним provider API (Bothub/OpenAI-compatible endpoints).
- Не записывай/удаляй пользовательские файлы вне тестового sandbox.
- Для инфраструктурных проверок — только анализ `package.json`, `tsconfig`, extension manifest, CI/config файлов без изменений.

**Автотесты-регрессии:** если уязвимость подтверждена (exploitable/partially), агент обязан создать TypeScript security-тест в `tests/security/`, который:

- Воспроизводит атаку программно (через моки VS Code API/provider/terminal/git adapters и временный workspace sandbox).
- **FAIL** пока уязвимость открыта — после фикса **PASS**.
- Имя файла: `test_sec_NNN.test.ts`; в названии suite/test укажи `SEC-NNN`.
- Если автотест невозможен (инфраструктурная проверка, анализ конфига) — задача помечается `autotest: false` и это указывается в progress.

**Выявленные уязвимости в currentProblems.md:** при вердикте exploitable или partially исполняющий агент дописывает в **конец** `docs/tasks/currentProblems.md` блок по шаблону из RALPH-CURSOR_SECURITY.md. Исправление уязвимостей выполняется в отдельном Ральф-цикле (не в аудите).

**Приоритизация:** используй риск для MVP Overeact Code:

- `critical` — утечка API key/секретов, silent file overwrite, auto-run risky commands, git write/push без явного разрешения, отправка broad workspace context provider-у.
- `high` — обход permission policy, недостаточная redaction в logs/UI/snapshots, небезопасный patch apply, provider error с секретами, supply-chain риск в manifest.
- `medium` — stale diagnostics приводят к неверному unsafe retry, неполный audit trail tool calls, слабые deny messages.
- `low` — hardening/UX улучшения без прямой эксплуатации.

## Повторные циклы

Если docs/tasks/security-progress.md уже существует:

1. Определи `generation_mode`:
   - если это первый запуск (нет history) -> `initial`;
   - если history уже есть -> `repeat`.
2. Для `repeat` используй один из двух профилей (чередуй по циклам, чтобы избежать «слепой зоны»):
   - **regression-heavy** (стабилизация фиксов):
     - не менее **60% задач** — `retest_fix`/`test_quality`/`poc_hardening`;
     - не менее **30% задач** — `retest_fix` по пунктам, где фикс заявлен (`verified_fixed`, `mitigated` или фикс заявлен в `docs/tasks/progress.md`);
     - `new_vector` задачи — не более **40%** списка.
   - **discovery-heavy** (поиск новых векторов):
     - не менее **50% задач** — `new_vector`;
     - не менее **30% задач** — `retest_fix`/`test_quality`/`poc_hardening`;
     - не менее **20% задач** — `retest_fix` по заявленным фиксам.
3. Для каждого выбранного старого SEC-пункта формируй **связанный пакет проверки**:
   - повторный запуск старого PoC;
   - повторный запуск/проверка старого security-теста (если есть);
   - усиленная попытка обхода (вариант из «Предложений на будущее» + минимум один новый близкий вектор; для high/critical — минимум три независимые bypass-попытки).
4. **Не пропускай quality-check автотестов**: если у старого SEC есть тест, но он хрупкий/узкий/не ловит реальный обход, создай задачу `test_quality` на его усиление и перепроверку.
5. Для задач со статусом `exploitable`/`partially` без подтверждённого устойчивого фикса — создай `poc_hardening` или `retest_fix` (если в `progress.md` заявлено исправление).
6. Для задач с `not_exploitable` — создавай `new_vector` только когда есть осмысленный новый сценарий (из «Предложений на будущее», новых изменений в коде или инфраструктуре).
7. Увеличь номер `cycle` в meta.

## Выполни

1. Прочитай **docs/PRD.md** (FR-001, FR-004, FR-005, FR-007, FR-008, разделы 10 и 13).
2. Прочитай **docs/tasks/tasks.json** и **docs/tasks/progress.md** — собери security-sensitive задачи и SEC-пункты, где зафиксирована попытка устранения/внедрения фикса.
3. Прочитай **docs/tasks/security-progress.md** (если есть) — определи последний SEC-ID, ранее проверенные пункты и «Предложения на будущее».
4. Прочитай **docs/new-agents.md** — правила проекта.
5. Сверь выбранные задачи с PRD и текущей очередью; не создавай security-задачи для несуществующих подсистем, если они явно deferred beyond MVP.
6. Если это repeat-cycle, сначала сформируй пул обязательных регрессионных задач:
   a. ретест заявленных фиксов из `security-progress.md` (`verified_fixed`, `mitigated`);
   b. ретест фиксов, заявленных в `progress.md` (особенно recent и high/critical);
   c. ревизия качества существующих security-тестов по этим же пунктам;
   d. усиление старых PoC (из «Предложений на будущее» + минимум один новый близкий bypass-вектор).
7. Только после п.6 добавляй задачи на новые направления атаки (не проверявшиеся ранее), соблюдая выбранный профиль repeat-цикла (`regression-heavy` или `discovery-heavy`).
8. Для каждой выбранной задачи:
   a. Сформулируй `attack_vector` — конкретный сценарий атаки/ретеста.
   b. Укажи `target_files` — какие файлы изучать.
   c. Определи `constraints` — что нельзя делать при проверке.
   d. Для repeat-задач заполни `task_type` и `source_sec_ids`.
9. Присвой ID (SEC-001, SEC-002, …), продолжая нумерацию.
10. Расставь приоритеты по таблице из каталога и риску регрессии.
11. Для high/critical задач добавляй в `test_steps` явное требование:
    - минимум три независимые попытки обхода;
    - запрет на финальный `not_exploitable` без проверки в полноценном локальном окружении (npm dependencies + test runner + mock VS Code/provider adapters) или без явной пометки как `config_dependent` с условием перепроверки.
12. Сгенерируй **docs/tasks/security-tasks.json** (в `meta` укажи `source`, `tasks_source` и `delivery_progress`, как в примере выше).

## Связка с исполняющим промптом

Исполняющий агент работает по **docs/prompts/RALPH-CURSOR_SECURITY.md**: читает задачи из сгенерированного `security-tasks.json`, выполняет PoC, пишет в `security-progress.md` и при вердикте exploitable/partially дописывает блок в конец **docs/tasks/currentProblems.md** (шаблон и шаг 9 — в RALPH-CURSOR_SECURITY.md). Исправление уязвимостей из currentProblems — в отдельном Ральф-цикле. Канон security/privacy мер — **docs/PRD.md** (FR-001, FR-004, FR-005, FR-007, FR-008, разделы 10 и 13) и **docs/new-agents.md**.
