# Codex Team Operating Guide

## Workstation & Tooling
- **Repo root** is the working directory for every command.
- Use the **Codex CLI** (`codex exec`) for all agent runs; Codex cloud tasks are represented by the CLI’s sandboxed executions. We do not call the public OpenAI API in this project.
- Local commands must avoid long-running foreground servers. Prefer scripted entry points when available.
- MCP (Model Context Protocol) tools are optional; introduce them only when a task explicitly requires external capabilities.
- Full-stack test runs must use `devops/start-e2e.sh` and `devops/stop-e2e.sh`; never leave Playwright servers running in the foreground.
- Run the orchestrator via `python platform/automation/workflow.py --workspace .` (add extra flags as needed).
- Reset generated artifacts with `./platform/scripts/reset_workspace.sh` before a fresh run if needed.

## Build & Validation Commands
- **Frontend install:** `cd bh-fe && npm install`
- **Frontend dev:** `cd bh-fe && npm run dev` (Vite on port 5173).
- **Frontend tests:** `cd bh-fe && npm run test:e2e` (Playwright smoke run; ensure backend is running first).
- **Frontend deploy QA:** Follow `docs/frontend-deploy-checklist.md` (Figma parity review + deploy commands) before shipping.
- **Backend install:** `# TODO` backend service is not scaffolded yet.
- **Repo lint/tests:** Define per service once implemented; record in this guide as they appear.
- **End-to-end:** `devops/start-e2e.sh && npm run test:e2e --prefix bh-fe && devops/stop-e2e.sh` (ensure `npm run db:reset --prefix backend` succeeds inside the start script).

## Directory Map
 - `platform/` — hub for all orchestration assets.
 - `platform/PROMPTS/` — canonical system prompts for each agent role.
 - `platform/ARTIFACTS/` — generated documents (PRD, architecture, research, UX, API specs, runbooks, etc.).
 - `platform/BACKLOG/backlog.json` — DAG describing work items and dependencies.
 - `platform/POLICY/` — security, compliance, and tooling policies (populate during Security agent tasks).
 - `platform/EVAL/` — grader configurations, historical scores, and QA evidence.
 - `platform/automation/` — orchestration code for running agents and enforcing gates.
 - `platform/automation_artifacts/` — conversation logs, transcripts, per-task reports, and workflow run logs.
 - `platform/web/` — local dashboard (`backend/` + `bh-fe/`) that visualises status, artifacts, conversations, and lets you talk to agents.
 - `docs/` — legacy MVP notes; keep immutable unless migrating content.

## Agent Responsibilities
- **Intake PM** produces structured PRD artifacts (`ARTIFACTS/prd.json`, optional `ARTIFACTS/prd.md`).
- **Researcher** prepares `ARTIFACTS/research.md` plus risk register JSON.
- **Solution Architect** delivers architecture brief (`ARTIFACTS/architecture.md`) and data model assets.
- **API Designer** emits interface specs (`ARTIFACTS/openapi.yaml` or equivalent).
- **UX Designer** captures flows in `ARTIFACTS/ux_flows.md` and `ARTIFACTS/route_map.json`.
- **Planner** generates the DAG in `BACKLOG/backlog.json`.
- **Scaffolder** owns repository setup (DevOps scripts, CI, baseline tests).
- **Module Developers** build features and unit coverage while applying UX-defined `data-testid` hooks.
- **Test Engineer** validates logic/selectors, seeds data via the documented reset command, and green-lights Playwright handoff.
- **Playwright Runner** brings up the full stack with the e2e scripts, runs `npm run test:e2e --prefix bh-fe`, and archives traces/screenshots.
- **Reviewer/Security/Perf/Release/Doc Writer/Meta-Grader** validate deliverables per UPDATE.md standards, writing results into `EVAL/` as needed.

Each agent writes outputs directly to the designated artifact paths and returns JSON conforming to its schema.

## Governance & Gates
- Follow Gate A–D sequencing from UPDATE.md:
  - Gate A (docs complete) — verify PRD, research, architecture, API, UX delivered.
  - Gate B (scaffold ready) — lint/test skeletons exist and pass.
  - Gate C (feature quality) — tests green, reviewer approval, security/perf checks clear.
  - Gate D (demo ready) — end-to-end tests and packaging finished.
- When a gate fails, document blocking issues in `EVAL/` and re-queue tasks in the backlog DAG.

## Security & Compliance
- Store secrets in `.env` files only; never commit real credentials.
- Security agent must populate `POLICY/security.md` with scanning rules and confirm dependency audits.
- Do not introduce third-party services without updating this guide and relevant policies.

## Documentation Standards
- Structured JSON outputs must be valid and machine-readable.
- Markdown docs should be concise, actionable, and reference actual scripts; mark missing assets as `Placeholder — to be implemented (owner)`.
- Update this file whenever commands, directories, or team conventions change.
