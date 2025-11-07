from __future__ import annotations

from pathlib import Path

from automation.paths import BACKLOG_FILE

from ..base import PromptSpec, load_prompt_text

PROMPT_PATH = Path(__file__).with_name("prompt.txt")


def get_prompt_spec() -> PromptSpec:
    template = load_prompt_text(PROMPT_PATH)
    return PromptSpec(
        number=4,
        name="Execution Kickoff & Tracking",
        template=template,
        deliverables=[BACKLOG_FILE],
        placeholder="<<<TASK ID AND SOURCE FILE (e.g., FE-01 from docs/tasks-frontend.md)>>>",
    )
