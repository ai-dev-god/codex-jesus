#!/usr/bin/env bash
set -euo pipefail

# BioHax local demo bootstrap used for Playwright end-to-end runs when Docker is unavailable.
# Starts an embedded Postgres instance, applies migrations, seeds data, and launches backend/front-end services.

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
TASK_ID=${TASK_ID:-t-040}
STATE_DIR="${ROOT_DIR}/devops/.local-e2e"
STATE_FILE="${STATE_DIR}/state.json"
ARTIFACT_DIR="${ROOT_DIR}/platform/automation_artifacts/tasks/${TASK_ID}/release"
LOG_ROOT="${ARTIFACT_DIR}/local-stack"
TIMESTAMP=$(date -u +"%Y%m%d%H%M%S")
RUN_LOG_DIR="${LOG_ROOT}/${TIMESTAMP}"

PG_VERSION="16.4.0"
PG_BASE_URL="https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-linux-amd64/${PG_VERSION}"
PG_JAR="embedded-postgres-binaries-linux-amd64-${PG_VERSION}.jar"
PG_ROOT="${ROOT_DIR}/tools/.tmp/embedded-pg"
PG_JAR_PATH="${PG_ROOT}/${PG_JAR}"
PG_BIN_DIR="${PG_ROOT}/bin"
PG_DATA_DIR="${STATE_DIR}/postgres-data"
PSQL_BIN=$(command -v psql)
PG_PORT=${TEST_PG_PORT:-5544}

BACKEND_PORT=${BACKEND_PORT:-4000}
FRONTEND_PORT=${FRONTEND_PORT:-5173}

BACKEND_LOG="${RUN_LOG_DIR}/backend.log"
FRONTEND_LOG="${RUN_LOG_DIR}/frontend.log"
POSTGRES_LOG="${RUN_LOG_DIR}/postgres.log"
SETUP_LOG="${RUN_LOG_DIR}/setup.log"

DATABASE_URL="postgresql://biohax:biohax@127.0.0.1:${PG_PORT}/biohax?schema=public"
PLAYWRIGHT_BASE_URL_DEFAULT="http://127.0.0.1:${FRONTEND_PORT}"

mkdir -p "${STATE_DIR}" "${RUN_LOG_DIR}" "${LOG_ROOT}" "${ARTIFACT_DIR}"
: >"${BACKEND_LOG}"
: >"${FRONTEND_LOG}"
: >"${POSTGRES_LOG}"
: >"${SETUP_LOG}"

log() {
  printf '%s\n' "$1" | tee -a "${SETUP_LOG}"
}

err() {
  printf '[start-e2e][error] %s\n' "$1" | tee -a "${SETUP_LOG}" >&2
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Missing required command: $1"
    exit 1
  fi
}

wait_for_port() {
  local host="$1"
  local port="$2"
  local timeout="$3"
  python3 - "$host" "$port" "$timeout" <<'PY'
import socket
import sys
import time

host = sys.argv[1]
port = int(sys.argv[2])
deadline = time.time() + int(sys.argv[3])

while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=1):
            sys.exit(0)
    except OSError:
        time.sleep(0.2)

sys.stderr.write(f"Timed out waiting for {host}:{port}\n")
sys.exit(1)
PY
}

wait_for_port_close() {
  local host="$1"
  local port="$2"
  local timeout="$3"
  python3 - "$host" "$port" "$timeout" <<'PY'
import socket
import sys
import time

host = sys.argv[1]
port = int(sys.argv[2])
deadline = time.time() + int(sys.argv[3])

while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=1):
            time.sleep(0.2)
            continue
    except OSError:
        sys.exit(0)

sys.stderr.write(f"Port {host}:{port} still open\n")
sys.exit(1)
PY
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local timeout="$3"
  local start=$(date +%s)
  while true; do
    if curl --fail --silent --max-time 5 "$url" >/dev/null 2>&1; then
      log "$label ready at $url"
      return 0
    fi
    if (( $(date +%s) - start >= timeout )); then
      err "Timed out waiting for $label at $url"
      return 1
    fi
    sleep 2
  done
}

