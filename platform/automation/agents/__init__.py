from __future__ import annotations

from pathlib import Path
from typing import Dict, Iterable, List

from automation.paths import (
    API_MARKDOWN_FILE,
    ARCHITECTURE_FILE,
    ARCHITECTURE_JSON_FILE,
    BACKEND_PACKAGE_JSON,
    BACKLOG_FILE,
    DEVOPS_LOGS_SCRIPT,
    DEVOPS_START_SCRIPT,
    DEVOPS_STOP_SCRIPT,
    DEVOPS_START_E2E_SCRIPT,
    DEVOPS_STOP_E2E_SCRIPT,
    DOCUMENTATION_FILE,
    DOCKER_COMPOSE_DEV_FILE,
    ENV_EXAMPLE_FILE,
    FRONTEND_PACKAGE_JSON,
    OPENAPI_FILE,
    ERROR_CATALOG_FILE,
    PRD_JSON_FILE,
    PROMPTS_DIR,
    RESEARCH_FILE,
    RESEARCH_JSON_FILE,
    ROUTE_MAP_FILE,
    UX_FLOWS_FILE,
    AGENTS_GUIDE,
)
from .base import PromptSpec, load_prompt_text

# Optional artifact paths (created later in pipeline but tracked for completeness)
ARTIFACTS_WITHOUT_PRIMARY_PROMPTS: List[Path] = [AGENTS_GUIDE]


def _prompt_path(name: str) -> Path:
    return PROMPTS_DIR / f"{name}.md"


def _spec(
    *,
    number: int,
    name: str,
    prompt_key: str,
    deliverables: Iterable[Path],
    placeholder: str | None = None,
) -> PromptSpec:
    template = load_prompt_text(_prompt_path(prompt_key))
    return PromptSpec(
        number=number,
        name=name,
        template=template,
        deliverables=tuple(deliverables),
        placeholder=placeholder,
    )


PRIMARY_PROMPTS: List[PromptSpec] = [
    _spec(
        number=0,
        name="Intake PM",
        prompt_key="intake_pm",
        deliverables=[PRD_JSON_FILE, DOCUMENTATION_FILE],
        placeholder="<<<PROJECT_IDEA>>>",
    ),
    _spec(
        number=1,
        name="Researcher",
        prompt_key="researcher",
        deliverables=[RESEARCH_FILE, RESEARCH_JSON_FILE],
    ),
    _spec(
        number=2,
        name="Solution Architect",
        prompt_key="solution_architect",
        deliverables=[ARCHITECTURE_FILE, ARCHITECTURE_JSON_FILE],
    ),
    _spec(
        number=3,
        name="API Designer",
        prompt_key="api_designer",
        deliverables=[API_MARKDOWN_FILE, OPENAPI_FILE, ERROR_CATALOG_FILE],
    ),
    _spec(
        number=4,
        name="UX Designer",
        prompt_key="ux_designer",
        deliverables=[UX_FLOWS_FILE, ROUTE_MAP_FILE],
    ),
    _spec(
        number=5,
        name="Planner",
        prompt_key="planner",
        deliverables=[BACKLOG_FILE],
    ),
    _spec(
        number=6,
        name="Scaffolder",
        prompt_key="scaffolder",
        deliverables=[
            DEVOPS_START_SCRIPT,
            DEVOPS_STOP_SCRIPT,
            DEVOPS_START_E2E_SCRIPT,
            DEVOPS_STOP_E2E_SCRIPT,
            DEVOPS_LOGS_SCRIPT,
            DOCKER_COMPOSE_DEV_FILE,
            ENV_EXAMPLE_FILE,
            FRONTEND_PACKAGE_JSON,
            BACKEND_PACKAGE_JSON,
        ],
    ),
]

SUPPORTING_PROMPTS: Dict[str, PromptSpec] = {
    "module_developer": _spec(
        number=20,
        name="Module Developer",
        prompt_key="module_developer",
        deliverables=[],
        placeholder="<<<TASK_JSON>>>",
    ),
    "test_engineer": _spec(
        number=21,
        name="Test Engineer",
        prompt_key="test_engineer",
        deliverables=[],
        placeholder="<<<TASK_JSON>>>",
    ),
    "code_reviewer": _spec(
        number=22,
        name="Code Reviewer",
        prompt_key="code_reviewer",
        deliverables=[],
        placeholder="<<<TASK_JSON>>>",
    ),
    "security": _spec(
        number=23,
        name="Security & Compliance",
        prompt_key="security",
        deliverables=[],
        placeholder="<<<TASK_JSON>>>",
    ),
    "perf": _spec(
        number=24,
        name="Performance & Resilience",
        prompt_key="perf",
        deliverables=[],
        placeholder="<<<TASK_JSON>>>",
    ),
    "release": _spec(
        number=25,
        name="Release",
        prompt_key="release",
        deliverables=[],
        placeholder="<<<TASK_JSON>>>",
    ),
    "doc_writer": _spec(
        number=26,
        name="Documentation Writer",
        prompt_key="doc_writer",
        deliverables=[],
        placeholder="<<<TASK_JSON>>>",
    ),
    "meta_grader": _spec(
        number=27,
        name="Meta-Grader",
        prompt_key="meta_grader",
        deliverables=[],
        placeholder="<<<TASK_JSON>>>",
    ),
    "scaffolder_support": _spec(
        number=28,
        name="Scaffolder Support",
        prompt_key="scaffolder_support",
        deliverables=[],
        placeholder="<<<TASK_JSON>>>",
    ),
    "playwright_runner": _spec(
        number=29,
        name="Playwright Runner",
        prompt_key="playwright_runner",
        deliverables=[],
        placeholder="<<<TASK_JSON>>>",
    ),
    "bug_intake": _spec(
        number=30,
        name="Bug Intake",
        prompt_key="bug_intake",
        deliverables=[],
        placeholder="<<<BUG_REPORT>>>",
    ),
    "bug_triage": _spec(
        number=31,
        name="Bug Triage",
        prompt_key="bug_triage",
        deliverables=[],
        placeholder="<<<BUG_CONTEXT>>>",
    ),
    "bug_repro": _spec(
        number=32,
        name="Bug Reproduction",
        prompt_key="bug_repro",
        deliverables=[],
        placeholder="<<<BUG_CONTEXT>>>",
    ),
    "feedback_intake": _spec(
        number=33,
        name="Feedback Intake",
        prompt_key="feedback_intake",
        deliverables=[],
        placeholder="<<<FEEDBACK_REPORT>>>",
    ),
    "feedback_review": _spec(
        number=34,
        name="Feedback Review",
        prompt_key="feedback_review",
        deliverables=[],
        placeholder="<<<FEEDBACK_CONTEXT>>>",
    ),
    "feedback_plan": _spec(
        number=35,
        name="Feedback Planning",
        prompt_key="feedback_plan",
        deliverables=[],
        placeholder="<<<FEEDBACK_CONTEXT>>>",
    ),
}


def load_primary_prompt_specs() -> Iterable[PromptSpec]:
    """Return the ordered list of primary prompts for the base workflow."""
    return list(PRIMARY_PROMPTS)


def get_supporting_prompt(name: str) -> PromptSpec:
    if name not in SUPPORTING_PROMPTS:
        raise KeyError(f"Unknown supporting prompt: {name}")
    return SUPPORTING_PROMPTS[name]
