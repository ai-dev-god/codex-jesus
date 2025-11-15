 # BioHax Frontend (`bh-fe`)

This workspace is a direct copy of the canonical BioHax Platform UI/UX that lives in the
[Figma reference](https://dragon-fiber-44254851.figma.site/) and the public repo
[ai-dev-god/bh-fe](https://github.com/ai-dev-god/bh-fe). It contains the complete marketing
landing page, auth/onboarding surfaces, dashboards, practitioner tooling, and auxiliary
pages required for parity with the design system.

## Scripts

```bash
npm install          # install dependencies
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # production bundle -> dist/
npm run preview      # serve the built bundle locally
npm run test:e2e     # Playwright smoke (installs Chromium automatically)
```

The Vite dev server binds to `0.0.0.0:5173` so the release scripts can proxy it. `npm run build`
produces `dist/` artifacts that the Dockerfile copies into Nginx.

## Environment

Create a `.env` file in `bh-fe/` before running the app:

```
VITE_API_BASE_URL=http://localhost:4000
VITE_GOOGLE_CLIENT_ID=<google-oauth-client-id>
```

Secrets live in Google Secret Manager inside the `biohax-777` project. Use:

```bash
gcloud secrets versions access latest --secret=google-client-id
```

and copy the value into `VITE_GOOGLE_CLIENT_ID`. Override `VITE_API_BASE_URL` when pointing the SPA at a different backend host.

## Playwright smoke

`tests/e2e/landing.spec.ts` performs a lightweight regression on the hero section to ensure
the landing experience keeps the Figma-approved messaging and CTAs intact. Set
`PLAYWRIGHT_BASE_URL` when running against a non-default host.

## Docker image

`Dockerfile` builds the Vite bundle and serves it via Nginx with a `/healthz` endpoint for
compose/Cloud Run health checks. Override `VITE_API_BASE_URL` at build time to point to a
different backend.

To build via Cloud Build with BuildKit enabled:

```bash
gcloud builds submit bh-fe \
  --config bh-fe/cloudbuild.yaml \
  --substitutions=_IMAGE_NAME=gcr.io/$GOOGLE_CLOUD_PROJECT/bh-fe-final:latest
```