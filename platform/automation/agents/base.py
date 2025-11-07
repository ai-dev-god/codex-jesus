from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Sequence

from automation.paths import PROMPTS_DIR


@dataclass(frozen=True)
class PromptSpec:
    number: int
    name: str
    template: str
    deliverables: Sequence[Path]
    placeholder: Optional[str] = None


def load_prompt_text(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(f"Prompt template not found: {path}")
    text = path.read_text(encoding="utf-8").strip()
    guardrails_path = PROMPTS_DIR / "global_guardrails.md"
    guardrails = ""
    if guardrails_path.exists():
        guardrails = guardrails_path.read_text(encoding="utf-8").strip()
    return text.replace("{{GUARDRAILS}}", guardrails)