stop_process_if_running() {
  local pid="$1"
  local name="$2"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    log "Stopping $name (pid $pid)"
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" >/dev/null 2>&1 || true
  fi
}

stop_stack() {
  if [[ -f "$STATE_FILE" ]]; then
    local backend_pid frontend_pid
    backend_pid=$(jq -r '.backend_pid // ""' "$STATE_FILE" 2>/dev/null || echo "")
    frontend_pid=$(jq -r '.frontend_pid // ""' "$STATE_FILE" 2>/dev/null || echo "")
    stop_process_if_running "$backend_pid" "backend"
    stop_process_if_running "$frontend_pid" "frontend"
  fi
  if [[ -x "${PG_BIN_DIR}/pg_ctl" ]] && [[ -d "$PG_DATA_DIR" ]]; then
    "${PG_BIN_DIR}/pg_ctl" -D "$PG_DATA_DIR" stop >/dev/null 2>&1 || true
  fi
  rm -f "$STATE_FILE"
}

stop_stack
wait_for_port_close "127.0.0.1" "$BACKEND_PORT" 10 || true
wait_for_port_close "127.0.0.1" "$FRONTEND_PORT" 10 || true

trap 'stop_stack; exit 1' ERR
trap 'stop_stack; exit 1' INT
trap 'stop_stack; exit 1' TERM

require_command curl
require_command npm
require_command node
require_command python3
require_command jq
require_command psql

log "Preparing embedded Postgres binaries (${PG_VERSION})"
if [[ ! -d "$PG_ROOT" ]]; then
  mkdir -p "$PG_ROOT"
fi
if [[ ! -f "$PG_JAR_PATH" ]]; then
  curl -L -o "$PG_JAR_PATH" "${PG_BASE_URL}/${PG_JAR}"
fi
if [[ ! -d "$PG_BIN_DIR" ]]; then
  tmp_dir=$(mktemp -d)
  unzip -j "$PG_JAR_PATH" "postgres-linux-x86_64.txz" -d "$tmp_dir" >/dev/null
  tar -xJf "$tmp_dir/postgres-linux-x86_64.txz" -C "$PG_ROOT" >/dev/null
  rm -rf "$tmp_dir"
fi

log "Initialising fresh Postgres data directory"
rm -rf "$PG_DATA_DIR"
mkdir -p "$PG_DATA_DIR"
"${PG_BIN_DIR}/initdb" -D "$PG_DATA_DIR" >"$POSTGRES_LOG" 2>&1
"${PG_BIN_DIR}/pg_ctl" -D "$PG_DATA_DIR" -l "$POSTGRES_LOG" -o "-p ${PG_PORT}" start >/dev/null 2>&1
wait_for_port "127.0.0.1" "$PG_PORT" 30

log "Configuring database roles and schema"
"${PSQL_BIN}" -h 127.0.0.1 -p "$PG_PORT" -U "$(whoami)" -d postgres >>"${SETUP_LOG}" 2>&1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'biohax') THEN
    CREATE ROLE biohax WITH LOGIN PASSWORD 'biohax';
  END IF;
  ALTER ROLE biohax WITH LOGIN PASSWORD 'biohax' SUPERUSER CREATEDB CREATEROLE INHERIT;
END$$;
SQL
if ! "${PSQL_BIN}" -h 127.0.0.1 -p "$PG_PORT" -U "$(whoami)" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'biohax'" | grep -q 1; then
  "${PSQL_BIN}" -h 127.0.0.1 -p "$PG_PORT" -U "$(whoami)" -d postgres -c "CREATE DATABASE biohax OWNER biohax" >>"${SETUP_LOG}" 2>&1
else
  "${PSQL_BIN}" -h 127.0.0.1 -p "$PG_PORT" -U "$(whoami)" -d postgres -c "ALTER DATABASE biohax OWNER TO biohax" >>"${SETUP_LOG}" 2>&1
fi

log "Ensuring node dependencies"
if [[ ! -d "${ROOT_DIR}/backend/node_modules" ]]; then
  npm ci --prefix "${ROOT_DIR}/backend" >>"${SETUP_LOG}" 2>&1
