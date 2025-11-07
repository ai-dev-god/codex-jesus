from __future__ import annotations

from pathlib import Path

from automation.paths import ROADMAP_FILE

from ..base import PromptSpec, load_prompt_text

PROMPT_PATH = Path(__file__).with_name("prompt.txt")


def get_prompt_spec() -> PromptSpec:
    template = load_prompt_text(PROMPT_PATH)
    return PromptSpec(
        number=2,
        name="Milestone Roadmap",
        template=template,
        deliverables=[ROADMAP_FILE],
    )
