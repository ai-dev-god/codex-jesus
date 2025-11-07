from __future__ import annotations

from pathlib import Path

from automation.paths import (
    DEVOPS_LOGS_SCRIPT,
    DEVOPS_START_SCRIPT,
    DEVOPS_STOP_SCRIPT,
    DOCKER_COMPOSE_DEV_FILE,
    FRONTEND_PACKAGE_JSON,
    BACKEND_PACKAGE_JSON,
    ENV_EXAMPLE_FILE,
)

from ..base import PromptSpec, load_prompt_text

PROMPT_PATH = Path(__file__).with_name("prompt.txt")


def get_prompt_spec() -> PromptSpec:
    template = load_prompt_text(PROMPT_PATH)
    return PromptSpec(
        number=0,
        name="DevOps Bootstrap",
        template=template,
        deliverables=[
            DOCKER_COMPOSE_DEV_FILE,
            DEVOPS_START_SCRIPT,
            DEVOPS_STOP_SCRIPT,
            DEVOPS_LOGS_SCRIPT,
            ENV_EXAMPLE_FILE,
            FRONTEND_PACKAGE_JSON,
            BACKEND_PACKAGE_JSON,
        ],
    )
