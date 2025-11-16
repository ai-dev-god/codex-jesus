# Admin Backup Stabilization Plan

_Last updated: 2025-11-16 @ 13:30 UTC_

## 1. Schema Gap Verification

- Production errors (`PrismaClientKnownRequestError` / `P2021`) originated from the `bh-backend-final` Cloud Run service when the `/admin/backups` endpoints touched the non-existent `public."AdminBackupJob"` table between **07:39–07:40 UTC**.
- Using the Cloud SQL proxy (`./cloud_sql_proxy -instances=biohax-777:europe-west1:biohax-main-postgres=tcp:6543`) and the DATABASE_URL secret, we verified the current state:
  - `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='AdminBackupJob';` → table is now present.
  - `_prisma_migrations` shows `20251115170000_admin_control_panel` finishing at **2025-11-16 11:10:57Z**, i.e., **after** the failing requests. Earlier revisions were rolled back successfully.
  - `SELECT status, COUNT(*) FROM "AdminBackupJob" GROUP BY status;` confirms the table is empty, so no historical data exists yet.

**Conclusion:** Production now has the table, but there was a four-hour window where the migration was missing. Future deploys must ensure `prisma migrate deploy` completes _before_ routing traffic.

## 2. Data Model & Contract

| Column | Type | Notes / Frontend expectation |
| --- | --- | --- |
| `id` | `TEXT` (`cuid()` default) | Shown as identifier in admin table |
| `type` | `AdminBackupType` enum (`FULL`/`INCREMENTAL`) | Drives UI badge styling |
| `status` | `AdminBackupStatus` enum (`QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`) | Displayed literally in UI badge |
| `initiatedById` | `TEXT` nullable FK → `User(id)` | Used to show initiator summary |
| `storageUri` | `TEXT` nullable | Download link/copy action |
| `sizeBytes` | `BIGINT` nullable | Displayed via `formatBytes` |
| `durationSeconds` | `INTEGER` nullable | Displayed in minutes |
| `startedAt` / `completedAt` | `TIMESTAMP(3)` nullable | UI sorts/labels by `completedAt` |
| `failureReason` | `TEXT` nullable | Currently unused but should capture errors |
| `metadata` | `JSONB` | Stores restore requests, etc. |
| `createdAt` / `updatedAt` | `TIMESTAMP(3)` | Default timestamps |

Frontend contract (`bh-fe/src/lib/api/admin.ts`) expects `initiatedBy` to include `{ id, displayName, email, role }`, which is satisfied through `BACKUP_INCLUDE` + `mapBackupJob`.

## 3. Migration & Backfill Plan

1. **Authoritative migration** already exists: `backend/prisma/migrations/20251115170000_admin_control_panel`.
2. **Staging rollout**  
   ```bash
   # Use staging DATABASE_URL (service account secret `database-url-staging`)
   cd /Users/aurel/codex-jesus/backend
   env DATABASE_URL="$STAGING_URL" npx prisma migrate deploy
   env DATABASE_URL="$STAGING_URL" npx prisma generate
   ```
3. **Production rollout** (after staging validation)  
   ```bash
   cd /Users/aurel/codex-jesus/backend
   env DATABASE_URL="$PROD_URL" npx prisma migrate deploy
   env DATABASE_URL="$PROD_URL" npx prisma generate
   ```
4. **Backfill** (optional): create `scripts/seed-admin-backups.ts` that inserts a synthetic `SUCCEEDED` job using `AdminService.triggerBackupJob` to give the UI baseline data. Run via `env DATABASE_URL=... ts-node scripts/seed-admin-backups.ts`.

## 4. Deploy & Validation Workflow

1. **Before deploy**
   - Run `npm run lint --prefix backend` and `npm test -- --runTestsByPath src/__tests__/admin.service.test.ts`.
   - Build & push container.
2. **Staging smoke test**
   - Deploy `bh-backend-final` to staging revision.
   - Hit `/admin/backups` and `/admin/backups/settings` using staff token; expect 200 responses.
3. **Production**
   - Promote image via `gcloud run deploy ...`.
   - Immediately run `gcloud logging read 'resource.labels.service_name="bh-backend-final" severity>=ERROR textPayload:"AdminBackupJob"' --limit=5`.
   - Verify `_prisma_migrations` newest row matches git HEAD.

## 5. Code Hardening Actions

1. **Startup schema verification (implemented)**  
   - New module `backend/src/startup/schema-check.ts` verifies `AdminBackupJob` and `ServiceApiKey` exist before the HTTP server starts.  
     Server boot now fails fast with a descriptive log if migrations are missing.
2. **Graceful fallbacks (existing)**  
   - `AdminService.listBackupJobs` returns an empty list for `P2021` until migrations run.
   - Mutating routes translate `P2021` into `503 BACKUPS_NOT_READY`.
3. **Future enhancements**
   - Extend `HealthService.checkDatabase` to verify `to_regclass('AdminBackupJob') IS NOT NULL` and report `degraded` instead of bare pass.
   - Emit structured log with `component=admin-backups` when falling back to empty results to aid dashboards.

## 6. Monitoring & Alerts

1. **Log-based metric** (detects Prisma P2021 on Admin backups)
   ```bash
   gcloud logging metrics create admin-backups-missing-table \
     --description="P2021 errors for AdminBackupJob" \
     --log-filter='resource.type="cloud_run_revision"
                   resource.labels.service_name="bh-backend-final"
                   severity>=ERROR
                   jsonPayload.context.code="P2021"
                   jsonPayload.context.table="AdminBackupJob"'
   ```
2. **Alerting policy**: fire after 3 occurrences within 5 minutes; route to on-call email/slack.
3. **Synthetic health**: add authenticated cron hitting `/admin/backups` hourly; if response != 200, send alert.
4. **Dashboard**: pin metric + request latency for `/admin/backups` in Cloud Monitoring.

## 7. QA Plan

| Layer | Steps |
| --- | --- |
| Unit | Extend `backend/src/__tests__/admin.service.test.ts` with cases for: empty table → empty array, missing table → fallback, new startup check happy-path/failure (mock Prisma). |
| Migration | On disposable DB: `env DATABASE_URL=postgres://... npm run db:reset --prefix backend` then `psql -c '\d "AdminBackupJob"'` to confirm schema; run `npx prisma migrate resolve --rolled-back ...` if rollback needed. |
| Integration (staging) | 1) Seed job via `triggerBackupJob`. 2) GET `/admin/backups` expecting array. 3) DELETE + RESTORE flows. 4) Settings toggle persists in `admin_audit_log`. |
| Load / regression | Hit `/admin/backups` 100 rps for 30s (`k6` or autocannon). Ensure <150ms p95 and no error logs. |
| Production validation | Tail logs for two release windows: `gcloud logging read 'resource.labels.service_name="bh-backend-final" severity>=ERROR textPayload:"AdminBackupJob"' --limit=20`. Confirm metric `admin-backups-missing-table` stays at 0; review Cloud Run request graph. |

## 8. Open Items

- [ ] Implement `scripts/seed-admin-backups.ts` for optional historical data.
- [ ] Wire new log-based metric into existing PagerDuty/Slack routing.
- [ ] Update runbook (`docs/gcp-access-and-deployment.md`) with the schema verification command sequence.


