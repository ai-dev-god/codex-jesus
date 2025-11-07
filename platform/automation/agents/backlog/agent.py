from __future__ import annotations

from pathlib import Path

from automation.paths import TASKS_BACKEND_FILE, TASKS_FRONTEND_FILE

from ..base import PromptSpec, load_prompt_text

PROMPT_PATH = Path(__file__).with_name("prompt.txt")


def get_prompt_spec() -> PromptSpec:
    template = load_prompt_text(PROMPT_PATH)
    return PromptSpec(
        number=3,
        name="Task Backlogs",
        template=template,
        deliverables=[
            TASKS_FRONTEND_FILE,
            TASKS_BACKEND_FILE,
        ],
    )
