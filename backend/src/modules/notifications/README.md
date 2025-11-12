# Notifications Module

## Overview
- Queue-based orchestration for insight alerts, streak nudges, moderation updates, onboarding welcomes, and community event announcements.
- Uses the `notifications-dispatch` Cloud Tasks queue with retry policy `{ maxAttempts: 5, minBackoffSeconds: 60, maxBackoffSeconds: 900 }`.
- Delivery channel is currently email via Resend; the worker renders HTML/text templates and records outcomes in `CloudTaskMetadata`.

## Rate Limits
| Notification Type | Window | Max in Window | Notes |
| --- | --- | --- | --- |
| Insight alert | 60 minutes | 3 | Prevents repeated nudges when insights are retried. |
| Streak nudge | 120 minutes | 2 | Guards against duplicate coach-triggered reminders. |
| Moderation notice | 24 hours | 5 | Keeps ops alerts actionable without flooding inboxes. |
| Onboarding welcome | 24 hours | 1 | Retries allowed after failure; avoids duplicate welcomes. |
| Community event | 24 hours | 4 | Keeps reminder cadence tight for cohort launches. |

## Resend Integration
- `RESEND_API_KEY` enables live delivery via the official SDK.
- When unset (local/dev), the module falls back to a console-logged stub so tests and worker runs succeed without external calls; this behaviour is intentional and should be left in place for CI.
- Templates live in `templates.ts` with matching Jest coverage; update both HTML and plaintext variants when modifying content.

## Dead-Letter Handling
- The worker logs failures, increments attempt counts, and invokes `observability-ops/alerting.notify('notifications.dead_letter', …)` when retry budgets are exhausted.
- Extend the alert hook to integrate with real paging systems once observability work is prioritised.
