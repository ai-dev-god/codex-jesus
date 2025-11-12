#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
STATE_DIR="${ROOT_DIR}/devops/.local-e2e"
STATE_FILE="${STATE_DIR}/state.json"
PG_ROOT="${ROOT_DIR}/tools/.tmp/embedded-pg"
PG_BIN_DIR="${PG_ROOT}/bin"

log() {
  printf '%s\n' "$1"
}

stop_process() {
  local pid="$1"
  local name="$2"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    log "Stopping $name (pid $pid)"
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" >/dev/null 2>&1 || true
  fi
}

if [[ -f "$STATE_FILE" ]]; then
  backend_pid=$(jq -r '.backend_pid // ""' "$STATE_FILE" 2>/dev/null || echo "")
  frontend_pid=$(jq -r '.frontend_pid // ""' "$STATE_FILE" 2>/dev/null || echo "")
  stop_process "$backend_pid" "backend"
  stop_process "$frontend_pid" "frontend"
  rm -f "$STATE_FILE"
fi

if [[ -x "${PG_BIN_DIR}/pg_ctl" ]] && [[ -d "${STATE_DIR}/postgres-data" ]]; then
  log "Stopping embedded Postgres"
  "${PG_BIN_DIR}/pg_ctl" -D "${STATE_DIR}/postgres-data" stop >/dev/null 2>&1 || true
fi
