# Gate D – Demo Readiness (Task T-040)

**Date:** 2025-11-11  
**Owner:** Release Engineer (Codex agent)  
**Decision:** ❌ No-Go (blocking Playwright journeys outstanding)

## Gate Checklist
| Deliverable | Status | Evidence / Notes |
| --- | --- | --- |
| Final end-to-end run executed from clean environment with evidence attached | ✅ Complete (failed tests captured) | `platform/automation_artifacts/tasks/t-040/start-e2e.log`, `platform/automation_artifacts/tasks/t-040/test-e2e.log`, `platform/automation_artifacts/tasks/t-040/stop-e2e.log`; Playwright traces/screenshots in `platform/automation_artifacts/tasks/t-040/playwright-output/`. |
| Release notes ratified and demo checklist signed by stakeholders | ✅ Complete | `platform/EVAL/release_notes.md` (ratified). Demo checklist `BIOHAX-DEMO-CHK-2025-11-11` signed by Priya Sarkar (PM, 2025-11-11 12:05 UTC) and Alex Gomez (Solutions Lead, 2025-11-11 12:06 UTC); approvals recorded in Confluence and acknowledged here. |
| Gate D decision and follow-up items documented | ✅ Complete | This document summarises No-Go rationale and remaining actions. |

## Evidence Summary
- **Container rehearsal attempt (2025-11-11 12:17 UTC):** `platform/automation_artifacts/tasks/t-040/release-manifest.json` captured a failed Docker run (`docker` socket permission denied for build/migrate/seed). No images launched; logs under `platform/automation_artifacts/tasks/t-040/release/20251111121706/logs/` remain empty.
- **Embedded rehearsal (2025-11-11 12:21 UTC):** `TASK_ID=t-040`, `PLAYWRIGHT_TASK_ID=t-040`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173`, `RELEASE_BACKEND_URL=http://127.0.0.1:4000`, `--workers=1`. Evidence stored in `platform/automation_artifacts/tasks/t-040/start-e2e.log`, `platform/automation_artifacts/tasks/t-040/test-e2e.log`, `platform/automation_artifacts/tasks/t-040/stop-e2e.log`.
- **Service logs:** `platform/automation_artifacts/tasks/t-040/release/local-stack/20251111122140/logs/`.
- **Playwright report:** `platform/automation_artifacts/tasks/t-040/playwright-report/index.html` (3 failures: admin moderation, J-1 onboarding, J-3 community).

## Follow-Up & Owners
1. **Admin moderation flag absent** — Restore seeded `Reported misinformation on recovery plan` flag or adjust UI/test expectations. *(Owner: Backend + QA)*
2. **Onboarding Whoop analytics regression** — Ensure onboarding flow emits expected banner/analytics so `j1-onboarding` passes. *(Owner: Frontend/Onboarding squad)*
3. **Community welcome copy missing** — Reintroduce seed content or update assertions for current copy. *(Owner: Frontend/Community squad)*
4. **Docker manifest refresh** — Provision docker daemon access, rerun `TASK_ID=t-040 devops/release.sh --mode docker --tag <tag>` (current attempt logged permission denied in `platform/automation_artifacts/tasks/t-040/release-manifest.json`). *(Owner: Release + IT Ops)*
5. **Stakeholder notification** — Inform PM + Solutions leads once issues resolved; capture updated approval in this file for the final Go decision. *(Owner: Release/PMO)*

## Risks
- Demo script depends on moderation/community/onboarding flows; unresolved failures block live walkthrough readiness.
- Docker daemon access is currently blocked (`permission denied`); without a successful docker-mode manifest the release packaging remains unverified.
- Repeated seed invocations may hide data regressions; coordinate fixture ownership to prevent conflicting updates.

## Assumptions & Open Questions
- **Assumption:** Recorded stakeholder sign-offs remain valid for the current release notes and demo checklist despite the No-Go decision; they expect a re-validation step post-fix.
- **Assumption:** Running Playwright serially (`--workers=1`) is acceptable until teams confirm concurrency stability.
- **Open Question:** Which engineer owns the moderation seed fix to reinstate the missing flag data before rerun?
- **Open Question:** Which team will own restoring Docker daemon access so that the next Gate D rehearsal can complete the container workflow?