fi
if [[ ! -d "${ROOT_DIR}/bh-fe/node_modules" ]]; then
  npm ci --prefix "${ROOT_DIR}/bh-fe" >>"${SETUP_LOG}" 2>&1
fi

log "Building backend and frontend artifacts"
DATABASE_URL="$DATABASE_URL" npm run build --prefix "${ROOT_DIR}/backend" >>"${SETUP_LOG}" 2>&1
VITE_API_BASE_URL="http://127.0.0.1:${BACKEND_PORT}" \
VITE_GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-demo-google-client-id}" \
  npm run build --prefix "${ROOT_DIR}/bh-fe" >>"${SETUP_LOG}" 2>&1

log "Applying migrations and seeding data"
(
  cd "${ROOT_DIR}/backend"
  DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy --schema prisma/schema.prisma >>"${SETUP_LOG}" 2>&1
  DATABASE_URL="$DATABASE_URL" npm run db:seed >>"${SETUP_LOG}" 2>&1
)

log "Starting backend service (port ${BACKEND_PORT})"
(
  cd "${ROOT_DIR}/backend"
  env NODE_ENV=production \
    PORT="${BACKEND_PORT}" \
    DATABASE_URL="$DATABASE_URL" \
    AUTH_JWT_SECRET="local-demo-secret" \
    AUTH_REFRESH_ENCRYPTION_KEY="local-refresh-secret" \
    AUTH_ACCESS_TOKEN_TTL_SECONDS=900 \
    AUTH_REFRESH_TOKEN_TTL_SECONDS=2592000 \
    OPENROUTER_API_KEY="demo" \
    WHOOP_CLIENT_ID="demo" \
    WHOOP_CLIENT_SECRET="demo" \
    RESEND_API_KEY="demo" \
    GOOGLE_CLIENT_ID="demo" \
    GOOGLE_CLIENT_SECRET="demo" \
    CORS_ORIGIN="http://127.0.0.1:${FRONTEND_PORT}" \
    WHOOP_REDIRECT_URI="http://127.0.0.1:${FRONTEND_PORT}/oauth/whoop/callback" \
    node dist/src/server.js >"${BACKEND_LOG}" 2>&1 &
  echo $! >"${STATE_DIR}/backend.pid"
)
BACKEND_PID=$(cat "${STATE_DIR}/backend.pid")
wait_for_http "http://127.0.0.1:${BACKEND_PORT}/healthz/readiness" "backend" 120

log "Starting frontend preview (port ${FRONTEND_PORT})"
(
  cd "${ROOT_DIR}/bh-fe"
  PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL_DEFAULT}" \
    npm exec vite preview -- --host 127.0.0.1 --port "${FRONTEND_PORT}" >"${FRONTEND_LOG}" 2>&1 &
  echo $! >"${STATE_DIR}/frontend.pid"
)
FRONTEND_PID=$(cat "${STATE_DIR}/frontend.pid")
wait_for_http "http://127.0.0.1:${FRONTEND_PORT}/" "frontend" 120

cat <<JSON > "$STATE_FILE"
{
  "started_at": "${TIMESTAMP}",
  "backend_pid": ${BACKEND_PID},
  "frontend_pid": ${FRONTEND_PID},
  "postgres_port": ${PG_PORT},
  "backend_port": ${BACKEND_PORT},
  "frontend_port": ${FRONTEND_PORT},
  "database_url": "${DATABASE_URL}",
  "logs_dir": "${RUN_LOG_DIR}"
}
JSON

log "Local demo stack ready. Run Playwright via:"
log "  PLAYWRIGHT_USE_EXTERNAL_PG=1 \\"
log "  TEST_PG_PORT=${PG_PORT} \\"
log "  TEST_PG_HOST=127.0.0.1 \\"
log "  PLAYWRIGHT_BASE_URL=${PLAYWRIGHT_BASE_URL_DEFAULT} \\"
log "  npm run test:e2e --prefix bh-fe"

trap - ERR INT TERM
exit 0
