#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/Astral-clean}"
COMPOSE_DIR="${COMPOSE_DIR:-$REPO_ROOT/dev}"
COMPOSE_FILE="${COMPOSE_FILE:-$COMPOSE_DIR/compose.yaml}"
ENV_FILE="${ENV_FILE:-$COMPOSE_DIR/.env}"
COMPOSE_PROFILES="${COMPOSE_PROFILES:-clickhouse userver}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://astraof.com}"

compose() {
  local args=(docker compose)
  local profile=""

  for profile in $COMPOSE_PROFILES; do
    args+=(--profile "$profile")
  done

  [[ -f "$ENV_FILE" ]] && args+=(--env-file "$ENV_FILE")
  args+=(-f "$COMPOSE_FILE")

  (
    cd "$COMPOSE_DIR"
    "${args[@]}" "$@"
  )
}

http_code() {
  curl -k -L -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 20 "$1" || true
}

section() {
  printf '\n== %s ==\n' "$1"
}

section 'system'
date
uptime
free -h
swapon --show || true
df -h /

section 'public endpoints'
for path in / /channels/@me /api/instance /livekit/ /userver/health; do
  printf '%-24s %s\n' "$path" "$(http_code "$PUBLIC_BASE_URL$path")"
done

section 'compose'
compose ps || true

section 'docker memory'
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' || true

section 'top rss'
ps -eo pid,ppid,comm,%mem,%cpu,rss --sort=-rss | head -25 || true

section 'recent oom'
dmesg -T 2>/dev/null | grep -Ei 'out of memory|oom|killed process' | tail -20 || true
