# BioHax GCP Access & Deployment Handbook

> **Important**  
> The repository does not contain authoritative IAM exports. I could not confirm from within this environment that the Saffloders or DevOps teams currently hold `roles/owner` or equivalent permissions on the `biohax-777` Google Cloud project. Follow the verification steps below on a workstation with `gcloud` access before relying on that assumption.

## 1. Credential Source
- The repo-level `.env` declares `GOOGLE_APPLICATION_CREDENTIALS="/Users/aurel/codex-jesus/.secrets/biohax-777.json"`.  
- Store the service-account key file at `~/.config/gcloud/biohax-sa.json` on trusted machines only.  
- Load the variable before running DevOps tooling:

```bash
source .env
export GOOGLE_APPLICATION_CREDENTIALS  # shellcheck disable=SC2155 when scripting
```

## 2. Verifying Team Access
Run these commands from a machine with `gcloud` installed and network access:

```bash
source .env
./devops-biohax/gcp-auth.sh  # uses the credential above if present
```

Confirm the active account matches the service account required by the scripts (`codexjesus@biohax-777.iam.gserviceaccount.com`). Then inspect IAM bindings to ensure that the Saffloders and DevOps groups/accounts are granted the expected roles:

```bash
gcloud projects get-iam-policy biohax-777 \
  --flatten="bindings[].members" \
  --filter="bindings.members:SAFFLODERS_IDENTIFIER OR bindings.members:DEVOPS_IDENTIFIER" \
  --format="table(bindings.role, bindings.members)"
```

Replace `SAFFLODERS_IDENTIFIER` and `DEVOPS_IDENTIFIER` with the actual Google identities (group emails, user emails, or service accounts). If the command returns no rows, the bindings are missing and must be added manually by a project owner.

## 3. Google Cloud Authentication Workflow
1. Copy `.env.example` to `.env`, ensure the service-account key exists at `/Users/aurel/codex-jesus/.secrets/biohax-777.json`, and `source .env` so `GOOGLE_APPLICATION_CREDENTIALS` is exported.  
2. Execute `./devops-biohax/gcp-auth.sh`. The script:
   - Creates/uses `~/.config/gcloud`.
   - Activates the service account via the key file or launches browser login if no key is found.
   - Sets the default project (`biohax-777`) and region (`europe-west1`).
   - Configures Docker credential helpers for Artifact Registry.
   - Validates that the active account is `codexjesus@biohax-777.iam.gserviceaccount.com` when operating on `biohax-777`.

If authentication fails, verify the key file exists and is readable, then rerun.

## 4. Core DevOps Scripts
All automation lives under `devops-biohax/`. The expected flow is:

| Script | Purpose | When to use |
| --- | --- | --- |
| `start-dev.sh` | Boots the local Docker Compose stack for backend, `bh-fe` frontend, Postgres, Redis. | Local development. |
| `stop-dev.sh` | Tears down the Compose stack. | After local work or before switching branches. |
| `logs.sh <service>` | Tails logs for a Compose service. | Debugging locally. |
| `gcp-auth.sh` | Authenticates and configures `gcloud`. | Before any remote GCP interaction. |
| `setup-storage-bucket.sh` | Creates/updates `gs://galeata-hax` (or `$GCS_STORAGE_BUCKET`) and grants storage roles. | One-time per environment or after bucket changes. |
| `deploy-backend.sh` | Runs backend QA (lint, tests, build) and ships the Cloud Run revision via Cloud Build. | Production or staging releases. |

Make each script executable (`chmod +x devops-biohax/*.sh`) if git does not preserve the bit.

> ⚠️ **Frontend releases must follow** [`docs/frontend-deploy-checklist.md`](frontend-deploy-checklist.md) **before running any deploy command.** That checklist covers Figma parity QA, local build verification, and the exact Cloud Run arguments for `bh-fe`.

## 5. Deploying BioHax to Cloud Run
1. Authenticate: `source .env && ./devops-biohax/gcp-auth.sh`.  
2. Ensure secrets exist (`jwt-secret`, `database-url`, `google-client-id`, etc.) via `gcloud secrets describe`.  
3. Confirm the storage bucket exists and is configured:
   ```bash
   ./devops-biohax/setup-storage-bucket.sh
   ```
4. Run backend tests locally or let the deploy script handle them.  
5. Deploy:
   ```bash
   ./devops/deploy-backend.sh \
     [optional overrides: GCP_PROJECT=... GCP_REGION=... CLOUD_RUN_SERVICE=...]
   ```
   The script:
   - Installs backend dependencies, lints, runs the full Jest suite (with embedded Postgres), and builds `dist/`.
   - Submits the repository to Cloud Build with the appropriate Dockerfile/build context.
   - Publishes the image to Artifact Registry (`europe-west1-docker.pkg.dev/<project>/biohax/bh-backend-final:latest` by default).
   - Deploys the new revision to Cloud Run (`bh-backend-final` by default).
   - Honors overrides such as `CLOUD_RUN_IMAGE`, `CLOUD_RUN_BUILD_CONTEXT`, `SKIP_QA=1`, etc.

