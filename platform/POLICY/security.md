# Security & Compliance Policy

## Secret Storage and Rotation
- Store all runtime secrets (API keys, OAuth credentials, database passwords) only in environment files or the approved secret manager documented by DevOps; never commit live credentials to version control.
- Rotate OAuth client credentials at least every 90 days, immediately after off-boarding an integration partner, and after any suspected compromise. Record rotation dates in the shared security register and distribute new secrets through the secret manager.
- When rotating OAuth credentials, update dependent services within 24 hours and monitor for authentication errors to confirm successful rollout.

## Audit Logging
- Backend services must emit structured audit logs for all administrative actions, authentication flows, and configuration changes.
- Retain audit logs for a minimum of 12 months in encrypted storage with access limited to the security and compliance team.
- Implement log integrity monitoring (hashing or append-only storage) and review audit log health weekly; open an incident if gaps exceed 15 minutes.

## Automated Scanning Requirements
- Dependency audits: ensure `npm audit --prefix backend` runs on every pull request and blocks merges on high or critical vulnerabilities. Track remediation SLAs (24 hours for critical, 7 days for high).
- Linting and code safety: keep `npm run lint --prefix backend` in CI; treat lint failures as build blockers, and add unit test coverage for fixes where feasible.
- Secret scanning: add `detect-secrets scan` to the CI pipeline with a maintained baseline file (commit the generated `.secrets.baseline` and review updates during code review). Investigate all new findings before merge.
- License compliance: schedule a weekly job to run `npx --yes license-checker@latest --production --summary` for the backend, export results to the compliance dashboard, and flag any non-permissive licenses for legal review.
- Document remediation steps for each failed scan in the task tracker and link back to the relevant CI run.

## Incident Response Tie-ins
- Report unresolved scan failures or overdue dependency patches to the Security task queue (owner: Security) and escalate blockers during Gate C reviews.
- Coordinate with DevOps to ensure secret storage, rotation automation, and scanning jobs remain functional after infrastructure changes.
