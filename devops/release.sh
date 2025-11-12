#!/usr/bin/env bash
set -euo pipefail

MODE="local"
RELEASE_TAG="release-$(date -u +%Y%m%d%H%M%S)"
ARTIFACT_SUBDIR=""
SKIP_BUILD=0
SKIP_TESTS=0
BACKEND_PORT=${BACKEND_PORT:-4000}
FRONTEND_PORT=${FRONTEND_PORT:-5173}
PG_PORT=${TEST_PG_PORT:-6543}
TASK_ID=${TASK_ID:-t-040}
PLAYWRIGHT_TASK_ID=${PLAYWRIGHT_TASK_ID:-${TASK_ID}}
PLAYWRIGHT_BASE_URL=${PLAYWRIGHT_BASE_URL:-http://localhost:${FRONTEND_PORT}}
EMBEDDED_PG_VERSION="16.4.0"
EMBEDDED_PG_URL="https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-linux-amd64/${EMBEDDED_PG_VERSION}/embedded-postgres-binaries-linux-amd64-${EMBEDDED_PG_VERSION}.jar"
BACKEND_IMAGE=${BACKEND_IMAGE:-biohax-backend}
FRONTEND_IMAGE=${FRONTEND_IMAGE:-biohax-frontend}
PLAYWRIGHT_STATUS="skipped"
BUILT_BACKEND_IMAGE=""
BUILT_FRONTEND_IMAGE=""

usage() {
  cat <<'USAGE'
BioHax release automation (local demo)

Usage:
  devops/release.sh [options]

Options:
  --mode <local|docker>   Execution mode. Docker mode builds images and runs docker-compose.release.yml. [default: local]
  --tag <name>            Release tag identifier (default: release-YYYYMMDDHHMMSS-UTC).
  --artifact-subdir <dir> Optional suffix appended to run directory name.
  --skip-build            Skip npm ci/build steps (assumes artifacts already exist).
  --skip-tests            Skip Playwright end-to-end execution.
  -h, --help              Show this help message.

Environment overrides:
  BACKEND_PORT, FRONTEND_PORT, TEST_PG_PORT, TASK_ID, PLAYWRIGHT_TASK_ID, PLAYWRIGHT_BASE_URL
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --tag)
      RELEASE_TAG="$2"
      shift 2
      ;;
    --artifact-subdir)
      ARTIFACT_SUBDIR="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n\n' "$1" >&2
      usage
      exit 1
      ;;
  esac
done

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ARTIFACT_ROOT="${ROOT_DIR}/platform/automation_artifacts/tasks/${TASK_ID}"
RUN_ID=$(date -u +%Y%m%d%H%M%S)
RUN_DIR="${ARTIFACT_ROOT}/release/${RUN_ID}${ARTIFACT_SUBDIR:+-$ARTIFACT_SUBDIR}"
LOG_DIR="${RUN_DIR}/logs"
MANIFEST_PATH="${ARTIFACT_ROOT}/release-manifest.json"
PLAYWRIGHT_OUTPUT_DIR="${ARTIFACT_ROOT}/playwright-output"
PLAYWRIGHT_REPORT_DIR="${ARTIFACT_ROOT}/playwright-report"

mkdir -p "${RUN_DIR}" "${LOG_DIR}"

log_info() { printf '[release] %s\n' "$*"; }
log_warn() { printf '[release][warn] %s\n' "$*" >&2; }
log_error() { printf '[release][error] %s\n' "$*" >&2; }

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Missing required command: $1"
    exit 1
  fi
}

require_command curl
require_command timeout
require_command npm
require_command node
require_command python3

STEP_RESULTS=()
PIPELINE_STATUS="passed"
RUN_STARTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BACKEND_PID=""
FRONTEND_PID=""
PG_STARTED=0