6. Verify deployment status:
   ```bash
   gcloud run services describe bh-backend-final --region=europe-west1 \
     --format='value(status.url,status.traffic.statuses.status)'
   ```

## 6. Production Application Context
- Live app: <https://biohax.pro> (served by Cloud Run service `bh-fe-final`).  
- Cloud Run default CORS origin in scripts includes `https://biohax.pro`.  
- Cloud Run service account defaults to `codexjesus@biohax-777.iam.gserviceaccount.com`; ensure it has:
  - `roles/run.admin` (for deployments),
  - `roles/cloudbuild.builds.editor`,
  - `roles/artifactregistry.writer`,
  - `roles/storage.objectAdmin` on the artifact bucket and `gs://galeata-hax`,
  - `roles/secretmanager.secretAccessor` for each required secret.

## 7. Background Worker Runner
Longevity plan generation (queue `longevity-plan-generate`) now ships beside the existing queues (`insights-generate`, `whoop-sync`, `notifications-dispatch`). Keep a worker process online anywhere the backend stack runs:

- **Local / Docker Compose:** `docker compose -f docker-compose.release.yml up -d workers` brings up a container that executes `node dist/src/workers/runner.js` with the backend image. Set `WORKER_QUEUES` (comma-separated) if you need to scope queues; otherwise it listens to all registered queues by default. Optional tuning vars:
  - `WORKER_POLL_INTERVAL_MS` (default `5000`)
  - `WORKER_ERROR_BACKOFF_MS` (default `2000`)
- **Direct Node:** `cd backend && npm run build && npm run workers:run` reuses the same runner without Docker. Export the same env vars (`DATABASE_URL`, `OPENROUTER_*`, etc.) that the API expects.
- **Cloud Run / remote hosts:** deploy a second Cloud Run revision or GCE VM using the backend image and the `workers:run` entrypoint so queues drain even if the API autoscaler drops to zero. Mirror the secrets/env values from `bh-backend-final`.

Ensure the worker has network access to Cloud SQL, Memorystore (if used), and OpenRouter. Monitor Cloud Tasks via `gcloud tasks queues describe` or the Admin dashboard to confirm `longevity-plan-generate` stays near-zero backlog.

## 8. One-Off Prisma Operations Against Cloud SQL
When you need to run Prisma commands (migrations, `db:seed`, manual SQL) directly against the production Cloud SQL instance, follow this repeatable sequence:

```bash
# prerequisites: gcloud CLI, GOOGLE_APPLICATION_CREDENTIALS (or gcloud auth login)
cd /Users/aurel/codex-jesus

# 1) Download the Cloud SQL Auth proxy once
curl -o cloud_sql_proxy https://dl.google.com/cloudsql/cloud_sql_proxy.darwin.amd64
chmod +x cloud_sql_proxy

# 2) Start the proxy in a separate shell
GOOGLE_APPLICATION_CREDENTIALS=.secrets/biohax-777.json \
  ./cloud_sql_proxy -instances=biohax-777:europe-west1:biohax-main-postgres=tcp:5434

# 3) In a new shell, fetch the DATABASE_URL secret and rewrite it to use the proxy
RAW_DB_URL="$(gcloud secrets versions access latest \
  --secret=database-url \
  --project=biohax-777)"
export DATABASE_URL="$(node -e 'const url = new URL(process.env.RAW_DB_URL);
  url.hostname = "127.0.0.1"; url.port = "5434"; url.searchParams.delete("host");
  console.log(url.toString());')"

# 4) Run any Prisma workflow
cd backend
npx prisma migrate deploy
npm run db:seed

# 5) Stop the proxy when finished
pkill -f cloud_sql_proxy
```

This ensures migrations/seeds run against the managed instance via Secret Manager and the Cloud SQL connector without exposing credentials in local files. Future DevOps automation can wrap the above into `devops/run-prisma-with-proxy.sh` to reduce boilerplate.

## 9. Recommended Next Checks
- Confirm IAM bindings for Saffloders and DevOps using the command in §2; capture evidence (timestamped command output) for audit. A full IAM export gathered on 2025-11-07T14:36:34+02:00 is stored at `docs/biohax-777-iam-policy.json`.  
- Rotate the `biohax-sa.json` key regularly and update the stored file path.  
- Consider placing the key in Secret Manager or Workload Identity Federation instead of distributing JSON keys where possible.  
- Add CI safeguards so deployment scripts fail fast when the BioHax production URL or bucket configuration drifts.
