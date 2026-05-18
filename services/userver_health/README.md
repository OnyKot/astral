# Astral userver Health Service

Small C++ service based on [userver](https://github.com/userver-framework/userver). It is intentionally isolated from the main Node API so userver can be introduced without changing existing production request paths. Serves as the **infrastructure reference** for future C++ microservices — see `services/ARCHITECTURE.md`.

## Endpoints

| Listener | Port | Path | Purpose |
|----------|------|------|---------|
| public   | 8080 | `/health` | JSON health + version + uptime |
| public   | 8080 | `/info`   | Extended build/commit/version/uptime |
| monitor  | 8081 | `/ping`   | Minimal liveness (200 "OK") |
| monitor  | 8081 | `/metrics`| Prometheus-compatible metrics dump |

The **monitor** listener runs on its own task processor so `/metrics` stays scrapable even when the main pool is saturated — standard userver pattern.

## Run locally (Docker Compose)

```bash
# Build & start (userver profile is opt-in)
just up userver-health
# or:
docker compose --env-file dev/.env -f dev/compose.yaml --profile userver up -d userver-health

# Public endpoints
curl http://localhost:8088/userver/health
curl http://localhost:8088/userver/info

# Monitor endpoints (map 8081 if you want to scrape from host)
docker compose exec userver-health curl -s localhost:8081/metrics | head
docker compose exec userver-health curl -s localhost:8081/ping
```

Expected `/health`:

```json
{
  "status": "ok",
  "service": "astral-userver-health",
  "framework": "userver",
  "version": "0.1.0",
  "uptime_seconds": 42
}
```

Expected `/info`:

```json
{
  "service": "astral-userver-health",
  "framework": "userver",
  "version": "0.1.0",
  "build_id": "dev",
  "commit": "unknown",
  "uptime_seconds": 42
}
```

## Build metadata

`Dockerfile` accepts three build args that become compile-time constants through `astral::common`:

- `ASTRAL_VERSION`  — semver of this service
- `ASTRAL_BUILD_ID` — arbitrary build tag (CI job id, date, etc.)
- `ASTRAL_COMMIT`   — short/full git sha

`docker compose` reads them from env:

```bash
ASTRAL_BUILD_ID=canary-$(date +%s) ASTRAL_COMMIT=$(git rev-parse --short HEAD) \
  docker compose --profile userver build userver-health
```

## Directory layout

```
services/
├── common/                       # shared interface lib (astral::common)
│   └── include/astral/common/    # build_info.hpp, uptime.hpp
└── userver_health/
    ├── CMakeLists.txt            # add_subdirectory(../common)
    ├── Dockerfile                # context=services/
    ├── config/
    │   ├── static_config.yaml    # listeners, handlers, logging
    │   └── config_vars.yaml      # ports, thread counts, log level
    └── src/
        ├── main.cpp              # DaemonMain + component list
        ├── health_handler.{hpp,cpp}
        └── info_handler.{hpp,cpp}
```

## Next

Use this service as the base infra for new C++ async endpoints. See `services/ARCHITECTURE.md` for the migration roadmap.
