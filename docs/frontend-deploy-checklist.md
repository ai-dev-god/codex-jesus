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
2. Deploy via the DevOps script, pointing to the frontend context only:
   ```bash
   SKIP_BACKEND_CHECKS=1 \
   CLOUD_RUN_BUILD_CONTEXT=bh-fe \
   CLOUD_RUN_SERVICE=bh-fe-final \
   CLOUD_RUN_IMAGE_NAME=bh-fe-final \
   CLOUD_RUN_IMAGE_TAG=latest \
   GCP_PROJECT=biohax-777 \
   GCP_REGION=europe-west1 \
   SKIP_GCLOUD_LOGIN=1 \
   ./devops-biohax/deploy-cloud-run.sh
   ```
3. Wait for Cloud Build + Cloud Run to finish and note the revision URL.

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
