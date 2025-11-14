# BioHax Frontend (`bh-fe`)

This workspace contains the Vite + React SPA that the release tooling references. It ships with a Dockerfile for production builds and a Playwright smoke suite so `devops/release.sh` can run end-to-end checks without additional setup.

## Quick start

```bash
npm install
npm run dev
```

The dev server listens on port 5173 and assumes the backend API is reachable at `http://localhost:4000`.

## Build & preview

```bash
npm run build
npm run preview
```

`npm run build` generates the assets consumed by `devops/start-e2e.sh` and local release dry-runs. `npm run preview` mirrors the static server configuration used inside the Docker image.

## Playwright tests

```bash
npm run test:e2e
```

- The script automatically installs the Chromium browser bin before executing the suite.
- Set `PLAYWRIGHT_BASE_URL` to override the default (`http://127.0.0.1:5173`).
- HTML reports respect `PLAYWRIGHT_REPORT_DIR`; raw traces/screenshots are stored under `tests/.playwright` (see `playwright.config.ts`).

## Docker image

The multi-stage `Dockerfile` builds the Vite bundle and serves it through Nginx. A lightweight entrypoint renders `nginx.conf.template` with the runtime `PORT`, so Cloud Run (or any orchestrator) can dictate the listen port while `/healthz` remains available for probes.

Build locally with:

```bash
docker build -t biohax-frontend:local .
```

Pass `--build-arg VITE_API_BASE_URL=<url>` if the frontend should target a different backend at build time.