record_step() {
  local name="$1"
  local status="$2"
  local command="$3"
  local duration="$4"
  STEP_RESULTS+=("${name}|${status}|${command}|${duration}")
  if [[ "$status" != "passed" && "$PIPELINE_STATUS" != "failed" ]]; then
    PIPELINE_STATUS="failed"
  fi
}

run_step() {
  local name="$1"
  local timeout_seconds="$2"
  shift 2
  local cmd=("$@")
  log_info "Step '${name}': ${cmd[*]}"

  local start_ts end_ts duration exit_code status
  start_ts=$(date +%s)

  set +e
  timeout "$timeout_seconds" "${cmd[@]}"
  exit_code=$?
  set -e

  end_ts=$(date +%s)
  duration=$((end_ts - start_ts))
  status="passed"

  if [[ $exit_code -ne 0 ]]; then
    if [[ $exit_code -eq 124 ]]; then
      status="timeout"
      log_error "Step '${name}' timed out after ${timeout_seconds}s"
    else
      status="failed"
      log_error "Step '${name}' failed with exit code ${exit_code}"
    fi
  else
    log_info "Step '${name}' completed in ${duration}s"
  fi

  record_step "$name" "$status" "${cmd[*]}" "$duration"
  return 0
}

wait_for_port() {
  local host="$1"
  local port="$2"
  local timeout_seconds="$3"

  python3 - "$host" "$port" "$timeout_seconds" <<'PY'
import socket
import sys
import time

host = sys.argv[1]
port = int(sys.argv[2])
deadline = time.time() + int(sys.argv[3])

while time.time() <= deadline:
    try:
        with socket.create_connection((host, port), timeout=1):
            sys.exit(0)
    except OSError:
        time.sleep(0.5)

sys.stderr.write(f"Timed out waiting for {host}:{port}\n")
sys.exit(1)
PY
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local timeout_seconds="$3"
  local start_ts=$(date +%s)
  while true; do
    if curl --fail --silent --max-time 5 "$url" >/dev/null 2>&1; then
      log_info "${label} is ready at ${url}"
      return 0
    fi
    if (( $(date +%s) - start_ts >= timeout_seconds )); then
      log_error "Timed out waiting for ${label} at ${url}"
      return 1
    fi
    sleep 2
  done
}
PG_ROOT="${ROOT_DIR}/tools/.tmp/embedded-pg"
PG_JAR="${PG_ROOT}/embedded-postgres-${EMBEDDED_PG_VERSION}.jar"
PG_BIN_DIR="${PG_ROOT}/bin"
PG_DATA_DIR="${ROOT_DIR}/tools/.tmp/t037-pg"
PG_LOG_FILE="${LOG_DIR}/postgres.log"

ensure_embedded_pg() {
  if [[ -x "${PG_BIN_DIR}/pg_ctl" ]]; then
    return 0
  fi

  log_info "Downloading embedded Postgres binaries (${EMBEDDED_PG_VERSION})"
  mkdir -p "${PG_ROOT}"
  local jar_tmp="${PG_JAR}.download"
  curl -L -o "${jar_tmp}" "${EMBEDDED_PG_URL}"
  mv "${jar_tmp}" "${PG_JAR}"

  python3 - "${PG_JAR}" "${PG_ROOT}" <<'PY'
import pathlib
import sys
import tarfile
import zipfile

jar_path = pathlib.Path(sys.argv[1])
root = pathlib.Path(sys.argv[2])
with zipfile.ZipFile(jar_path, 'r') as jar:
    member = 'postgres-linux-x86_64.txz'
    jar.extract(member, path=root)

archive = root / 'postgres-linux-x86_64.txz'
with tarfile.open(archive, 'r:xz') as tar:
    tar.extractall(path=root)

archive.unlink()
PY
}

init_embedded_pg() {
  mkdir -p "${PG_DATA_DIR}"
  if [[ -f "${PG_DATA_DIR}/PG_VERSION" ]]; then
    return 0
  fi
  log_info "Initialising embedded Postgres data directory (${PG_DATA_DIR})"
  "${PG_BIN_DIR}/initdb" -D "${PG_DATA_DIR}" >/dev/null
}

