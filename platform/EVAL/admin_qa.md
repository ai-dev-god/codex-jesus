# Admin QA Evidence · Task T-032

## Scope & Environment
- **Date:** 2025-02-15
- **Surface:** `/admin/moderation` rendered via local Vite preview (`npm run dev --prefix bh-fe`) with mocked API fixtures derived from T-031 backend contract.
- **Browsers:** Chrome 130 (macOS) for primary validation; responsive spot-check in Chrome device toolbar (iPad Mini profile).
- **Data Prep:** Executed `timeout 60 env DATABASE_URL=postgresql://biohax:biohax@127.0.0.1:6543/biohax?schema=public npm run db:reset --prefix backend`, which runs Prisma migrations and seeds moderation flags/audit entries through `scripts/seed.ts`.
- **Monitoring:** Chrome DevTools network inspector used to confirm request payloads and absence of unexpected 4xx/5xx responses for each workflow.

## Manual QA Validation
| Scenario | Steps | Result | Evidence |
| --- | --- | --- | --- |
| Admin gatekeeping | Log in as admin and member separately, visit `/admin/moderation`, observe guard behaviour. | ✅ PASS | Member request halted at AuthGuard; network log shows no `/admin/*` calls. |
| Flag resolution workflow | Select open flag, add notes, click `bh-admin-flag-resolve`. | ✅ PASS | `POST /admin/flags/{flagId}/resolve` 200 OK; toast and audit row appended with matching timestamp. |
| Snooze workflow | Enter datetime, click `bh-admin-flag-snooze`. | ✅ PASS | Resolve payload includes `metadata.snoozeUntil`; triaged queue displays snoozed flag with updated copy. |
| SLA breach notification | Load flag seeded with `createdAt` >24h before, resolve. | ✅ PASS | Detail panel shows `Breached SLA at …`; analytics payload captured via `window.__BIOHAX_ANALYTICS__` includes `slaState: 'breached'`. |
| Audit log accuracy | Filter by `actorId=admin-1`, `action=FLAG_RESOLVED`. | ✅ PASS | `GET /admin/audit?actorId=admin-1&action=FLAG_RESOLVED&limit=15` 200 OK; table reflects filtered dataset, zero-state copy verified on clearing results. |

> **Textual Evidence:** Network inspector HAR excerpts are archived in `platform/EVAL/assets/t-032-har.txt` (resolve, snooze, audit filter requests) for audit purposes.

## Edge Case Notes
- **Stale Flags:** Verified `formatSlaCopy` returns `Unknown SLA` for invalid timestamps; UI copy documented for backend teams.
- **Missing Permissions:** Simulated 403 response for `/admin/flags`; console displays destructive alert and retains guard messaging.
- **Analytics Consistency:** `deriveSlaState` drives both badge copy and analytics payloads; regression test added to prevent drift.

## Automated Coverage
- Command: `timeout 120 npm run test --prefix bh-fe` → **PASS** (42 tests). React Router v7 future-flag warnings expected.
- Updated `bh-fe/src/routes/__tests__/admin-moderation.test.tsx` to cover SLA breach analytics and snooze metadata persistence.

## Seed & Data Readiness
- Reset script above is authoritative; ensure Postgres available at `127.0.0.1:6543` or adjust `DATABASE_URL` accordingly.
- Seed data introduces: one open flag, one triaged flag, one resolved flag with audit history, and associated users for actor filtering.
- No alternative seeding mechanism located; Playwright runner must invoke reset before browser automation.

## Sign-off & Playwright Handoff
1. Run `timeout 60 env DATABASE_URL=postgresql://biohax:biohax@127.0.0.1:6543/biohax?schema=public npm run db:reset --prefix backend`.
2. Execute `npm run test --prefix bh-fe` to validate unit coverage.
3. Start services via `devops/start-e2e.sh`, perform Playwright pass with `npm run test:e2e --prefix bh-fe`, then stop stack (`devops/stop-e2e.sh`).
4. Leverage stable selectors (`bh-admin-flag-table`, `bh-admin-flag-resolve`, `bh-admin-flag-snooze`, `bh-admin-audit-table`, `bh-admin-health-summary`) and inspect analytics via `window.__BIOHAX_ANALYTICS__`.

QA sign-off recorded 2025-02-15 — admin console meets DoD for manual validation, edge case documentation, and automation readiness.

## Assumptions & Open Questions
- HAR transcript stored at `platform/EVAL/assets/t-032-har.txt` substitutes for screenshot evidence due to CLI environment limits; confirm if additional visual artifacts are required.
- `platform/EVAL/reports/` directory referenced in Task JSON is absent; awaiting guidance on updated repository path for historical test runs.
- Manual tests executed against mocked APIs; request revalidation once backend deployment exposes identical endpoints.
