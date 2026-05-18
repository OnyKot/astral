# Astral Kubernetes Migration

This document is the production migration track from the current single-server
Docker Compose stack to Kubernetes. The goal is safer deploys first, not a risky
big-bang rewrite of storage.

## Current Baseline

Production currently runs from `/opt/Astral-clean/dev/compose.yaml` on the new
server. The public path is:

```text
DNS -> host nginx -> Caddy -> compose services
```

The stack contains two groups:

```text
stateless / rollout-friendly:
app, api, worker, gateway, admin, marketing, docs, media, metrics,
userver-health, userver-instance, userver-invites, userver-presence,
userver-tenor

stateful / migrate later:
postgres, redis/valkey, scylla, minio, clickhouse, meilisearch, clamav,
livekit UDP/TCP edge
```

## Migration Rule

Do not move databases and object storage first. Kubernetes starts as a
deployment layer for stateless services while stateful services remain on the
host/Compose stack. That gives us rolling updates and rollbacks without risking
data.

## Phase 0 - Image Pipeline

Use immutable image tags for every deploy.

```powershell
$tag = (git rev-parse --short HEAD)
docker buildx build --push -t ghcr.io/Ivantech123/Astral-app:$tag .
```

Required before Phase 1:

- production images build without bind-mounted source code;
- `/api/instance`, `/userver/health`, `/gateway` and `/` are covered by smoke
  checks;
- image tag is written into release notes before rollout.

## Phase 1 - Shadow Kubernetes

Install Kubernetes next to Compose, but do not route public traffic there yet.
For the current single VM, use k3s first. It is enough for deployment hygiene:
declarative manifests, probes, rollout history, rollback, secrets and one
control plane. It is not HA. HA comes later with multiple nodes.

Services to run in Kubernetes first:

```text
app
api
worker
gateway
media
admin
marketing
docs
userver-*
```

Services to keep in Compose during this phase:

```text
postgres
redis
scylla
minio
clickhouse
meilisearch
clamav
livekit
```

Kubernetes services should reach stateful backends through stable internal host
addresses. Avoid public endpoints for internal database traffic.

## Phase 2 - Internal Cutover

Put Kubernetes behind the existing host nginx first:

```text
DNS -> host nginx -> Kubernetes ingress/service -> app/api/gateway
```

Keep Compose Caddy ready as rollback during the first release. The first cutover
must be reversible by changing only host nginx upstreams.

Deployment guarantees:

- `maxUnavailable: 0` for public deployments;
- readiness probes must pass before routing traffic;
- liveness probes only for real deadlocks, not slow startup;
- `revisionHistoryLimit >= 5`;
- rollback command documented per deployment.

## Phase 3 - Stateful Migration

Move stateful services only after we have at least one stable week of stateless
Kubernetes deploys.

Recommended order:

1. Meilisearch and ClamAV: easiest to rebuild/restore.
2. Redis/Valkey: migrate with persistence backup and a short freeze window.
3. ClickHouse metrics: lower product risk.
4. Postgres and Scylla: only with tested backup/restore and maintenance window.
5. MinIO: only after bucket hash verification like the server migration.
6. LiveKit: separate edge plan because of UDP/TCP port behavior.

## Rollback Model

Every deploy must have two rollback paths:

```bash
kubectl -n astral-prod rollout undo deployment/astral-api
kubectl -n astral-prod rollout undo deployment/astral-gateway
```

And host-level rollback:

```text
nginx upstream back to Compose/Caddy on 127.0.0.1:8088
```

## Acceptance Checklist

- `kubectl get pods -n astral-prod` shows all target pods ready.
- `kubectl rollout status` passes for app/api/gateway.
- External checks:
  - `https://astraof.com/` -> 200
  - `https://astraof.com/api/instance` -> 200
  - `https://astraof.com/userver/health` -> 200
  - `https://astraof.com/gateway` -> 426 without websocket upgrade
- No duplicated workers are running in Compose and Kubernetes at the same time.
- Background workers are scaled to exactly one active writer unless the job
  system is proven safe for multiple replicas.

## First Production Candidate

The first Kubernetes production candidate should include:

- namespace `astral-prod`;
- secret `astral-runtime-env` generated from current `.env`;
- configmap for non-secret runtime config;
- deployments for `app`, `api`, `gateway`;
- services for `app`, `api`, `gateway`;
- ingress or host nginx upstreams;
- smoke-test script;
- rollback notes.

Do not deploy this candidate directly to public DNS. Run it under a temporary
internal hostname or host-only upstream first.