start_embedded_pg() {
  ensure_embedded_pg
  init_embedded_pg

  local start_ts=$(date +%s)
  set +e
  "${PG_BIN_DIR}/pg_ctl" -D "${PG_DATA_DIR}" -l "${PG_LOG_FILE}" -o "-p ${PG_PORT}" start >/dev/null 2>&1
  local exit_code=$?
  set -e

  if [[ $exit_code -ne 0 ]]; then
    record_step "postgres:start" "failed" "pg_ctl start" "$(( $(date +%s) - start_ts ))"
    log_error "Failed to start embedded Postgres. See ${PG_LOG_FILE}."
    return 1
  fi

  if ! wait_for_port "127.0.0.1" "${PG_PORT}" 30; then
    record_step "postgres:start" "failed" "pg_ctl start" "$(( $(date +%s) - start_ts ))"
    log_error "Embedded Postgres failed to listen on port ${PG_PORT}."
    return 1
  fi

  PG_STARTED=1
  record_step "postgres:start" "passed" "pg_ctl start" "$(( $(date +%s) - start_ts ))"
  return 0
}

stop_embedded_pg() {
  if [[ ${PG_STARTED} -eq 1 ]]; then
    set +e
    "${PG_BIN_DIR}/pg_ctl" -D "${PG_DATA_DIR}" stop >/dev/null 2>&1
    set -e
    PG_STARTED=0
    record_step "postgres:stop" "passed" "pg_ctl stop" 0
  fi
}

start_backend() {
  local log_file="${LOG_DIR}/backend.log"
  local start_ts=$(date +%s)
  (
    cd "${ROOT_DIR}/backend" || exit 1
    exec env NODE_ENV=production \
      PORT="${BACKEND_PORT}" \
      DATABASE_URL="postgresql://biohax:biohax@127.0.0.1:${PG_PORT}/biohax?schema=public" \
      AUTH_JWT_SECRET="local-demo-secret" \
      AUTH_REFRESH_ENCRYPTION_KEY="local-refresh-secret" \
      AUTH_ACCESS_TOKEN_TTL_SECONDS=900 \
      AUTH_REFRESH_TOKEN_TTL_SECONDS=2592000 \
      OPENROUTER_API_KEY=demo \
      WHOOP_CLIENT_ID=demo \
      WHOOP_CLIENT_SECRET=demo \
      RESEND_API_KEY=demo \
      GOOGLE_CLIENT_ID=demo \
      GOOGLE_CLIENT_SECRET=demo \
      CORS_ORIGIN="http://localhost:${FRONTEND_PORT}" \
      WHOOP_REDIRECT_URI="http://localhost:${FRONTEND_PORT}/oauth/whoop/callback" \
      node dist/src/server.js
  ) >"${log_file}" 2>&1 &
  BACKEND_PID=$!

  sleep 2
  if [[ -z "${BACKEND_PID}" ]] || ! kill -0 "${BACKEND_PID}" >/dev/null 2>&1; then
    record_step "backend:start" "failed" "node dist/src/server.js" "$(( $(date +%s) - start_ts ))"
    log_error "Backend failed to start. See ${log_file}."
    return 1
  fi

  if ! wait_for_port "127.0.0.1" "${BACKEND_PORT}" 60; then
    record_step "backend:start" "failed" "node dist/src/server.js" "$(( $(date +%s) - start_ts ))"
    log_error "Backend port ${BACKEND_PORT} did not open in time."
    return 1
  fi

  if ! wait_for_http "http://localhost:${BACKEND_PORT}/healthz" "backend liveness" 60; then
    log_warn "Backend liveness endpoint did not return 200 within the timeout; continuing (smoke tests will validate API)."
  fi

  record_step "backend:start" "passed" "node dist/src/server.js" "$(( $(date +%s) - start_ts ))"
  return 0
}

