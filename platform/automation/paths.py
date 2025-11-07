from __future__ import annotations

from pathlib import Path

BASE_DIR = Path("platform")
DOCUMENTATION_FILE = BASE_DIR / "ARTIFACTS" / "prd.md"
ROADMAP_FILE = BASE_DIR / "ARTIFACTS" / "roadmap.md"
RESEARCH_FILE = BASE_DIR / "ARTIFACTS" / "research.md"
RESEARCH_JSON_FILE = BASE_DIR / "ARTIFACTS" / "research.json"
ARCHITECTURE_FILE = BASE_DIR / "ARTIFACTS" / "architecture.md"
ARCHITECTURE_JSON_FILE = BASE_DIR / "ARTIFACTS" / "architecture.json"
TECH_CHOICES_FILE = BASE_DIR / "ARTIFACTS" / "tech_choices.json"
DATA_MODEL_FILE = BASE_DIR / "ARTIFACTS" / "data_model.json"
NON_FUNCTIONALS_FILE = BASE_DIR / "ARTIFACTS" / "non_functionals.json"
OPENAPI_FILE = BASE_DIR / "ARTIFACTS" / "openapi.yaml"
ERROR_CATALOG_FILE = BASE_DIR / "ARTIFACTS" / "error_catalog.json"
UX_FLOWS_FILE = BASE_DIR / "ARTIFACTS" / "ux_flows.md"
ROUTE_MAP_FILE = BASE_DIR / "ARTIFACTS" / "route_map.json"
PRD_JSON_FILE = BASE_DIR / "ARTIFACTS" / "prd.json"
BACKLOG_FILE = BASE_DIR / "BACKLOG" / "backlog.json"
PROJECT_IDEA_FILE = Path("docs/project-idea.md")
PROJECT_MANIFEST_FILE = BASE_DIR / "project.yaml"
DEVOPS_DIR = Path("devops")
DEVOPS_START_SCRIPT = DEVOPS_DIR / "start-dev.sh"
DEVOPS_STOP_SCRIPT = DEVOPS_DIR / "stop-dev.sh"
DEVOPS_LOGS_SCRIPT = DEVOPS_DIR / "logs.sh"
DEVOPS_START_E2E_SCRIPT = DEVOPS_DIR / "start-e2e.sh"
DEVOPS_STOP_E2E_SCRIPT = DEVOPS_DIR / "stop-e2e.sh"
DOCKER_COMPOSE_DEV_FILE = Path("docker-compose.dev.yml")
ENV_EXAMPLE_FILE = Path(".env.example")
FRONTEND_ROOT = Path("frontend")
BACKEND_ROOT = Path("backend")
FRONTEND_PACKAGE_JSON = FRONTEND_ROOT / "package.json"
BACKEND_PACKAGE_JSON = BACKEND_ROOT / "package.json"
BACKEND_DB_RESET_SCRIPT = BACKEND_ROOT / "scripts" / "db-reset.ts"
PLAYWRIGHT_RESULTS_DIR = Path("test-results") / "e2e"
TELEGRAM_BASE_DIR = BASE_DIR / "automation_artifacts" / "telegram"
SESSIONS_DIR = BASE_DIR / "automation_artifacts" / "sessions"
BUGS_DIR = BASE_DIR / "automation_artifacts" / "bugs"
FEEDBACK_DIR = BASE_DIR / "automation_artifacts" / "feedback"
PROMPTS_DIR = BASE_DIR / "PROMPTS"
ARTIFACTS_DIR = BASE_DIR / "ARTIFACTS"
EVAL_DIR = BASE_DIR / "EVAL"
POLICY_DIR = BASE_DIR / "POLICY"
AGENTS_GUIDE = BASE_DIR / "AGENTS.md"
API_MARKDOWN_FILE = BASE_DIR / "ARTIFACTS" / "api.md"
