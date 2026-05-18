# Astral userver Invites Service

C++ userver fast path for `GET /invites/:code`.

The frontend keeps calling `/api/v1/invites/:code`. Caddy strips `/api/v1`,
tries this service first, and falls back to Node on failure. This version is an
edge cache around the existing Node contract, so JSON drift is avoided while the
route moves behind a C++ process. A later step can replace the upstream client
with direct Scylla/Gateway reads without changing clients or Caddy.

## Endpoints

| Listener | Port | Path | Purpose |
|---|---:|---|---|
| public | 8080 | `/invites/{invite_code}` | Same status/body as Node |
| monitor | 8081 | `/ping` | Liveness |
| monitor | 8081 | `/metrics` | Prometheus text |

## Env

`ASTRAL_API_INTERNAL_ENDPOINT` defaults to `http://api:8080/v1`.

## Dev

```bash
docker compose --env-file dev/.env -f dev/compose.yaml --profile userver up -d userver-invites
curl -i http://localhost:8088/api/v1/invites/example
```
