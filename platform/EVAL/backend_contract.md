# Backend Contract Test Evidence — Task T-034

## Executed Commands
- `timeout 300 npm run test --prefix backend` → **PASS**
  - Runs jest across unit + integration suites (new contract tests under `backend/tests/integration`). Embedded Postgres auto-started (`tools/.tmp/t024-pg` @ `127.0.0.1:6543`), database reset between cases via `npm run db:reset`.
- `timeout 180 npm run lint --prefix backend` → **FAIL**
  - Existing ESLint violations (unused vars in legacy unit tests, `any` usage in workers, unused constant in `notify.ts`). No fixes applied within this task.

## Observations
- OpenAPI spec requires nullable adjustments for dashboard metrics (e.g., `sleepScore`), currently patched in the validator helper; coordinate with API Designer to update `platform/ARTIFACTS/openapi.yaml` or service output.
- `platform/EVAL/reports/` referenced in task inputs does not exist; evidence stored here pending guidance on new location.
