# Astral userver Presence Service

C++ userver service that exposes guild presence counts over HTTP, backed by
the Erlang gateway's `guild.get_counts` RPC and protected by an in-process
TTL cache. Designed so the web client can poll "X online / Y members" badges
without hammering the gateway.

## Endpoints

| Listener | Port | Path | Purpose |
|----------|------|------|---------|
| public   | 8080 | `GET /guilds/:guild_id/counts` | JSON `{guild_id, member_count, presence_count}` |
| monitor  | 8081 | `/ping`                        | Liveness |
| monitor  | 8081 | `/metrics`                     | Prometheus metrics |

## Cache policy

- Key = `guild_id` (snowflake, digits only, max 20 chars).
- Per-key TTL: 3 seconds (`kCacheTtl` in `presence_handler.cpp`).
- Thread-safe, lazy eviction on `Get()`. No background sweep — fine for
  low-cardinality hot paths.
- 429-compatible: `Cache-Control: public, max-age=3` hints CDNs/browsers
  to honor the same window.

## Upstream contract

The service talks to `gateway:8081/_rpc` using the same JSON-RPC wire
protocol that Node uses (see
`astral_api/src/infrastructure/GatewayRpcClient.ts`):

```
POST /_rpc
Authorization: Bearer <GATEWAY_RPC_SECRET>
Content-Type: application/json

{"method": "guild.get_counts", "params": {"guild_id": "123..."}}
```

Response:

```json
{"result": {"member_count": 42, "presence_count": 17}}
```

## Env vars

- `ASTRAL_GATEWAY_RPC_HOST`  — default `gateway`
- `ASTRAL_GATEWAY_RPC_PORT`  — default `8081`
- `GATEWAY_RPC_SECRET`       — required bearer secret

## Request validation

- `guild_id` must be pure digits, length 1..20. Any other input returns 400
  without reaching the gateway.
- Gateway transport errors surface as 502 `{"error":"gateway unavailable"}`
  so Caddy can do its `lb_try_duration` fallback routing to Node.

## Running

```bash
docker compose --env-file dev/.env -f dev/compose.yaml --profile userver up -d userver-presence
docker run --rm --network Astral-shared curlimages/curl:latest \
  http://userver-presence:8080/guilds/1/counts
```
