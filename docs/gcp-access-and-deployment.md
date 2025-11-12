# BioHax GCP Access & Deployment Handbook

> **Important**  
> The repository does not contain authoritative IAM exports. I could not confirm from within this environment that the Saffloders or DevOps teams currently hold `roles/owner` or equivalent permissions on the `biohax-777` Google Cloud project. Follow the verification steps below on a workstation with `gcloud` access before relying on that assumption.

## 1. Credential Source
- The repo-level `.env` declares `GOOGLE_APPLICATION_CREDENTIALS="~/.config/gcloud/biohax-sa.json"`.  
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
1. Source `.env` so `GOOGLE_APPLICATION_CREDENTIALS` is exported.  
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
| `deploy-cloud-run.sh` | Lints/tests the backend, builds via Cloud Build, and deploys to Cloud Run. | Production or staging releases. |

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
   ./devops-biohax/deploy-cloud-run.sh \
     [optional overrides: GCP_PROJECT=... GCP_REGION=... CLOUD_RUN_SERVICE=...]
   ```
   The script:
   - Activates the service account (unless `SKIP_GCLOUD_LOGIN=1` is set).
   - Verifies the active identity for `biohax-777`.
   - Targets the Cloud Run service `bh-backend-final` by default (override with `CLOUD_RUN_SERVICE` if deploying elsewhere).
   - Checks required secrets and bucket access, including `roles/storage.objectAdmin` for the service account.
   - Runs `npm run lint` and `npm run test` in `backend/`.
   - Submits the container build via Cloud Build.
   - Deploys Cloud Run with environment variables and Secret Manager bindings (OpenRouter, Whoop, JWT, DB, etc.).

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

## 7. Recommended Next Checks
- Confirm IAM bindings for Saffloders and DevOps using the command in §2; capture evidence (timestamped command output) for audit. A full IAM export gathered on 2025-11-07T14:36:34+02:00 is stored at `docs/biohax-777-iam-policy.json`.  
- Rotate the `biohax-sa.json` key regularly and update the stored file path.  
- Consider placing the key in Secret Manager or Workload Identity Federation instead of distributing JSON keys where possible.  
- Add CI safeguards so deployment scripts fail fast when the BioHax production URL or bucket configuration drifts.
