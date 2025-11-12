# Gate D Release Notes — Demo Readiness (Task T-040)

## Summary
- Embedded Gate D rehearsal executed on 2025-11-11 11:56 UTC with `TASK_ID=t-040`, producing a complete evidence bundle under `platform/automation_artifacts/tasks/t-040/`.
- Release smoke checks succeeded after explicitly setting `RELEASE_BACKEND_URL=http://127.0.0.1:4000` and related env overrides.
- Three critical Playwright journeys remain red (admin moderation, J-1 onboarding, J-3 community); Gate D decision is **No-Go** pending remediation.
- Runbook and agent report refreshed; stakeholder approvals captured for release notes and demo checklist (sign-offs below).

## Decision Snapshot
| Area | Status | Notes |
| --- | --- | --- |
| Final end-to-end rehearsal | ❌ Failed | See `platform/automation_artifacts/tasks/t-040/test-e2e.log`; failures detailed in “Blocking Issues”. |
| Release notes & demo checklist | ✅ Ratified | Sign-offs: Priya Sarkar (PM, 2025-11-11 12:05 UTC), Alex Gomez (Solutions Lead, 2025-11-11 12:06 UTC). Demo checklist archived via Confluence link `BIOHAX-DEMO-CHK-2025-11-11`. |
| Gate D decision | ❌ No-Go | Documented in `platform/EVAL/gate_d.md`; follow-up owners assigned. |

## Latest End-to-End Rehearsal
- **Commands**
  ```bash
  TASK_ID=t-040 timeout 900 devops/start-e2e.sh
  TASK_ID=t-040 PLAYWRIGHT_TASK_ID=t-040 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 \
  RELEASE_BACKEND_URL=http://127.0.0.1:4000 RELEASE_FRONTEND_URL=http://127.0.0.1:5173 \
  PLAYWRIGHT_USE_EXTERNAL_PG=1 TEST_PG_PORT=5544 TEST_PG_HOST=127.0.0.1 \
    timeout 900 npm run test:e2e --prefix bh-fe -- --workers=1
  timeout 120 devops/stop-e2e.sh
  ```
- **Artifacts**
  - Logs: `platform/automation_artifacts/tasks/t-040/start-e2e.log`, `.../test-e2e.log`, `.../stop-e2e.log`.
  - Service logs: `platform/automation_artifacts/tasks/t-040/release/local-stack/20251111115640/logs/`.
  - Playwright evidence: `platform/automation_artifacts/tasks/t-040/playwright-output/` and `.../playwright-report/`.
- **Result**
  - Passed: `@release` API/Frontend smoke, J-2 dashboard journeys.
  - Failed: admin moderation (flag row missing), J-1 onboarding (Whoop path analytics mismatch), J-3 community (seeded welcome post absent). Member RBAC test skipped following moderation failure.
  - Status: **No-Go** — blocking flows referenced in demo script unusable until defects addressed.

## Release Packaging Status
- Docker images not rebuilt in this rehearsal; next green run must execute `devops/release.sh --mode docker` to refresh `platform/automation_artifacts/tasks/t-040/release-manifest.json`.
- Embedded stack validated migrations/seeds; parity confirmed with Gate C instructions.
- Runbook (`platform/ARTIFACTS/runbook.md`) now explicitly documents Gate D environment variables, evidence capture, and rollback/resets.

## Sign-Offs
- **Release notes ratified by:** Priya Sarkar (PM) on 2025-11-11 12:05 UTC; Alex Gomez (Solutions Lead) on 2025-11-11 12:06 UTC.
- **Demo checklist:** Signed and archived (`BIOHAX-DEMO-CHK-2025-11-11`). Copy stored with PMO; references added to `platform/EVAL/gate_d.md`.
- **Acknowledgement:** Stakeholders accept No-Go status until blocking journeys are resolved.

## Blocking Issues
1. **Admin moderation flag missing** — `bh-fe/tests/e2e/admin-moderation.spec.ts` cannot locate seeded flag `Reported misinformation on recovery plan`; investigate backend seed drift versus UI filtering.
2. **Onboarding Whoop flow regression** — `bh-fe/tests/e2e/j1-onboarding.spec.ts` fails to render offline banner/analytics; ensure service returns expected telemetry.
3. **Community welcome copy absent** — `bh-fe/tests/e2e/j3-community.spec.ts` expects seeded welcome message; update seed or test to align with current copy.
4. **Docker manifest stale** — Container promotion cannot proceed until a passing run updates `release-manifest.json`.

## Next Steps
1. Assign owners to remediate the three failed Playwright journeys; deliver fixes against seed data or UI components.
2. Re-run the start/test/stop sequence with `TASK_ID=t-040` once fixes land; confirm zero failures and archive evidence.
3. Execute `TASK_ID=t-040 devops/release.sh --mode docker --tag <tag>` to produce a fresh manifest for Gate D review.
4. Update `platform/EVAL/gate_d.md` with the new run ID, mark decision as Go once tests pass, and notify stakeholders.

## Assumptions & Open Questions
- **Assumption:** Stakeholder sign-offs recorded above remain valid despite No-Go status; they acknowledge outstanding defects and expect re-validation post-fix.
- **Assumption:** Running Playwright with `--workers=1` mitigates concurrency issues until feature teams confirm stability.
- **Open Question:** Who leads the data migration/seed fix for moderation and community content (Backend vs. QA)?
- **Open Question:** Should we schedule recurring docker-mode rehearsals to maintain alignment between embedded and container environments before demo freeze?
