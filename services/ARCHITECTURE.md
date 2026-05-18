# Astral userver Services — Architecture

> C++ микросервисы на [userver](https://userver.tech/) для оптимизации критических путей бэкенда. **Прозрачно для фронта** — те же URL, те же JSON-ответы. Перенос endpoint-ов из Node/Gleam без клиентских изменений через Caddy маршрутизацию.

## Цель

Снизить latency и CPU-cost на hot-path endpoints бэкенда, переводя read-heavy операции из Node.js (Hono) и Erlang (Gateway) на C++ (userver, корутины). Фронт ничего не должен знать — маршрутизация через Caddy.

Ожидаемый выигрыш на перенесённых endpoints:
- **p50**: 2-5× меньше
- **p99**: 5-20× меньше
- **CPU**: 5-10× меньше
- **Concurrency**: 10k+ без деградации (vs Node event loop)

---

## Текущее состояние (Apr 2026)

- `services/userver_health/` — минимальный skeleton (`MinimalServerComponentList`, один handler)
- Порт 8080, профиль `userver` в `dev/compose.yaml`
- На проде: `dev-userver-health-1` (healthy)
- Caddy матчит `/api/v1/*` → Node `api:8080`

**Никаких production-путей ещё не перенесено.**

---

## Целевая архитектура

```
              ┌──────────┐
Frontend  →   │  Caddy   │  (reverse proxy + routing)
(astraof.com) │  :443    │
              └────┬─────┘
                   │
    ┌──────────────┼──────────────────────────┐
    │              │                          │
    ▼              ▼                          ▼
┌─────────┐   ┌──────────────┐        ┌──────────────┐
│ api:8080│   │ userver-*    │ (fast  │ gateway:6000 │
│ (Node)  │   │ (C++)        │  path) │  (Erlang)    │
└─────────┘   └──────┬───────┘        └──────────────┘
                     │
           ┌─────────┼────────┬──────┐
           ▼         ▼        ▼      ▼
       ┌──────┐  ┌──────┐  ┌─────┐ ┌────┐
       │Scylla│  │Redis │  │ PG  │ │S3  │
       └──────┘  └──────┘  └─────┘ └────┘
```

### Маршрутизация в Caddy

```caddyfile
# C++ fast-path (with Node fallback)
@invites path_regexp ^/api/v1/invites/[A-Za-z0-9_-]+$
handle @invites {
    reverse_proxy userver-invites:8080 api:8080 {
        lb_policy first
        lb_try_duration 300ms
        fail_duration 10s
        unhealthy_status 5xx
    }
}

# Default: Node API
handle /api/* {
    reverse_proxy api:8080
}
```

`lb_policy first` + `lb_try_duration` → если userver не ответил за 300мс или вернул 5xx, Caddy автоматически перекидывает на Node. **Zero-downtime rollout.**

---

## Список микросервисов

| Сервис | Путь | Источники данных | Приоритет | QPS (est) |
|--------|------|------------------|-----------|-----------|
| `userver_health` | `/health`, `/metrics`, `/info`, `/ping` | — | ✅ Фаза 1 | n/a |
| `userver_instance` | `GET /api/v1/instance` | ENV/config (read-only, no DB) | 🟢 Фаза 2a | средний (hot при bootstrap) |
| `userver_invites` | `GET /api/v1/invites/:code` | Scylla + Redis | 🔥 P0 | высокий |
| `userver_auth` | Internal `/validate` для token check | Redis | 🔥 P0 | очень высокий |
| `userver_ratelimit` | Internal `/check/:key` | Redis+Lua | P1 | очень высокий |
| `userver_unfurler` | Internal fetch OG | HTTP + Redis cache | P2 | средний |
| `userver_presence` | `GET /api/v1/presence/guild/:id/count` | Redis | P2 | высокий |
| `userver_thumbnail` | `GET /thumbnails/*` | libvips + S3 | P3 | высокий |

**Фаза 2a** (`userver_instance`) специально выбран как самый простой real endpoint:
не требует DB-клиентов, валидирует Docker/Caddy/shadow pipeline без затрат на Scylla/Redis.
Фаза 2b (`userver_invites`) добавляется поверх отлаженной инфраструктуры.

---

## Shared infrastructure (общая для всех сервисов)

Планируется вынести в `services/common/` (header-only + CMake interface library):

### 1. `common/config` — dynamic configs
- hot reload из YAML/Consul
- runtime toggles (feature flags, circuit breakers)

### 2. `common/logging` — structured JSON
```json
{"ts":"2026-04-24T21:00:00Z","level":"info","service":"userver-invites","request_id":"...","path":"/api/v1/invites/abc","duration_ms":3}
```

### 3. `common/metrics` — Prometheus
- `http_requests_total{method,path,status}`
- `http_request_duration_seconds{method,path}` (histogram)
- `cache_hits_total{cache}`
- `db_query_duration_seconds{db,query}` (histogram)

### 4. `common/tracing` — OpenTelemetry
- W3C traceparent propagation
- spans: handler → cache → db

### 5. `common/clients`
- `ScyllaClient` — pool с health check
- `RedisClient` — pipeline + Lua scripts
- `PostgresClient` — prepared statements
- `HttpClient` — connection pool, retries, circuit breaker

### 6. `common/contracts` — JSON schemas
- типы ответов 1-в-1 с Node API (`astral_api/src/.../*Response`)
- тесты на совместимость

---

## Migration strategy для каждого endpoint

```
Фаза A: Dark launch (0% traffic)
├─ сервис написан и задеплоен
├─ Caddy НЕ маршрутизирует на него
└─ health check + sanity ping

Фаза B: Shadow traffic (0% user-visible)
├─ Caddy копирует 100% запросов в userver ПАРАЛЛЕЛЬНО с Node
├─ ответ userver игнорируется, только метрики + diff
└─ сравнение JSON response shape, status codes, latency

Фаза C: Canary (5% → 50% → 100%)
├─ Caddy реально отдаёт ответ userver
├─ fallback на Node при 5xx/timeout
└─ rollout controlled через weight

Фаза D: Cleanup
├─ удалить endpoint из Node API (опц.)
└─ финальный монитор 2 недели
```

---

## План по фазам (по времени)

### Фаза 1: Infrastructure (1 неделя)
**Цель:** Base для всех будущих сервисов.

- [ ] `services/common/` — shared CMake interface library
- [ ] `userver_health` расширить:
  - [ ] `/metrics` — Prometheus
  - [ ] `/health` — version, uptime, build_id, commit
  - [ ] structured JSON logging
  - [ ] graceful shutdown
  - [ ] dynamic config support
- [ ] `docker-compose.yml` — профиль `userver` с метриками volumes
- [ ] Prometheus scrape config

### Фаза 2: Invite resolver (P0, 1 неделя)
- [ ] `services/userver_invites/`
  - [ ] Scylla client setup + `invites` table binding
  - [ ] Redis cache layer (TTL 60s)
  - [ ] `GET /invites/:code` handler
  - [ ] JSON response 1-в-1 с Node (см. `astral_api/src/invite/InviteService.ts`)
  - [ ] Contract tests
- [ ] Shadow traffic настроить в Caddy
- [ ] Canary 5% → 100%

### Фаза 3: Session validator (P0, 2 недели)
- [ ] `services/userver_auth/`
  - [ ] internal service (без public path)
  - [ ] `POST /validate` → `{user_id, scopes, valid_until}`
  - [ ] Redis lookup + in-memory LRU (локальный, hot)
  - [ ] Интегрировать в Node `UserMiddleware` через HTTP call
- [ ] Измерить улучшение API response time

### Фаза 4: Rate limiter (P1, 1 неделя)
- [ ] `services/userver_ratelimit/`
  - [ ] Token bucket через Redis+Lua (atomic)
  - [ ] `POST /check` → `{allowed, remaining, reset_at}`

### Фаза 5-7: Unfurler / Presence / Thumbnail (по 1 неделе каждый)

---

## Observability

Каждый сервис обязан экспортировать:

### Метрики (Prometheus)
- `{service}_requests_total{method,path,status}` — counter
- `{service}_request_duration_seconds{method,path}` — histogram (buckets: 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5)
- `{service}_in_flight` — gauge
- `{service}_cache_hits_total{cache_name}` / `misses_total` — counter
- `{service}_upstream_errors_total{upstream,error}` — counter

### Dashboards (Grafana)
- Service overview: QPS, latency histogram, error rate
- Per-endpoint breakdown
- Cache hit ratio
- Upstream health

### Алерты
- `ALERT HighErrorRate: error_rate > 1% for 5m`
- `ALERT HighLatency: p99 > 500ms for 5m`
- `ALERT DownstreamDown: upstream_errors > 10/s for 1m`

---

## Testing strategy

### Unit tests
- userver имеет `utest` — встроенный testing framework
- mock для БД, time, HTTP clients
- каждый handler покрыт

### Contract tests
- в `services/{name}/tests/contracts/`
- проверка JSON response 1-в-1 с эталоном из Node API
- автоматически запускаются в CI

### Load tests
- `k6` / `wrk` против dev stack
- baseline: измерить Node API до
- сравнение: userver с теми же параметрами
- принимаем если **минимум 2× улучшение p50 и p99**

### Shadow tests (prod)
- Caddy направляет 100% прод трафика в userver, но ответ игнорирует
- сравниваем: JSON structure, status code, latency
- выявляем drift до реального switch

---

## Не-цели (что **не** делаем)

- ❌ Переписывать весь API на C++ — Node/Hono остаётся основой
- ❌ Менять клиентские SDK / URL
- ❌ Переписывать WebSocket gateway (Erlang OTP сам по себе эффективен)
- ❌ Менять ORM / схемы БД
- ❌ Переносить write-heavy endpoints до стабилизации read-heavy

---

## Риски и митигация

| Риск | Митигация |
|------|-----------|
| **JSON response drift** (C++ vs Node) | Contract tests + shadow diff |
| **Падение userver → 5xx** | Caddy fallback на Node |
| **Незаметная regression** | Shadow traffic перед canary |
| **Overhead на мелких запросах** | Профилирование до production switch |
| **Сложность C++ разработки** | Shared infrastructure + шаблоны |

---

## Файловая структура

```
services/
├── ARCHITECTURE.md            ← ты здесь
├── common/                    ← shared infra (Фаза 1)
│   ├── CMakeLists.txt
│   ├── config/
│   ├── logging/
│   ├── metrics/
│   ├── clients/
│   └── contracts/
├── userver_health/            ← существующий, расширить (Фаза 1)
├── userver_invites/           ← Фаза 2
├── userver_auth/              ← Фаза 3
├── userver_ratelimit/         ← Фаза 4
├── userver_unfurler/          ← Фаза 5
├── userver_presence/          ← Фаза 6
└── userver_thumbnail/         ← Фаза 7
```

---

## Следующий шаг

Начать Фазу 1: расширение `userver_health` + создание `services/common/`. Подробности — в отдельном PR.
