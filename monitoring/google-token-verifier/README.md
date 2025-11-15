# Google Token Verifier (Cloud Run Job)

This utility container verifies that a stored Google ID token is still valid
against the production OAuth client
`714223448245-5djdq3fr1shhlqggfokp4nino3ddr6rp.apps.googleusercontent.com`. It
calls `https://oauth2.googleapis.com/tokeninfo?id_token=…` and fails the job if
Google reports an error or if the token’s `aud` field does not match the
expected client ID.

The job is intended to be run on a schedule (for example via Cloud Scheduler) so
we get early warning when manually seeded QA tokens expire or if Google rejects
them for any reason.

## Environment variables

| Name                | Description                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| `EXPECTED_CLIENT_ID`| The OAuth client ID the token should be issued for (defaults to production ID).  |
| `TEST_ID_TOKEN`     | A manually seeded Google ID token stored in Secret Manager.                      |
| `HTTP_TIMEOUT_MS`   | Optional timeout override (default 10000).                                       |

## Deploying as a Cloud Run Job

```bash
PROJECT=biohax-777
JOB_NAME=google-token-verifier
REGION=europe-west1
IMAGE=gcr.io/$PROJECT/$JOB_NAME:latest

# Build & push container
gcloud builds submit monitoring/google-token-verifier \
  --project "$PROJECT" \
  --tag "$IMAGE"

# Create/Update Cloud Run Job
gcloud run jobs deploy "$JOB_NAME" \
  --project "$PROJECT" \
  --region "$REGION" \
  --image "$IMAGE" \
  --set-env-vars EXPECTED_CLIENT_ID=714223448245-5djdq3fr1shhlqggfokp4nino3ddr6rp.apps.googleusercontent.com \
  --set-secrets TEST_ID_TOKEN=google-test-id-token:latest

# Run ad-hoc
gcloud run jobs execute "$JOB_NAME" \
  --project "$PROJECT" \
  --region "$REGION"
```

After the job is deployed you can create a Cloud Scheduler cron that uses
`gcloud run jobs execute …` (via Pub/Sub) to run it hourly/daily.

