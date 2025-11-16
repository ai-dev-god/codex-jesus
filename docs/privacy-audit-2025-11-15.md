# Privacy & User Isolation Audit — 15 Nov 2025

## Scope & Method
- Reviewed backend Express/Prisma service and selected workers for privacy, HIPAA, and GDPR posture.
- Focused on user-isolation controls, PHI handling (biomarkers, lab uploads, wearable tokens), audit logging, and data-subject rights.
- Inspected code paths, schemas, and configuration defaults; no production data was accessed.

## Architecture Snapshot
- Single-tenant Express API with JWT auth, Prisma ORM, Redis caching, and workers for AI insights/plan generation.
- PHI resides in PostgreSQL tables such as `BiomarkerLog`, `PanelUpload`, and `LongevityPlan`, plus object storage referenced via `storageKey`.
- LLM features depend on OpenRouter models (OpenAI 5, Gemini 2.5, Deepseek).

## Strengths
- Role-based guards (`requireAuth/requireRoles`) consistently applied across routers, and admin actions emit `AdminAuditLog` entries.
- Sensitive third-party refresh tokens are encrypted at rest (AES-256-GCM) before persisting.
- Consent tracking and onboarding enforce minimum required consents before promoting accounts to `ACTIVE`.

## 2025-11-16 Hardening Update
- Lab uploads now use signed GCS URLs with CMEK-backed AES-256 encryption headers plus an additional BioHax-managed AES-256-GCM sealing key that is rotated via `LAB_UPLOAD_SEALING_KEY`.
- Upload session metadata is persisted in `PanelUploadSession` rows to prevent tampering, and download URLs are issued through `PanelUploadDownloadToken` records for HIPAA-grade auditing.
- A background worker downloads, verifies, and re-encrypts artifacts before running AI-supervised ingestion with automated plan linking and report generation.

## Findings

### 1. Panel uploads exposed through permanent public URLs (Critical)
- `resolveDownloadUrl` directly concatenates `PANEL_UPLOAD_DOWNLOAD_BASE_URL` with the stored key and returns it to the client without signing, expiry, or access revocation.
- Anyone who learns the URL can fetch the underlying lab report indefinitely, bypassing auth and violating HIPAA/GDPR confidentiality rules and data-isolation expectations.
- **Remediation:** replace the static URL with time-bound signed URLs (GCS/S3) or proxy downloads through an authenticated backend handler that streams the file with strict authorization checks and download logging. Until implemented, block direct downloads to avoid further exposure.

### 2. Biomarker payloads transmitted to OpenRouter LLMs (Critical)
- The longevity-plan worker serializes raw biomarker measurements/logs plus lifestyle context and sends them to multiple OpenRouter-hosted models (planner, safety, numeric).
- OpenRouter does not provide a documented BAA, and GDPR processing terms appear absent, so transmitting PHI/PII upstream breaches HIPAA data-handling requirements and GDPR Article 28 constraints.
- **Remediation:** suspend plan generation in production until either (a) a covered entity / BAA is executed with each upstream model provider, or (b) the prompts are refactored to exclude PHI by pre-aggregating/anonymizing data locally. Document lawful bases and user consent for any continued processing.

### 3. Data-subject right-to-access/delete workflow incomplete (High)
- `requestDataExport` and `requestDataDeletion` only write audit records / toggle `deleteRequested`; no background job executes exports, erasures, or status updates to the requester.
- Without fulfillment, the platform cannot honor GDPR Articles 15/17 or HIPAA access/amendment timelines, creating legal exposure.
- **Remediation:** build queue-backed jobs that (1) assemble an export bundle covering all user-linked tables and (2) schedule verified deletions/anonymization with progress tracking, notifications, and safeguards against accidental loss. Until then, disable the self-service endpoints or ensure manual handling SLAs.

### 4. Production secrets fall back to insecure defaults (Medium)
- `AUTH_JWT_SECRET`, `AUTH_REFRESH_ENCRYPTION_KEY`, `WHOOP_TOKEN_ENCRYPTION_KEY`, and other credentials have baked-in defaults that will silently activate whenever environment variables are missing, even outside local dev.
- Weak, reused secrets undermine token integrity and wearable refresh-token encryption, breaching HIPAA Security Rule §164.312(a)(2)(i) (unique user identification) and GDPR Article 32 (confidentiality & integrity).
- **Remediation:** require explicit secrets in non-development modes (fail fast during boot), enforce minimum length/entropy, and rotate stored tokens after deploying the change.

## Recommended Next Steps
1. **Block or harden download endpoints immediately.** Ship signed URLs/proxy downloads, purge any previously issued public links, and rotate storage keys.
2. **Pause PHI uploads to OpenRouter until contractual controls exist.** Evaluate on-prem or BAA-backed LLM options and update consent notices.
3. **Implement automated DSAR fulfillment.** Track export/delete job states, notify users, and create admin dashboards for manual approval.
4. **Tighten configuration validation.** Make secrets mandatory outside `NODE_ENV=development`, add runtime checks, and document rotation cadence.
5. **Expand auditing.** Hash-chain or archive audit logs and include LLM prompt/response redaction to minimize PHI retention outside the primary datastore.

Addressing the two critical findings should be treated as a release blocker before handling additional product work.

