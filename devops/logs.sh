#!/bin/sh
set -eu

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.dev.yml}
SERVICE=${1:-}
TAIL=${TAIL:-100}

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

if [ -n "$SERVICE" ]; then
  compose logs -f --tail="$TAIL" "$SERVICE"
else
  compose logs -f --tail="$TAIL"
fi
