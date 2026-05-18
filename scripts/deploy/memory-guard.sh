#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-/opt/Astral-clean}"
COMPOSE_DIR="${COMPOSE_DIR:-$REPO_ROOT/dev}"
COMPOSE_FILE="${COMPOSE_FILE:-$COMPOSE_DIR/compose.yaml}"
ENV_FILE="${ENV_FILE:-$COMPOSE_DIR/.env}"
COMPOSE_PROFILES="${COMPOSE_PROFILES:-userver}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"
WARN_AVAILABLE_MB="${WARN_AVAILABLE_MB:-2048}"
CRITICAL_AVAILABLE_MB="${CRITICAL_AVAILABLE_MB:-1024}"
RECOVERY_COOLDOWN="${RECOVERY_COOLDOWN:-300}"
SNAPSHOT_COOLDOWN="${SNAPSHOT_COOLDOWN:-120}"
LOG_FILE="${LOG_FILE:-/var/log/astral-memory-guard.log}"
ENSURE_SWAP="${ENSURE_SWAP:-1}"
SWAP_SCRIPT="${SWAP_SCRIPT:-$SCRIPT_DIR/ensure-swap.sh}"
RECOVER_SCRIPT="${RECOVER_SCRIPT:-$SCRIPT_DIR/recover-stack.sh}"

SOFT_RESTART_SERVICES=(
  app
  docs
  admin
  marketing
)

HARD_RESTART_SERVICES=(
  app
  docs
  admin
  marketing
  gateway
  api
  worker
  caddy
)

last_snapshot_at=0
last_recovery_at=0

log() {
  local line="[memory-guard] $(date -Is) $*"
  printf '%s\n' "$line"
  printf '%s\n' "$line" >>"$LOG_FILE" 2>/dev/null || true
}

compose() {
  local args=(docker compose)
  local profile=""

  for profile in $COMPOSE_PROFILES; do
    args+=(--profile "$profile")
  done

  if [[ -f "$ENV_FILE" ]]; then
    args+=(--env-file "$ENV_FILE")
  fi

  args+=(-f "$COMPOSE_FILE")

  (
    cd "$COMPOSE_DIR"
    "${args[@]}" "$@"
  )
}

service_exists() {
  compose config --services 2>/dev/null | grep -qx "$1"
}

existing_services() {
  local service=""
  for service in "$@"; do
    service_exists "$service" && printf '%s\n' "$service"
  done
}

mem_available_mb() {
  awk '/MemAvailable:/ {print int($2 / 1024)}' /proc/meminfo
}

swap_total_mb() {
  awk '/SwapTotal:/ {print int($2 / 1024)}' /proc/meminfo
}

snapshot() {
  local now
  now="$(date +%s)"

  if (( now - last_snapshot_at < SNAPSHOT_COOLDOWN )); then
    return 0
  fi

  last_snapshot_at="$now"
  log 'memory snapshot:'
  free -h 2>&1 | sed 's/^/[memory-guard]   /' | tee -a "$LOG_FILE" >/dev/null || true
  ps -eo pid,ppid,comm,%mem,%cpu,rss --sort=-rss 2>/dev/null | head -20 | sed 's/^/[memory-guard]   /' | tee -a "$LOG_FILE" >/dev/null || true
  docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' 2>/dev/null | sed 's/^/[memory-guard]   /' | tee -a "$LOG_FILE" >/dev/null || true
}

ensure_swap_if_needed() {
  if [[ "$ENSURE_SWAP" != "1" ]]; then
    return 0
  fi

  if (( $(swap_total_mb) > 0 )); then
    return 0
  fi

  if [[ -x "$SWAP_SCRIPT" ]]; then
    log 'swap is missing, enabling swap'
    "$SWAP_SCRIPT" || log 'swap setup failed'
  else
    log "swap is missing, but swap script is unavailable: $SWAP_SCRIPT"
  fi
}

restart_services() {
  local services=()
  mapfile -t services < <(existing_services "$@")

  if (( ${#services[@]} == 0 )); then
    log 'no matching services to restart'
    return 0
  fi

  log "restarting services: ${services[*]}"
  compose restart "${services[@]}"
}

recover_low_memory() {
  local now
  local before_mb
  local after_mb

  now="$(date +%s)"
  if (( now - last_recovery_at < RECOVERY_COOLDOWN )); then
    log 'low-memory recovery skipped because cooldown is active'
    return 0
  fi
  last_recovery_at="$now"

  before_mb="$(mem_available_mb)"
  log "critical memory pressure: available=${before_mb}MB"
  snapshot

  restart_services "${SOFT_RESTART_SERVICES[@]}" || true
  sleep 20
  after_mb="$(mem_available_mb)"
  log "available memory after soft restart: ${after_mb}MB"

  if (( after_mb < CRITICAL_AVAILABLE_MB )); then
    log 'soft restart did not free enough memory, restarting app/API edge services'
    restart_services "${HARD_RESTART_SERVICES[@]}" || true
  fi

  if [[ -x "$RECOVER_SCRIPT" ]]; then
    "$RECOVER_SCRIPT" --check-only || "$RECOVER_SCRIPT" --recover || true
  fi
}

check_once() {
  local available_mb
  ensure_swap_if_needed
  available_mb="$(mem_available_mb)"

  if (( available_mb < CRITICAL_AVAILABLE_MB )); then
    recover_low_memory
  elif (( available_mb < WARN_AVAILABLE_MB )); then
    log "memory warning: available=${available_mb}MB"
    snapshot
  else
    log "memory ok: available=${available_mb}MB"
  fi
}

main() {
  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
  log "started: warn=${WARN_AVAILABLE_MB}MB critical=${CRITICAL_AVAILABLE_MB}MB interval=${CHECK_INTERVAL}s"

  if [[ "${1:-}" == "--once" ]]; then
    check_once
    return 0
  fi

  while true; do
    check_once
    sleep "$CHECK_INTERVAL"
  done
}

main "$@"
