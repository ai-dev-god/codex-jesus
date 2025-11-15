## Main Branch Maintenance Workflow

### Daily Habit Checklist
- Pull latest main before you start: `git fetch origin && git checkout main && git pull --ff-only origin main`.
- Branch off main for any work: `git switch -c feature/<ticket>`.
- Keep main clean: commits happen on feature branches only; merge or fast-forward onto main after reviews.
- Push main immediately after merging so `origin/main` never lags.

### Automation Script
Use `devops/maintain-main.sh` to codify the fetch → fast-forward → CI → push loop.

```
CI_COMMAND="(cd backend && npm run lint && npm run test)" \
/Users/aurel/codex-jesus/devops/maintain-main.sh
```

The script enforces:
- Clean working tree before and after CI (prevents accidental commits on `main`).
- Fast-forward–only pulls from `origin/main`.
- CI success prior to pushing.
- No-op push when local and remote commits already match.

Key environment variables:
- `REPO_DIR` (default `/Users/aurel/codex-jesus`)
- `MAIN_BRANCH` (default `main`)
- `REMOTE_NAME` (default `origin`)
- `CI_COMMAND` (**required**) shell snippet that runs your full CI/test suite.

### Scheduling with MCP or Cron
- MCP job descriptor: `platform/automation/mcp_jobs/maintain-main.json`
  - Runs daily at 03:00, shells into zsh, exports the CI command, and executes `devops/maintain-main.sh`.
  - Update `command` or `schedule` to match your infra, then register the file with your MCP scheduler (e.g., `mcpctl jobs apply platform/automation/mcp_jobs/maintain-main.json`).
- Cron fallback: `devops/cron/maintain-main.crontab`
  - Install via `crontab devops/cron/maintain-main.crontab`.
  - Logs append to `devops/maintain-main.log` so failures show up alongside MCP logs.
- In both cases, MCP/cron will surface failures whenever the repo is dirty, the pull cannot fast-forward, or CI fails—no pushes occur until you resolve the issue on a feature branch.

### Manual Merge Example
```
git fetch origin
git checkout main
git pull --ff-only origin main
git switch -c feature/add-ci-script
# ... work, commit, push feature branch ...
git switch main
git pull --ff-only origin main
git merge --ff-only feature/add-ci-script
CI_COMMAND="(cd backend && npm run lint && npm run test)" devops/maintain-main.sh
```

This keeps `origin/main` aligned with the reviewed commits while guaranteeing CI coverage before every push.

