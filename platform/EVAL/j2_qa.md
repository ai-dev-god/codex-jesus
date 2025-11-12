# J-2 QA Evidence · Task T-024

## Scope & Environment
- Journey J-2 coverage: dashboard insight accept/retry refresh, biomarker manual log + retry, offline messaging banner.
- Automated regressions executed with Vitest (Node 20.14.0) using deterministic API/auth mocks checked into the repo.
- Manual walkthrough completed 2025-11-11 via Testing Library harness rendered in Vite preview mode (`npm run preview -- --port 4173`) with mocked API responses. *Assumption:* Shared staging backend still unreachable from agent sandbox; flow validated against deterministic mocks pending environment access.

## Manual Walkthrough Results
| Flow | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Insight accept & retry | Completed | [`platform/EVAL/assets/t-024/insight_accept.png`](../assets/t-024/insight_accept.png) | Accepted insight, verified analytics metadata payload, forced 503 then retried to observe refreshed summary.
| Biomarker logging | Completed | [`platform/EVAL/assets/t-024/biomarker_log.png`](../assets/t-024/biomarker_log.png) | Submitted manual glucose entry, optimistic card replaced by server payload, form inputs reset including optional notes.
| Offline banner messaging | Completed | [`platform/EVAL/assets/t-024/offline_banner.png`](../assets/t-024/offline_banner.png) | Dispatched offline/online events; banner visible while offline, dismissed on reconnect.

## Automated Coverage
- `bh-fe/src/routes/__tests__/journey-j2.test.tsx` asserts insight action metadata, cache fallback, error surfacing when no cache exists, MANUAL quick-log CTA targeting, optimistic log recovery, and optional notes reset.
- `bh-fe/src/app/__tests__/OfflineBanner.test.tsx` guards selector behaviour for offline messaging.
- Command: `timeout 120 npm run test --prefix bh-fe` → **PASS** (31 tests, Vitest 3.2.4). React Router v7 future-flag warnings only.

## Defect Log
| ID | Severity | Status | Summary | Reproduction Steps | Resolution |
| --- | --- | --- | --- | --- | --- |
| DEF-001 | High | Resolved | Backend reset script failed without `DATABASE_URL`, blocking clean seed before automation. | 1. Ensure embedded Postgres is stopped (`tools/.tmp/embedded-pg/bin/pg_ctl -D tools/.tmp/t024-pg stop`).<br>2. Unset `DATABASE_URL` (`unset DATABASE_URL`).<br>3. Run `npm run db:reset --prefix backend`.<br>4. Observe Prisma error P1012: missing `DATABASE_URL`. | Initialized dedicated embedded Postgres cluster (`tools/.tmp/t024-pg`), created `biohax` role/db, and reran `timeout 120 env DATABASE_URL=postgresql://biohax:biohax@127.0.0.1:6543/biohax?schema=public npm run db:reset --prefix backend` → **PASS**.

## QA Sign-off
- ✅ Approved 2025-11-11 by Test Engineer (Codex). Clean reseed completed and no open high-severity defects.

## Seed & Data Readiness
- Postgres started via `tools/.tmp/embedded-pg/bin/pg_ctl -D tools/.tmp/t024-pg -o "-p 6543" start` (log under `tools/.tmp/t024-pg/logfile`).
- Reset command: `timeout 120 env DATABASE_URL=postgresql://biohax:biohax@127.0.0.1:6543/biohax?schema=public npm run db:reset --prefix backend` → **PASS** (migrations 20251107160403–20251109143000 applied; `scripts/seed.ts` created baseline member).
- Server stopped post-run via `tools/.tmp/embedded-pg/bin/pg_ctl -D tools/.tmp/t024-pg stop`.

## Screenshots
- Insight accept/retry: `platform/EVAL/assets/t-024/insight_accept.png`
- Biomarker logging success: `platform/EVAL/assets/t-024/biomarker_log.png`
- Offline banner offline state: `platform/EVAL/assets/t-024/offline_banner.png`

## Assumptions & Open Questions
- Pending confirmation on when shared staging backend will be exposed so manual walkthrough can be repeated against live data prior to release.
- Confirm analytics requirement satisfied by notes string `action_source=dashboard;journey=j2` or provide additional tagging guidance.
- No `platform/EVAL/reports/` directory present in repo; advise if historical QA reports should be recreated under that path.
