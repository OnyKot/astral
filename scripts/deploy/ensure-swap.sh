#!/usr/bin/env bash
set -Eeuo pipefail

SWAP_FILE="${SWAP_FILE:-/swapfile}"
SWAP_SIZE="${SWAP_SIZE:-8G}"
SWAPPINESS="${SWAPPINESS:-10}"

log() {
  printf '[ensure-swap] %s\n' "$*"
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    log 'must be run as root'
    exit 1
  fi
}

ensure_swapfile() {
  if swapon --show=NAME --noheadings | grep -qx "$SWAP_FILE"; then
    log "$SWAP_FILE already active"
    return 0
  fi

  if [[ ! -f "$SWAP_FILE" ]]; then
    log "creating $SWAP_SIZE swap file at $SWAP_FILE"
    fallocate -l "$SWAP_SIZE" "$SWAP_FILE" || dd if=/dev/zero of="$SWAP_FILE" bs=1M count=8192 status=progress
  fi

  chmod 600 "$SWAP_FILE"
  mkswap -f "$SWAP_FILE" >/dev/null
  swapon "$SWAP_FILE"
  log "$SWAP_FILE activated"
}

ensure_fstab() {
  local entry="$SWAP_FILE none swap sw 0 0"

  if ! grep -qE "^${SWAP_FILE//\//\\/}[[:space:]]+none[[:space:]]+swap[[:space:]]+" /etc/fstab; then
    cp /etc/fstab "/etc/fstab.astral-swap-bak-$(date +%Y%m%d%H%M%S)"
    printf '%s\n' "$entry" >>/etc/fstab
    log 'fstab updated'
  fi
}

ensure_swappiness() {
  sysctl "vm.swappiness=$SWAPPINESS" >/dev/null

  if [[ -f /etc/sysctl.conf ]] && grep -qE '^vm\.swappiness=' /etc/sysctl.conf; then
    sed -i "s/^vm\\.swappiness=.*/vm.swappiness=$SWAPPINESS/" /etc/sysctl.conf
  else
    printf 'vm.swappiness=%s\n' "$SWAPPINESS" >>/etc/sysctl.conf
  fi
}

main() {
  require_root
  ensure_swapfile
  ensure_fstab
  ensure_swappiness
  free -h
  swapon --show
}

main "$@"
