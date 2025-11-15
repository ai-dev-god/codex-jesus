# Cloud Run Manifests

This directory captures the source-of-truth manifests for deploying BioHax
services to Cloud Run. Keep the YAML files in sync with the active GCP setup
(`biohax-777`, region `europe-west1`) so DevOps can run a repeatable
`gcloud run services replace` without re-authoring flags every time.

## Files

- `backend.yaml` — Configures `bh-backend-final` (Express API + Prisma) with:
  - Artifact Registry image `europe-west1-docker.pkg.dev/biohax-777/biohax/bh-backend-final:latest`.
  - Cloud SQL connector annotation for `biohax-777:europe-west1:biohax-sql`.
  - Secret Manager bindings for database credentials, auth keys, OpenRouter,
    Whoop, Google OAuth, Redis, and Resend.
  - Production defaults for `CORS_ORIGIN`, Whoop redirect URI, and cache TTLs.
  - Service account `codexjesus@biohax-777.iam.gserviceaccount.com`.

## Applying updates

```bash
source .env
./devops-biohax/gcp-auth.sh

gcloud run services replace devops/cloudrun/backend.yaml \
  --project "${GCP_PROJECT:-biohax-777}" \
  --region "${GCP_REGION:-europe-west1}"
```

Override the image, Cloud SQL instance, or secret names in the YAML before
running the command when promoting to staging or sandboxes. Version control
remembers every manifest change, so deployments stay auditable.

## Secret expectations

The manifest references these Secret Manager entries (latest version by
default). Ensure they exist in the target project before deploying:

- `database-url`
- `redis-url`
- `jwt-secret`
- `auth-refresh-encryption-key`
- `openrouter-api-key`
- `whoop-client-id`
- `whoop-client-secret`
- `whoop-token-encryption-key`
- `google-client-id`
- `google-client-secret`
- `resend-api-key`

If a secret is renamed or rotated, update both Secret Manager and the manifest
so Cloud Run revisions can continue pulling configuration without manual flags.

