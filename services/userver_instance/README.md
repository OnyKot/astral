# Astral userver Instance Service

C++ userver port of the Node [`GET /instance`](../../astral_api/src/instance/InstanceController.ts) endpoint. Bootstrap payload that the frontend fetches on first load — static for the lifetime of the process, read from process env at startup.

**Response contract:** 1-to-1 with Node. Any drift is a bug.

## Endpoints

| Listener | Port | Path | Purpose |
|----------|------|------|---------|
| public   | 8080 | `/instance` | Same JSON as Node `/instance` |
| monitor  | 8081 | `/ping`     | Liveness |
| monitor  | 8081 | `/metrics`  | Prometheus text format |

## Why this endpoint first (phase 2a)

- No DB clients required — validates Docker + Caddy shadow routing before we
  pour energy into Scylla/Redis adapters.
- Hot path: every client bootstrap hits it.
- Response is immutable after ctor — trivial to reason about.
- Frontend contract is stable and well-documented in `InstanceController.ts`.

## Env vars consumed

Mirror of `astral_api/src/Config.ts`:

```
ASTRAL_API_PUBLIC_ENDPOINT, ASTRAL_API_CLIENT_ENDPOINT,
ASTRAL_APP_ENDPOINT, ASTRAL_GATEWAY_ENDPOINT,
ASTRAL_MEDIA_ENDPOINT, ASTRAL_CDN_ENDPOINT,
ASTRAL_MARKETING_ENDPOINT + ASTRAL_PATH_MARKETING,
ASTRAL_ADMIN_ENDPOINT + ASTRAL_PATH_ADMIN,
ASTRAL_INVITE_ENDPOINT, ASTRAL_GIFT_ENDPOINT,
CAPTCHA_PRIMARY_PROVIDER, HCAPTCHA_SITE_KEY, TURNSTILE_SITE_KEY,
SMS_ENABLED, VOICE_ENABLED, STRIPE_ENABLED, SELF_HOSTED,
VAPID_PUBLIC_KEY, SPOTIFY_CLIENT_ID
```

## Build + run

```bash
docker compose --env-file dev/.env -f dev/compose.yaml --profile userver up -d userver-instance
docker compose exec userver-instance curl -s localhost:8080/instance | jq
```

Sample response (dev env):

```json
{
  "api_code_version": 1,
  "endpoints": {
    "api": "https://astraof.com/api",
    "api_client": "https://astraof.com/api",
    "api_public": "https://astraof.com/api",
    "gateway": "wss://astraof.com/gateway",
    "media": "https://media.astraof.com",
    "cdn": "https://cdn.astraof.com",
    "marketing": "https://astraof.com/marketing",
    "admin": "https://astraof.com/admin",
    "invite": "https://astraof.com/invite",
    "gift": "https://astraof.com/gifts",
    "webapp": "https://astraof.com"
  },
  "captcha": {"provider": "turnstile", "hcaptcha_site_key": null, "turnstile_site_key": "..."},
  "features": {"sms_mfa_enabled": false, "voice_enabled": true, "stripe_enabled": false, "self_hosted": false},
  "push": {"public_vapid_key": "..."},
  "music": {"spotify_client_id": null}
}
```

## Shadow / canary rollout (phase 2a)

See `services/ARCHITECTURE.md` → Migration strategy.

1. **Dark launch** — container up behind `userver` profile, Caddy routes nothing to it yet.
2. **Contract diff** — run `scripts/diff_instance.py` (TODO) against Node + userver side-by-side.
3. **Shadow** — Caddy mirrors `/api/v1/instance` to userver, response ignored, diff logged.
4. **Canary** — weighted upstream: 5% → 50% → 100%, fallback to Node on 5xx/timeout.
5. **Cleanup** — Node handler stays as permanent fallback.
