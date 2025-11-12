# Backend Threat Model

## Overview
Biohax backend is an Express + Prisma service that exposes REST APIs for the Biohax platform. The service relies on PostgreSQL (via Prisma), Redis for caching/queue operations, Resend for transactional email, and Google OAuth for user authentication. This document focuses on guarding authentication flows, third-party integrations, and administrator operations.

## Assets & Actors
- **End users** authenticate via Google OAuth and access personal biomarker data.
- **Administrators** manage community content, dashboards, notifications, and user flags through internal tools.
- **Integrations** include Google OAuth (id provider) and Resend (email delivery).
- **Stores**: PostgreSQL database (biomarkers, users, audit events) and Redis (queues, caching, job state).

## Trust Boundaries
1. Public internet ↔️ API Gateway/Express server.
2. API server ↔️ Google OAuth/Resend (third-party APIs).
3. API server ↔️ Redis and PostgreSQL.
4. Internal admin clients ↔️ admin REST endpoints.

## Authentication & Session Risks
| Threat | Impact | Existing / Required Mitigations |
| --- | --- | --- |
| Compromised OAuth client secrets | Attackers impersonate Biohax, obtain tokens | Store secrets in secret manager or `.env` files outside VCS; rotate every 90 days; monitor OAuth callback failures. |
| Stolen refresh tokens | Unauthorized access to user accounts | Persist tokens with encryption at rest; attach refresh tokens to specific device fingerprints; revoke on logout; implement short-lived access tokens. |
| OAuth intercept (MITM) | Session hijack | Enforce HTTPS/TLS 1.2+, set strict redirect URIs, use PKCE, validate `state` parameter, log all auth failures. |
| Brute force on admin credentials | Privilege escalation | Mandate SSO for admin accounts; require MFA via IdP and audit admin logins; enable account lockout on anomalous activity. |

## Integrations & External Services
- **Google OAuth:** Limit scopes to minimum (profile/email), rotate client credentials, verify `iss` and `aud` when processing ID tokens, log token verification failures.
- **Resend:** Scoped API keys stored in secret manager; restrict to transactional emails; monitor rate limits and bounce events.
- **Redis:** Authenticate with access key, enable TLS in production, segregate queues per environment, monitor queue length spikes.

## Administrative Surface
- Admin APIs enable dashboard metrics, community moderation, notification campaigns.
- Require role-based access control (`admin`, `analyst`, `support`) checked at every route.
- Capture audit logs for create/update/delete actions with actor, target resource, timestamp, IP.
- Perform quarterly access reviews; remove dormant admin accounts.

## Threat Scenarios & Mitigations
1. **Privilege escalation via stale JWT**  
   - Mitigation: Short token lifetime (≤15 min), refresh token revocation on password reset/offboarding, Redis session whitelist.
2. **Malicious notification payload injection**  
   - Mitigation: Validate notification templates against allow-listed tokens, sanitize HTML content, log template publish events.
3. **Data exfiltration through Prisma misconfiguration**  
   - Mitigation: Enable least-privilege DB user per environment, use parameterized queries via Prisma, enforce schema-based access.
4. **Queue poisoning in Redis**  
   - Mitigation: Restrict network access with security groups, require AUTH, monitor for unexpected job types, implement dead-letter queues.
5. **CI secrets leakage**  
   - Mitigation: Use per-environment secrets in GitHub Actions, limit log verbosity, run `detect-secrets` with baseline to block exposures.

## Logging & Monitoring
- Aggregate audit logs and application logs centrally with retention ≥12 months (per security policy).
- Alert on anomalous admin actions, repeated OAuth failures, and Redis connection spikes.
- Implement integrity checks for audit logs (hash chain or append-only storage).

## Assumptions & Open Questions
- **Assumption:** All production deployments terminate TLS at a managed load balancer with modern ciphers.
- **Open Question:** Which squad owns quarterly review of audit logs and admin access (Security vs. Platform)?
- **Open Question:** Does DevOps provide automated Redis TLS certificates, or must the backend team manage them?
