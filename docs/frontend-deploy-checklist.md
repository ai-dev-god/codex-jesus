# BioHax Frontend Deploy & QA Checklist

This checklist documents the minimum steps required before promoting the
`bh-fe` frontend to production. The last deployment skipped parity checks
and shipped a layout that diverged from the Figma source; treat these
instructions as mandatory to prevent a repeat.

## 1. Source of Truth
- **Design reference:** https://dragon-fiber-44254851.figma.site (exported Figma build)
- **Canonical codebase:** the checked-in `bh-fe/` workspace in this repo. Keep it
  as the single source of truth and ensure any upstream references are mirrored
  here before starting QA.

## 2. Local Sync
1. Update the local `bh-fe/` folder from the canonical repo if changes exist.
2. Confirm no legacy dependencies remain—the app must rely solely on Google
   Cloud Platform.
3. Run `npm install` and ensure there are no unresolved packages or audit
   warnings that block production.
4. Populate `bh-fe/.env` with:
   - `VITE_API_BASE_URL` (usually `http://localhost:4000` for dev)
   - `VITE_GOOGLE_CLIENT_ID` retrieved via `gcloud secrets versions access latest --secret=google-client-id`
   This keeps OAuth + fetch flows aligned with the backend.
5. In the repo root, ensure `.env` exports `GOOGLE_APPLICATION_CREDENTIALS=/Users/aurel/codex-jesus/.secrets/biohax-777.json` (copy from `.env.example`) so every `gcloud`/Cloud Build command picks up the production service account.
6. Build the production container via Cloud Build to catch regressions before deploying:
   ```bash
   gcloud builds submit bh-fe \
     --config bh-fe/cloudbuild.yaml \
     --substitutions=_IMAGE_NAME=gcr.io/biohax-777/bh-fe-final:latest,_VITE_API_BASE_URL=https://api.biohax.pro
   ```
   (Overrides for other projects/registries can be passed through `_IMAGE_NAME`.)

## 3. Pixel-Perfect QA
1. Start the dev server locally: `npm run dev`.
2. Open the Figma reference site in a second window.
3. For each primary route/state (landing, onboarding, dashboards, modals,
   mobile breakpoints, dark/light themes), compare the implementation
   against Figma:
   - Typography (font family, weight, size, line height)
   - Spacing, layout grids, paddings/margins
   - Colors, borders, drop shadows, gradients
   - Component states (hover, active, disabled)
4. Capture mismatches as issues and resolve them before proceeding.
5. Record the QA pass in the commit or deployment notes (include tester,
   date, browsers/devices used).

## 4. Build Verification
1. Run a clean production build: `npm run build`.
2. Serve the output locally (e.g. `npx serve build`) and re-check critical
   flows to catch differences between dev and prod bundles.
3. Store the generated `build/` artifacts (or rely on the Docker build
   stage) so the deploy script can package them.

## 5. Deployment
1. Authenticate with GCP (`./devops-biohax/gcp-auth.sh` or ensure the
   correct service account is active).
2. Deploy via Cloud Build (the backend uses `./devops/deploy-backend.sh`; the frontend ships with the command below):
   ```bash
   gcloud builds submit bh-fe \
     --project "${GCP_PROJECT:-biohax-777}" \
     --config bh-fe/cloudbuild.yaml \
     --substitutions=_IMAGE_NAME=gcr.io/${GCP_PROJECT:-biohax-777}/bh-fe-final:latest,_CLOUD_RUN_SERVICE=${CLOUD_RUN_SERVICE:-bh-fe-final},_REGION=${GCP_REGION:-europe-west1},_VITE_API_BASE_URL=${VITE_API_BASE_URL:-https://api.biohax.pro}
   ```
3. Before announcing the release, run the shared link checker so we catch missing Strava/Whoop secrets or dead URLs _before_ customers do:
   ```bash
   node devops/link-checker.mjs --config /Users/aurel/codex-jesus/devops/link-checks.json
   ```
   This hits `https://biohax.pro`, `https://api.biohax.pro/healthz`, and validates that the backend readiness endpoint reports every required integration as `pass`.
4. If the backend changed in the same release, run `./devops/deploy-backend.sh` first so API QA completes before shipping the UI.
5. Wait for Cloud Build + Cloud Run to finish and note the revision URL.

## 6. Post-Deploy Validation
1. Hit the Cloud Run URL (and the production domain once DNS is updated)
   on desktop and mobile to confirm parity with Figma.
2. Clear caches/CDN as needed.
3. Monitor logs and error reporting for the first hour after release.

## 7. Rollback Plan
- Keep the previous gold build/tag handy in Artifact Registry.
- Use `gcloud run services update-traffic` to shift traffic back to the
  last known-good revision if parity issues surface post-release.
- Document the regression in the runbook and feed fixes back into the QA
  checklist.

## 8. Communication
- Summarize the QA results and deployment command set in the release notes.
- If deviations from Figma are intentional, capture product/design sign-off
  in writing (Slack thread or PR comment) before deployment.
