#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/Astral-clean}"
COMPOSE_DIR="${COMPOSE_DIR:-$REPO_ROOT/dev}"
COMPOSE_FILE="${COMPOSE_FILE:-$COMPOSE_DIR/compose.yaml}"
ENV_FILE="${ENV_FILE:-$COMPOSE_DIR/.env}"
COMPOSE_PROFILES="${COMPOSE_PROFILES:-userver}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://astraof.com}"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT:-240}"
SLEEP_STEP="${SLEEP_STEP:-5}"

INFRA_SERVICES=(
  postgres
  redis
  minio
  cassandra
  clamav
  meilisearch
  clickhouse
  metrics
  metrics-clickhouse
)

APP_SERVICES=(
  minio-setup
  livekit
  gateway
  media
  api
  worker
  app
  admin
  marketing
  docs
  userver-health
  userver-instance
  userver-presence
  userver-tenor
  caddy
)

RESTART_AFTER_INFRA=(
  api
  worker
  gateway
  livekit
  metrics
  caddy
)

WATCHED_SERVICES=(
  postgres
  redis
  minio
  cassandra
  clamav
  meilisearch
  clickhouse
  metrics
  metrics-clickhouse
  livekit
  gateway
  media
  api
  worker
  app
  admin
  marketing
  docs
  userver-health
  userver-instance
  userver-presence
  userver-tenor
  caddy
)

PUBLIC_CHECKS=(
  "$PUBLIC_BASE_URL/|200"
  "$PUBLIC_BASE_URL/channels/@me|200"
  "$PUBLIC_BASE_URL/api/instance|200"
  "$PUBLIC_BASE_URL/livekit/|200"
  "$PUBLIC_BASE_URL/userver/health|200"
)

log() {
  printf '[recover-stack] %s\n' "$*" >&2
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
  local service="$1"
  compose config --services 2>/dev/null | grep -qx "$service"
}

existing_services() {
  local service=""

  for service in "$@"; do
    if service_exists "$service"; then
      printf '%s\n' "$service"
    else
      log "skipping service not present in compose: $service"
    fi
  done
}

container_id_for_service() {
  compose ps -q "$1" | tail -n 1
}

container_state() {
  docker inspect --format '{{.State.Status}}' "$1"
}

container_health_or_state() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1"
}

ensure_prereqs() {
  command -v docker >/dev/null 2>&1 || {
    log 'docker is required'
    exit 1
  }

  command -v curl >/dev/null 2>&1 || {
    log 'curl is required'
    exit 1
  }

  [[ -f "$COMPOSE_FILE" ]] || {
    log "compose file not found: $COMPOSE_FILE"
    exit 1
  }
}

ensure_network() {
  if ! docker network inspect Astral-shared >/dev/null 2>&1; then
    log 'creating missing Docker network Astral-shared'
    docker network create Astral-shared >/dev/null
  fi
}

wait_for_service() {
  local service="$1"
  local deadline=$((SECONDS + STARTUP_TIMEOUT))
  local container_id=""
  local state=""

  while (( SECONDS < deadline )); do
    container_id="$(container_id_for_service "$service" || true)"
    if [[ -n "$container_id" ]]; then
      state="$(container_health_or_state "$container_id" || true)"
      case "$state" in
        healthy|running)
          log "$service is $state"
          return 0
          ;;
      esac
    fi

    sleep "$SLEEP_STEP"
  done

  log "timeout waiting for $service"
  return 1
}

wait_for_services() {
  local service=""
  for service in "$@"; do
    wait_for_service "$service"
  done
}

check_service() {
  local service="$1"
  local container_id=""
  local state=""

  container_id="$(container_id_for_service "$service" || true)"
  if [[ -z "$container_id" ]]; then
    log "$service has no container"
    return 1
  fi

  state="$(container_health_or_state "$container_id" || true)"
  case "$state" in
    healthy|running)
      return 0
      ;;
    *)
      log "$service state is $state"
      return 1
      ;;
  esac
}

check_public_endpoint() {
  local spec="$1"
  local url="${spec%%|*}"
  local expected="${spec##*|}"
  local status=""

  status="$(
    curl -k -L -sS -o /dev/null -w '%{http_code}' \
      --connect-timeout 5 \
      --max-time 20 \
      "$url" || true
  )"

  if [[ "$status" != "$expected" ]]; then
    log "endpoint check failed: $url expected $expected got ${status:-none}"
    return 1
  fi
}

check_stack() {
  local service=""
  local spec=""

  for service in "${WATCHED_SERVICES[@]}"; do
    service_exists "$service" || continue
    check_service "$service" || return 1
  done

  for spec in "${PUBLIC_CHECKS[@]}"; do
    check_public_endpoint "$spec" || return 1
  done
}

dump_debug() {
  local service=""

  log 'docker compose ps:'
  compose ps || true

  for service in caddy api gateway livekit postgres redis cassandra minio; do
    log "last logs for $service:"
    compose logs --tail 40 "$service" || true
  done
}

recover_stack() {
  local infra_services=()
  local app_services=()
  local restart_services=()

  ensure_network
  mapfile -t infra_services < <(existing_services "${INFRA_SERVICES[@]}")
  mapfile -t app_services < <(existing_services "${APP_SERVICES[@]}")
  mapfile -t restart_services < <(existing_services "${RESTART_AFTER_INFRA[@]}")

  log 'bringing up infra services'
  if (( ${#infra_services[@]} > 0 )); then
    compose up -d "${infra_services[@]}"
    wait_for_services "${infra_services[@]}"
  fi

  log 'bringing up app tier'
  if (( ${#app_services[@]} > 0 )); then
    compose up -d "${app_services[@]}"
  fi

  log 'restarting dependent services after infra recovery'
  if (( ${#restart_services[@]} > 0 )); then
    compose restart "${restart_services[@]}"
  fi

  if (( ${#restart_services[@]} > 0 )); then
    wait_for_services "${restart_services[@]}"
  fi

  log 'verifying full stack'
  check_stack
}

main() {
  local mode="${1:-recover}"

  ensure_prereqs

  case "$mode" in
    --check-only)
      check_stack
      ;;
    recover|--recover|'')
      recover_stack
      ;;
    *)
      printf 'Usage: %s [--check-only|--recover]\n' "$0" >&2
      exit 1
      ;;
  esac
}

trap 'dump_debug' ERR

main "$@"
