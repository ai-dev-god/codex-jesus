from __future__ import annotations

from pathlib import Path

from automation.paths import TELEGRAM_BASE_DIR

from ..base import PromptSpec, load_prompt_text

PROMPT_PATH = Path(__file__).with_name("prompt.txt")


def get_prompt_spec() -> PromptSpec:
    template = load_prompt_text(PROMPT_PATH)
    return PromptSpec(
        number=-1,
        name="Telegram Relay",
        template=template,
        deliverables=[TELEGRAM_BASE_DIR],
    )
