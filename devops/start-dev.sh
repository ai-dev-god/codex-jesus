#!/bin/sh
set -eu

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.dev.yml}

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

log() {
  printf '%s\n' "$1"
}

wait_for_postgres() {
  log "Waiting for postgres service to become healthy..."
  retries=20
  count=0
  while [ "$count" -lt "$retries" ]; do
    if compose exec -T postgres pg_isready -U biohax -d biohax >/dev/null 2>&1; then
      log "postgres is ready."
      return 0
    fi
    count=$((count + 1))
    sleep 2
  done
  log "postgres health check failed."
  exit 1
}

log "Starting BioHax development stack..."
compose up -d postgres
wait_for_postgres

log "Installing backend dependencies (cached in backend_node_modules volume)..."
compose run --rm backend npm install

log "Generating Prisma client..."
compose run --rm backend npm run prisma:generate

log "Resetting and seeding database..."
compose run --rm backend npm run db:reset

log "Installing frontend dependencies (cached in frontend_node_modules volume)..."
compose run --rm frontend npm install

log "Launching backend and frontend services..."
compose up -d backend frontend

log "Development services are available at:"
log "  - API: http://localhost:4000/healthz"
log "  - Web: http://localhost:5173/"
