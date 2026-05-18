# Live Presence — Integration guide for marketing pages

The backend ships a small C++ service called `userver_presence` (lives at
`services/userver_presence/` in the backend monorepo) that exposes
real-time member/online counts:

```
GET /api/v1/guilds/:guild_id/counts
→ { "guild_id": "...", "member_count": 42, "presence_count": 17 }
```

It is fronted by the same Caddy that already serves the landing, so no
CORS or extra auth is needed — just hit the relative URL.

## Properties to know

| Property | Value |
|----------|-------|
| Cache TTL (positive) | 3 seconds, in-process |
| Cache TTL (negative, "guild not found") | 3 seconds, in-process |
| Cold call latency | ~20 ms (single gateway round-trip) |
| Cached call latency | ~1.5 ms |
| Failure mode | 404 = guild missing, 502 = gateway down, 400 = invalid id |
| Rate limit | none — cache absorbs bursts |

So you can poll freely. Default poll interval suggestion: **10 seconds**.

## React (UI 3.0 client)

A drop-in React hook + component is committed under `src/`:

- `src/hooks/useGuildPresenceCounts.ts`
- `src/components/GuildLivePresenceBadge.tsx`

Minimal usage:

```tsx
import {GuildLivePresenceBadge} from '~/components/GuildLivePresenceBadge';

<GuildLivePresenceBadge guildId="123456789012345678" intervalMs={10_000} />
```

Custom layout:

```tsx
const {data, loading, notFound} = useGuildPresenceCounts(guildId);
if (notFound) return <em>This guild doesn't exist (yet).</em>;
return <span>{data?.presenceCount ?? 0} are chatting right now</span>;
```

The hook pauses polling when the tab is hidden, refreshes immediately on
re-focus, and supports forced refreshes via the `refresh()` callback.

## Marketing pages (Gleam, this folder)

For server-rendered marketing pages, fetch the JSON straight from the
Gleam HTTP client at render time (or via a Lustre effect for SSR-then-
hydrate landing pages). Example sketch:

```gleam
import gleam/http/request
import gleam/httpc
import gleam/json

pub fn fetch_counts(guild_id: String) {
  let req =
    request.new()
    |> request.set_host("localhost")
    |> request.set_path("/api/v1/guilds/" <> guild_id <> "/counts")

  case httpc.send(req) {
    Ok(resp) -> json.decode(resp.body, decoder)
    Error(_) -> default_counts()
  }
}
```

Always render a sensible fallback (`—` or hidden) when the call fails so
the landing page stays correct even if presence is briefly unavailable.

## Env / domain notes

- In the Astral dev compose stack, the endpoint is reachable at
  `http://localhost:8088/api/v1/guilds/<id>/counts` through Caddy.
- In prod, hit the same `/api/v1/guilds/<id>/counts` path on whatever
  origin serves the marketing site — Caddy handles routing.
- For the Gleam server, prefer service-internal DNS
  (`http://userver-presence:8080/guilds/<id>/counts`) if it lives in
  the same compose network — that bypasses the Caddy hop entirely.

## Don't poll for

- Membership updates ("user X joined/left") — use the gateway WebSocket.
- Per-channel presence — this endpoint is guild-level only.
- Per-user online status — out of scope.

The presence counter is a coarse "is this guild lively right now"
signal, perfect for marketing badges and discoverability.
