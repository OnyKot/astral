#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RECOVER_SCRIPT="${RECOVER_SCRIPT:-$SCRIPT_DIR/recover-stack.sh}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"
FAILURE_THRESHOLD="${FAILURE_THRESHOLD:-2}"
RECOVERY_COOLDOWN="${RECOVERY_COOLDOWN:-120}"

failure_count=0
last_recovery_at=0

log() {
  printf '[stack-watchdog] %s\n' "$*"
}

run_check() {
  "$RECOVER_SCRIPT" --check-only
}

run_recovery() {
  "$RECOVER_SCRIPT" --recover
}

main() {
  if [[ ! -x "$RECOVER_SCRIPT" ]]; then
    log "recover script is missing or not executable: $RECOVER_SCRIPT"
    exit 1
  fi

  log "watchdog started: interval=${CHECK_INTERVAL}s threshold=${FAILURE_THRESHOLD} cooldown=${RECOVERY_COOLDOWN}s"

  while true; do
    if run_check; then
      if (( failure_count > 0 )); then
        log 'stack healthy again'
      fi
      failure_count=0
    else
      failure_count=$((failure_count + 1))
      log "health check failed (${failure_count}/${FAILURE_THRESHOLD})"

      if (( failure_count >= FAILURE_THRESHOLD )); then
        local_now="$(date +%s)"
        if (( local_now - last_recovery_at < RECOVERY_COOLDOWN )); then
          log 'recovery skipped because cooldown is active'
        else
          log 'running automated recovery'
          if run_recovery; then
            log 'automated recovery completed successfully'
            failure_count=0
          else
            log 'automated recovery failed'
          fi
          last_recovery_at="$local_now"
        fi
      fi
    fi

    sleep "$CHECK_INTERVAL"
  done
}

main "$@"
