---
name: dependency-security-audit
description: >-
  Audits dependency manifests and lockfiles for known CVEs (critical/high) and
  supply-chain compromise signals. Runs ecosystem scanners, interprets results,
  and flags suspicious packages or versions. Use when reviewing security,
  updating dependencies, CI, SBOM, pip-audit, npm/pnpm audit, OSV, or when the
  user asks about vulnerable or compromised packages (уязвимости зависимостей,
  скомпрометированные пакеты, supply chain).
---

# Аудит зависимостей: уязвимости и признаки компрометации

## Когда включать

- Запрос на проверку зависимостей, зависимостей перед релизом, после `git pull`.
- Подозрение на supply chain: незнакомый пакет, странная версия, массовое обновление транзитивов.

## Принципы

- **Не утверждать «взлом» без источника**: явная рекомендация вендора, CVE с указанием затронутых версий, публикация в OSV/GitHub Advisory/npm security.
- Различать **прямые** и **транзитивные** зависимости; для фикса часто нужен bump прямой зависимости или pin/exclude с оценкой риска.
- Соблюдать контекст проекта: читать [docs/new-agents.md](../../../docs/new-agents.md) (Build & Test, Security); на Windows при отсутствии `uv`/`python` в PATH использовать `py -m ...`.

## Шаг 1 — Определить экосистемы

Найти в корне репозитория (и при необходимости в подпроектах):

| Сигнал | Экосистема |
|--------|------------|
| `pyproject.toml`, `requirements*.txt`, `uv.lock` | Python |
| `package-lock.json` | npm |
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | Yarn |

Зафиксировать, что является **источником истины** для продакшена (Dockerfile, CI).

## Шаг 2 — Сканирование известных уязвимостей

**Python (этот репозиторий):** pre-commit уже настроен на аудит метаданных проекта:

```bash
pre-commit run pip-audit --all-files
```

Если pre-commit недоступен:

```bash
py -m pip install pip-audit
py -m pip_audit .
```

Аргумент `.` важен: иначе pip-audit может сканировать окружение хука, а не проект (см. gotcha в [docs/new-agents.md](../../../docs/new-agents.md)).

**Node (если есть lockfile):**

```bash
npm audit --omit=dev
# или: pnpm audit
```

Фокус на **critical** / **high** и на цепочках с известным эксплойтом в advisory.

## Шаг 3 — Проверка «следов взлома» (эвристики)

Помимо CVE, проверить:

1. **Typosquatting** — имя пакета отличается на 1–2 символа от популярного (`reqeusts` vs `requests`, `python-jose` vs похожих имён).
2. **Внезапная смена поведения** — в lockfile/diff появились новые транзитивы без обновления прямых зависимостей; версии «скачком» на мажор без явной причины.
3. **Малоизвестный пакет с широкими правами** — post-install скрипты, загрузка бинарей с внешних URL (для npm: изучить `package.json` подозрительных пакетов).
4. **Сверка с OSV** — для спорных находок: [https://osv.dev/](https://osv.dev/) по имени пакета и версии.

Если есть публичное подтверждение инцидента (официальный пост PyPI/npm, GitHub Security Advisory) — явно процитировать и указать затронутые версии.

## Шаг 4 — Отчёт

Использовать шаблон:

```markdown
## Аудит зависимостей

### Сводка
- Экосистемы: …
- Инструменты: …

### Критические / высокие находки (CVE)
| Пакет | Версия | ID | Затронутый диапазон | Рекомендация |

### Supply chain / эвристики
| Наблюдение | Риск | Действие |

### Остаточный риск
- Что не проверялось (например, только prod, без dev).
```

## Ограничения

- Сканеры не заменяют анализ кода; 0 findings ≠ гарантия безопасности.
- Не хранить и не выводить секреты при разборе `package.json` / логов.