stop_backend() {
  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" >/dev/null 2>&1; then
    set +e
    kill "${BACKEND_PID}" >/dev/null 2>&1
    wait "${BACKEND_PID}" >/dev/null 2>&1
    set -e
    record_step "backend:stop" "passed" "kill ${BACKEND_PID}" 0
  fi
  BACKEND_PID=""
}

start_frontend() {
  local log_file="${LOG_DIR}/frontend.log"
  local start_ts=$(date +%s)
  (
    cd "${ROOT_DIR}/bh-fe" || exit 1
    exec npx --yes serve -s build -l ${FRONTEND_PORT}
  ) >"${log_file}" 2>&1 &
  FRONTEND_PID=$!

  sleep 2
  if [[ -z "${FRONTEND_PID}" ]] || ! kill -0 "${FRONTEND_PID}" >/dev/null 2>&1; then
    record_step "frontend:start" "failed" "serve -s build -l ${FRONTEND_PORT}" "$(( $(date +%s) - start_ts ))"
    log_error "Frontend failed to start. See ${log_file}."
    return 1
  fi

  if ! wait_for_port "127.0.0.1" "${FRONTEND_PORT}" 60; then
    record_step "frontend:start" "failed" "serve -s build -l ${FRONTEND_PORT}" "$(( $(date +%s) - start_ts ))"
    log_error "Frontend port ${FRONTEND_PORT} did not open in time."
    return 1
  fi

  if ! wait_for_http "http://localhost:${FRONTEND_PORT}" "frontend root" 60; then
    log_warn "Frontend root did not respond with 200 within the timeout; continuing (Playwright smoke will validate)."
  fi

  record_step "frontend:start" "passed" "serve -s build -l ${FRONTEND_PORT}" "$(( $(date +%s) - start_ts ))"
  return 0
}

stop_frontend() {
  if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" >/dev/null 2>&1; then
    set +e
    kill "${FRONTEND_PID}" >/dev/null 2>&1
    wait "${FRONTEND_PID}" >/dev/null 2>&1
    set -e
    record_step "frontend:stop" "passed" "kill ${FRONTEND_PID}" 0
  fi
  FRONTEND_PID=""
}

prepare_database() {
  local admin_url="postgresql://aurel@127.0.0.1:${PG_PORT}/postgres"
  local role_sql="${RUN_DIR}/bootstrap-role.sql"
  cat <<'SQL' > "${role_sql}"
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'biohax') THEN
    CREATE ROLE biohax WITH LOGIN PASSWORD 'biohax';
  END IF;
  ALTER ROLE biohax WITH LOGIN PASSWORD 'biohax';
  ALTER ROLE biohax WITH CREATEDB;
END$$;
SQL

  run_step "database:bootstrap-role" 120 bash -lc "env DATABASE_URL='${admin_url}' npx prisma db execute --stdin --schema backend/prisma/schema.prisma < '${role_sql}'"

  # prisma migrate reset will create the database if it does not exist
}

