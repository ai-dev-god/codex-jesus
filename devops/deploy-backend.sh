#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[deploy-backend] %s\n' "$*"
}

PROJECT_ID=${GCP_PROJECT:-biohax-777}
REGION=${GCP_REGION:-europe-west1}
SERVICE=${CLOUD_RUN_SERVICE:-bh-backend-final}
IMAGE_NAME=${CLOUD_RUN_IMAGE:-"gcr.io/${PROJECT_ID}/bh-backend-final:latest"}
DOCKERFILE=${CLOUD_RUN_DOCKERFILE:-backend/Dockerfile}
BUILD_CONTEXT=${CLOUD_RUN_BUILD_CONTEXT:-backend}
QA_DATABASE_URL=${QA_DATABASE_URL:-"postgresql://biohax:biohax@127.0.0.1:6543/biohax?schema=public"}
SKIP_QA=${SKIP_QA:-0}
JEST_ARGS=${JEST_ARGS:---runInBand}
INTEGRATION_TESTS=(
  "tests/integration/backend-contract.test.ts"
  "tests/integration/rooms-api.test.ts"
)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA_DB_PORT=$(python3 - <<'PY'
import os, urllib.parse
url = os.environ.get("QA_DATABASE_URL") or "postgresql://biohax:biohax@127.0.0.1:6543/biohax?schema=public"
parsed = urllib.parse.urlparse(url)
print(parsed.port or 6543)
PY
)
LINK_CHECK_CONFIG=${LINK_CHECK_CONFIG:-"${ROOT_DIR}/devops/link-checks.json"}
SKIP_LINK_CHECKS=${SKIP_LINK_CHECKS:-0}

DEFAULT_GCP_CREDENTIALS="/Users/aurel/codex-jesus/.secrets/biohax-777.json"
if [[ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
  export GOOGLE_APPLICATION_CREDENTIALS="${DEFAULT_GCP_CREDENTIALS}"
fi

kill_embedded_pg() {
  if command -v lsof >/dev/null 2>&1; then
    local pids
    if pids=$(lsof -ti "tcp:${QA_DB_PORT}" 2>/dev/null) && [[ -n "${pids}" ]]; then
      log "Killing stale embedded Postgres processes on port ${QA_DB_PORT}"
      # shellcheck disable=SC2086
      kill ${pids} >/dev/null 2>&1 || true
    fi
  fi
}

reset_embedded_pg_dirs() {
  rm -rf "${ROOT_DIR}/tools/.tmp/embedded-pg" || true
  if [[ -d "${ROOT_DIR}/tools/.tmp" ]]; then
    find "${ROOT_DIR}/tools/.tmp" -maxdepth 1 -type d \( -name 't0*pg*' -o -name 'worker-*' \) -exec rm -rf {} + 2>/dev/null || true
  fi
}

run_qa() {
  if [[ "${SKIP_QA}" == "1" ]]; then
    log "Skipping QA checks (SKIP_QA=1)"
    return
  fi

  log "Installing backend dependencies"
  npm ci --prefix "${ROOT_DIR}/backend"

  log "Resetting embedded Postgres binaries"
  reset_embedded_pg_dirs

  log "Running backend lint"
  npm run lint --prefix "${ROOT_DIR}/backend"

  log "Running backend unit tests"
  kill_embedded_pg
  reset_embedded_pg_dirs
  env DATABASE_URL="${QA_DATABASE_URL}" TEST_DATABASE_URL="${QA_DATABASE_URL}" \
    npm run test --prefix "${ROOT_DIR}/backend" -- ${JEST_ARGS} --testPathIgnorePatterns=tests/integration
  kill_embedded_pg
  reset_embedded_pg_dirs

  for spec in "${INTEGRATION_TESTS[@]}"; do
    if [[ ! -f "${ROOT_DIR}/backend/${spec}" ]]; then
      continue
    fi

    log "Running integration suite: ${spec}"
    kill_embedded_pg
    reset_embedded_pg_dirs
    local pg_root
    pg_root=$(mktemp -d "${ROOT_DIR}/tools/.tmp/embedded-pg-XXXXXX")
    env DATABASE_URL="${QA_DATABASE_URL}" TEST_DATABASE_URL="${QA_DATABASE_URL}" EMBEDDED_PG_ROOT="${pg_root}" \
      npm run test --prefix "${ROOT_DIR}/backend" -- ${JEST_ARGS} "${spec}"
    rm -rf "${pg_root}"
    kill_embedded_pg
    reset_embedded_pg_dirs
  done

  log "Building backend dist"
  npm run build --prefix "${ROOT_DIR}/backend"
}

run_link_checks() {
  if [[ "${SKIP_LINK_CHECKS}" == "1" ]]; then
    log "Skipping link availability checks (SKIP_LINK_CHECKS=1)"
    return
  fi

  if [[ ! -f "${LINK_CHECK_CONFIG}" ]]; then
    log "No link check config found at ${LINK_CHECK_CONFIG}; skipping link availability checks."
    return
  fi

  log "Running link availability checks using ${LINK_CHECK_CONFIG}"
  node "${ROOT_DIR}/devops/link-checker.mjs" --config "${LINK_CHECK_CONFIG}"
}

release() {
  log "Submitting Cloud Build deployment"
  gcloud builds submit "${ROOT_DIR}" \
    --project "${PROJECT_ID}" \
    --config="${ROOT_DIR}/backend/cloudbuild.yaml"
}

run_qa
run_link_checks
release

