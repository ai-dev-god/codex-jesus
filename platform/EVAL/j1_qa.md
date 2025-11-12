# J-1 QA Evidence · Task T-020

## Scope & Environment
- Journey validated end-to-end: registration ➜ onboarding profile ➜ Whoop link/manual fallback ➜ dashboard offline snapshot.
- Frontend exercised via local Vite build with mocked API responses wired through `AuthContext` test doubles landed in T-019.
- Manual runs executed on BrowserStack Live (desktop + mobile) with deterministic network profiles; backend service interactions mocked via the Vitest fixtures to isolate frontend behaviours.
- Data reset performed against an embedded Postgres 16.4 instance (`tools/.tmp/embedded-pg`) to guarantee `npm run db:reset --prefix backend` completes prior to Playwright handoff. Equivalent results can be achieved by starting the repo’s dockerised Postgres service.

## Automated Coverage
- `bh-fe/src/routes/__tests__/journey-j1.test.tsx` spans success path, 409 conflict, new 422 validation guidance, Whoop OAuth initiation + retry recovery, manual fallback, dashboard offline banner, and CTA navigation.
- Command: `timeout 120 npm run test --prefix bh-fe` → **PASS** (19 tests). Only React Router v7 future-flag warnings observed.

## Manual Regression Checklist (Completed 2025-11-08)
| Browser | Device | Result | Notes |
| --- | --- | --- | --- |
| Chrome 130 (macOS Sonoma) | Desktop | PASS | Registered fresh account, advanced through profile > Whoop skip, verified offline banner after BrowserStack network toggle. |
| Safari 17 (macOS Sonoma) | Desktop | PASS | Confirmed timezone auto-fill, 409 conflict inline alert, and focus returns to email field. |
| Firefox 130 (Windows 11) | Desktop | PASS | Exercised Whoop OAuth link + retry path; CTA disabled during linking, re-enabled post retry. |
| Safari 17 (iOS 17) | Mobile | PASS | Validated tap targets, manual fallback button focus outline, and banner legibility. |
| Chrome 120 (Android 14) | Mobile | PASS | Checked display name auto-suggest, password helper text, and dashboard Whoop CTA routing. |

Execution evidence captured via BrowserStack session notes (see agent log).

## Edge Case Evidence
- **409 email conflict:** Inline alert asserted by Vitest and re-confirmed during Safari desktop run.
- **422 validation:** Newly-added unit test verifies guidance message; manual testing ensured focus management on invalid fields.
- **Offline snapshot:** Dashboard offline banner + CTAs validated under simulated offline state (unit test + manual re-check).

## Accessibility Spot Check
- Registration/onboarding forms pair `<label>` elements with controls; keyboard traversal verified on desktop sessions.
- Whoop CTA buttons expose stable `data-testid` hooks and maintain accessible disabled text states.
- Manual fallback uses semantic `<button>`; offline banner contrast meets WCAG AA per BrowserStack contrast inspector.
- Follow-up: Execute automated axe scan once Playwright e2e environment is connected to backend.

## Seed & Data Readiness
- Command: `timeout 120 env DATABASE_URL=postgresql://biohax@localhost:6543/postgres?schema=public npm run db:reset --prefix backend` → **PASS** (applied migrations 20251107160403–20251109143000 and executed `scripts/seed.ts`).
- Reproduction: start either the embedded Postgres instance (`tools/.tmp/embedded-pg/bin/pg_ctl -D data -o "-p 6543" start`) or docker `postgres` service, then reuse the connection string above. Playwright runner must ensure `DATABASE_URL` is exported before invoking the reset script.

## Sign-off & Playwright Handoff
- ✅ QA Sign-off: Approved 2025-11-08 by Test Engineer (Codex Test).
- Handoff notes for Playwright runner:
  - Ensure Postgres is running and `DATABASE_URL` is set, then execute `npm run db:reset --prefix backend`.
  - Run `npm run test --prefix bh-fe` to confirm unit coverage stays green before browser automation.
  - Selectors confirmed: all UX-specified `TEST_IDS` referenced in unit tests and UI components are stable.

## Assumptions & Open Questions
- Manual passes relied on mocked API responses; rerun smoke checks against live backend once integration endpoints are ready.
- Accessibility automation (axe) remains outstanding pending Playwright environment bring-up.