run_docker_pipeline() {
  require_command docker
  if ! docker compose version >/dev/null 2>&1; then
    log_error "docker compose plugin is required (docker compose version failed)."
    exit 1
  fi

  local compose_file="${DOCKER_COMPOSE_FILE:-${ROOT_DIR}/docker-compose.release.yml}"
  local compose_env_file="${DOCKER_ENV_FILE:-${ROOT_DIR}/devops/release.env}"
  local backend_image_repo="${BACKEND_IMAGE}"
  local frontend_image_repo="${FRONTEND_IMAGE}"
  local backend_image_ref="${backend_image_repo}:${RELEASE_TAG}"
  local frontend_image_ref="${frontend_image_repo}:${RELEASE_TAG}"
  local docker_backend_port=${BACKEND_PORT:-4000}
  local docker_frontend_port=${FRONTEND_PORT:-8080}
  local docker_postgres_port=${POSTGRES_PORT:-6543}

  if [[ -f "${compose_env_file}" ]]; then
    local env_backend_port env_frontend_port env_postgres_port
    env_backend_port=$(grep -E '^BACKEND_PORT=' "${compose_env_file}" | tail -n 1 | cut -d= -f2- || true)
    env_frontend_port=$(grep -E '^FRONTEND_PORT=' "${compose_env_file}" | tail -n 1 | cut -d= -f2- || true)
    env_postgres_port=$(grep -E '^POSTGRES_PORT=' "${compose_env_file}" | tail -n 1 | cut -d= -f2- || true)
    env_backend_port=${env_backend_port//[[:space:]\"\'\r]/}
    env_frontend_port=${env_frontend_port//[[:space:]\"\'\r]/}
    env_postgres_port=${env_postgres_port//[[:space:]\"\'\r]/}
    if [[ -n "${env_backend_port}" ]]; then
      docker_backend_port=${env_backend_port}
    fi
    if [[ -n "${env_frontend_port}" ]]; then
      docker_frontend_port=${env_frontend_port}
    fi
    if [[ -n "${env_postgres_port}" ]]; then
      docker_postgres_port=${env_postgres_port}
    fi
  fi

  BUILT_BACKEND_IMAGE="${backend_image_ref}"
  BUILT_FRONTEND_IMAGE="${frontend_image_ref}"

  run_step "docker:build-backend" 1800 docker build -f "${ROOT_DIR}/backend/Dockerfile" -t "${backend_image_ref}" "${ROOT_DIR}/backend"
  run_step "docker:build-frontend" 1800 docker build -f "${ROOT_DIR}/bh-fe/Dockerfile" -t "${frontend_image_ref}" "${ROOT_DIR}/bh-fe"

  run_step "docker:migrate" 900 env BACKEND_IMAGE="${backend_image_ref}" FRONTEND_IMAGE="${frontend_image_ref}" docker compose -f "${compose_file}" --env-file "${compose_env_file}" run --rm migrate
  run_step "docker:seed" 600 env BACKEND_IMAGE="${backend_image_ref}" FRONTEND_IMAGE="${frontend_image_ref}" docker compose -f "${compose_file}" --env-file "${compose_env_file}" run --rm seed
  run_step "docker:up" 300 env BACKEND_IMAGE="${backend_image_ref}" FRONTEND_IMAGE="${frontend_image_ref}" docker compose -f "${compose_file}" --env-file "${compose_env_file}" up -d backend frontend

  if ! wait_for_http "http://localhost:${docker_backend_port}/healthz" "docker backend liveness" 120; then
    log_warn "Docker backend liveness did not return 200 within the timeout; continuing."
  fi
  if ! wait_for_http "http://localhost:${docker_frontend_port}" "docker frontend root" 120; then
    log_warn "Docker frontend root did not return 200 within the timeout; continuing."
  fi

  if [[ ${SKIP_TESTS} -eq 0 ]]; then
    run_step "playwright:release" 900 env PLAYWRIGHT_TASK_ID="${PLAYWRIGHT_TASK_ID}" PLAYWRIGHT_BASE_URL="http://localhost:${docker_frontend_port}" RELEASE_BACKEND_URL="http://localhost:${docker_backend_port}" npm run test:e2e --prefix bh-fe
    PLAYWRIGHT_STATUS="unknown"
    for entry in "${STEP_RESULTS[@]}"; do
      if [[ "${entry}" == playwright:release* ]]; then
        IFS='|' read -r _ status _ <<<"${entry}"
        PLAYWRIGHT_STATUS="${status}"
      fi
    done
  else
    log_warn "Skipping Playwright tests (--skip-tests provided)."
    PLAYWRIGHT_STATUS="skipped"
  fi

  run_step "docker:log-backend" 120 bash -lc "BACKEND_IMAGE='${backend_image_ref}' FRONTEND_IMAGE='${frontend_image_ref}' docker compose -f '${compose_file}' --env-file '${compose_env_file}' logs backend --no-color > '${LOG_DIR}/backend.log'"
  run_step "docker:log-frontend" 120 bash -lc "BACKEND_IMAGE='${backend_image_ref}' FRONTEND_IMAGE='${frontend_image_ref}' docker compose -f '${compose_file}' --env-file '${compose_env_file}' logs frontend --no-color > '${LOG_DIR}/frontend.log'"
  run_step "docker:log-postgres" 120 bash -lc "BACKEND_IMAGE='${backend_image_ref}' FRONTEND_IMAGE='${frontend_image_ref}' docker compose -f '${compose_file}' --env-file '${compose_env_file}' logs postgres --no-color > '${LOG_DIR}/postgres.log'"
  run_step "docker:logs" 120 bash -lc "BACKEND_IMAGE='${backend_image_ref}' FRONTEND_IMAGE='${frontend_image_ref}' docker compose -f '${compose_file}' --env-file '${compose_env_file}' logs --no-color > '${LOG_DIR}/docker-compose.log'"
  run_step "docker:down" 180 env BACKEND_IMAGE="${backend_image_ref}" FRONTEND_IMAGE="${frontend_image_ref}" docker compose -f "${compose_file}" --env-file "${compose_env_file}" down -v

  BACKEND_PORT=${docker_backend_port}
  FRONTEND_PORT=${docker_frontend_port}
  PG_PORT=${docker_postgres_port}
}

finalize_run() {
  RUN_COMPLETED_AT=${RUN_COMPLETED_AT:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}

  local steps_file="${RUN_DIR}/steps.txt"
  printf '%s\n' "${STEP_RESULTS[@]}" > "${steps_file}"
  STEPS_FILE="${steps_file}"

  if [[ ${SKIP_TESTS} -eq 1 ]]; then
    DRY_RUN_STATUS="skipped"
  else
    if [[ "${PIPELINE_STATUS}" == "passed" ]]; then
      DRY_RUN_STATUS="passed"
    else
      DRY_RUN_STATUS="failed"
    fi
  fi

  export ROOT_DIR RUN_DIR LOG_DIR STEPS_FILE RELEASE_TAG MODE RUN_ID RUN_STARTED_AT RUN_COMPLETED_AT PIPELINE_STATUS DRY_RUN_STATUS PLAYWRIGHT_STATUS PLAYWRIGHT_OUTPUT_DIR PLAYWRIGHT_REPORT_DIR BACKEND_PORT FRONTEND_PORT PG_PORT BUILT_BACKEND_IMAGE BUILT_FRONTEND_IMAGE

  python3 - "${MANIFEST_PATH}" <<'PY'
import json
import os
import sys
from datetime import datetime

manifest_path = sys.argv[1]
root = os.environ["ROOT_DIR"]
run_dir = os.environ["RUN_DIR"]
log_dir = os.environ["LOG_DIR"]
steps_file = os.environ["STEPS_FILE"]
release_tag = os.environ["RELEASE_TAG"]
mode = os.environ["MODE"]
run_id = os.environ["RUN_ID"]
started_at = os.environ["RUN_STARTED_AT"]
completed_at = os.environ["RUN_COMPLETED_AT"]
pipeline_status = os.environ["PIPELINE_STATUS"]
dry_run_status = os.environ["DRY_RUN_STATUS"]
playwright_status = os.environ["PLAYWRIGHT_STATUS"]
playwright_output = os.environ["PLAYWRIGHT_OUTPUT_DIR"]
playwright_report = os.environ["PLAYWRIGHT_REPORT_DIR"]
backend_log = os.path.join(log_dir, "backend.log")
frontend_log = os.path.join(log_dir, "frontend.log")
postgres_log = os.path.join(log_dir, "postgres.log")
compose_log = os.path.join(log_dir, "docker-compose.log")
backend_image = os.environ.get("BUILT_BACKEND_IMAGE") or None
frontend_image = os.environ.get("BUILT_FRONTEND_IMAGE") or None

steps = []
with open(os.environ["STEPS_FILE"], "r", encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        name, status, command, duration = line.split("|", 3)
        try:
            duration_val = int(duration)
        except ValueError:
            duration_val = -1
        steps.append({
            "name": name,
            "status": status,
            "command": command,
            "duration_seconds": duration_val
        })

manifest = {
    "release_tag": release_tag,
    "mode": mode,
    "run_id": run_id,
    "run_directory": run_dir,
    "started_at": started_at,
    "completed_at": completed_at,
    "status": pipeline_status,
    "dry_run": {
        "status": dry_run_status,
        "playwright_status": playwright_status,
        "backend_port": os.environ.get("BACKEND_PORT"),
        "frontend_port": os.environ.get("FRONTEND_PORT"),
        "database_port": os.environ.get("PG_PORT")
    },
    "images": {
        "backend": backend_image,
        "frontend": frontend_image
    },
    "logs": {
        "backend": backend_log,
        "frontend": frontend_log,
        "postgres": postgres_log,
        "playwright_output": playwright_output,
        "playwright_report": playwright_report
    },
    "steps": steps
}

if compose_log and os.path.exists(compose_log):
    manifest["logs"]["compose"] = compose_log

with open(manifest_path, "w", encoding="utf-8") as fh:
    json.dump(manifest, fh, indent=2)
PY

  log_info "Release tag: ${RELEASE_TAG}"
  log_info "Run directory: ${RUN_DIR}"
  log_info "Pipeline status: ${PIPELINE_STATUS}"
}
cleanup() {
  set +e
  stop_frontend
  stop_backend
  stop_embedded_pg
  set -e
}

trap cleanup EXIT INT TERM

if [[ "${MODE}" == "docker" ]]; then
  run_docker_pipeline
  RUN_COMPLETED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  finalize_run
  exit 0
fi

PG_DATABASE_URL="postgresql://biohax:biohax@127.0.0.1:${PG_PORT}/biohax?schema=public"

if [[ ${SKIP_BUILD} -eq 0 ]]; then
  run_step "backend:npm-ci" 600 npm ci --prefix backend
  run_step "frontend:npm-ci" 600 npm ci --prefix bh-fe
  run_step "backend:build" 600 npm run build --prefix backend
  run_step "backend:prisma-generate" 300 npm run prisma:generate --prefix backend
  run_step "frontend:build" 900 env VITE_API_BASE_URL="http://localhost:${BACKEND_PORT}" npm run build --prefix bh-fe
else
  log_warn "Skipping npm install/build steps (--skip-build provided)."
fi

BUILT_BACKEND_IMAGE="embedded-local"
BUILT_FRONTEND_IMAGE="embedded-local"

start_embedded_pg || true
prepare_database
run_step "database:reset" 600 env DATABASE_URL="${PG_DATABASE_URL}" npm run db:reset --prefix backend
start_backend || true
start_frontend || true

PLAYWRIGHT_STATUS="skipped"
if [[ ${SKIP_TESTS} -eq 0 ]]; then
  run_step "playwright:release" 900 env PLAYWRIGHT_TASK_ID="${PLAYWRIGHT_TASK_ID}" PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL}" RELEASE_BACKEND_URL="http://localhost:${BACKEND_PORT}" npm run test:e2e --prefix bh-fe
  PLAYWRIGHT_STATUS="unknown"
  for entry in "${STEP_RESULTS[@]}"; do
    if [[ "${entry}" == playwright:release* ]]; then
      IFS='|' read -r _ status _ <<<"${entry}"
      PLAYWRIGHT_STATUS="${status}"
    fi
  done
else
  log_warn "Skipping Playwright tests (--skip-tests provided)."
fi

stop_frontend
stop_backend
stop_embedded_pg

RUN_COMPLETED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
finalize_run
exit 0
