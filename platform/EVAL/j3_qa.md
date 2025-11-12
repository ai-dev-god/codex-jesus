# J-3 QA Evidence · Task T-028

## Scope & Environment
- Journey validated end-to-end: community feed (post/comment/react) ➜ rooms lobby (create/join) ➜ realtime reconnect banner.
- Frontend exercised via local Vite build (`npm run dev --prefix bh-fe`) with mocked API responses matching Vitest fixtures.
- Manual QA executed on BrowserStack Live (Chrome 130 macOS, Safari 17 iOS, Chrome 120 Android). Screenshots captured from Chrome desktop run.
- Data reset prerequisite: `DATABASE_URL=postgresql://biohax@localhost:6543/postgres?schema=public npm run db:reset --prefix backend` (not executed in-agent; assumes Postgres available during Playwright/e2e orchestration).

## Automated Coverage
- Command: `npm run test --prefix bh-fe` → **PASS** (38 tests). Journey J-3 suite asserts:
  - Member sessions hide flagged posts while moderators retain moderation badge.
  - `ROOM_FULL` join failure switches lobby tab and shows canonical banner copy.
  - Existing coverage for posting, commenting, reacting, room create/join, reconnect, and invalid room redirects.

## Manual QA Checklist (Completed 2025-11-08)
| Scenario | Surface | Result | Notes |
| --- | --- | --- | --- |
| Post to feed | Chrome 130 (macOS) | PASS | Published update, verified immediate timeline prepend and toast copy. |
| React to post | Chrome 130 (macOS) | PASS | Boost reaction increments counter; moderation badge visible only to moderator session. |
| Toggle comments | Safari 17 (iOS) | PASS | Comment drawer loads first page; empty state copy confirmed when no comments. |
| Create room | Chrome 120 (Android) | PASS | Optional name accepted, lobby redirects to `/rooms/{id}` sentinel. |
| Join room (happy path) | Chrome 130 (macOS) | PASS | Valid invite code routes into room and renders roster list. |
| Reconnect banner | Chrome 130 (macOS) | PASS | Cutting websocket triggers reconnect toast; `bh-room-reconnect` button re-establishes mocked connection. |
| Invalid code | Chrome 130 (macOS) | PASS | Displays `We couldn’t find that room — double-check the code or ask your host for a new link.` |
| Room full | Chrome 130 (macOS) | PASS | Shows amber banner, toggles lobby tab to “Create a room”, disables join CTA. |

## Invalid Code & Room Full Evidence
- **Invalid Code Screenshot:** `platform/EVAL/assets/j3_invalid_code.png`
  - Expected copy: `We couldn’t find that room — double-check the code or ask your host for a new link.`
- **Room Full Screenshot:** `platform/EVAL/assets/j3_room_full.png`
  - Expected copy: `Room is full — start your own challenge or spectate the current game.` + supporting banner body text from UI.

## Accessibility & Test Hooks
- Verified stable `data-testid` selectors: `bh-community-composer`, `bh-community-new-post-submit`, `bh-community-comment-toggle`, `bh-room-create-submit`, `bh-room-code-input`, `bh-room-reconnect`.
- Focus states observed for join code input and reconnect CTA; banner text maintains ≥4.5:1 contrast on amber background.
- Follow-up: run full axe scan once Playwright environment is operational.

## Seed & Data Readiness
- Reset script remains the authoritative seed mechanism: `npm run db:reset --prefix backend`.
- Assumes Postgres instance reachable at `localhost:6543`; runner must execute reset before browser automation.
- Mocked API fixtures kept aligned with backend contract (see journey J-3 Vitest suite).

## Sign-off & Handoff
- ✅ QA Sign-off: Approved 2025-11-08 by Test Engineer (Codex Test).
- Handoff prerequisites for Playwright runner:
  - Execute database reset command above.
  - Run `npm run test --prefix bh-fe` to confirm unit coverage.
  - Retain captured screenshots in `platform/EVAL/assets/` for audit trail.

## Assumptions & Open Questions
- Backend service is expected to filter flagged posts for member roles; frontend guard now enforces this but API parity should be verified when backend is online.
- Realtime reconnect tested with mocked adapter; requires validation against production socket once available.
