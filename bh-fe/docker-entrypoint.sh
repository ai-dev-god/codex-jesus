#!/bin/sh
set -euo pipefail

PORT="${PORT:-8080}"
TEMPLATE_PATH="/etc/nginx/templates/default.conf.template"
TARGET_PATH="/etc/nginx/conf.d/default.conf"

if [ ! -f "${TEMPLATE_PATH}" ]; then
  echo "Missing nginx template at ${TEMPLATE_PATH}" >&2
  exit 1
fi

export PORT
envsubst '${PORT}' < "${TEMPLATE_PATH}" > "${TARGET_PATH}"

exec nginx -g "daemon off;"

