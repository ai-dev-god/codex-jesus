from __future__ import annotations

from pathlib import Path
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .runner import CodexRunResult


class WorkflowError(RuntimeError):
    """Raised when the workflow cannot proceed."""


class InvalidAgentResponseError(WorkflowError):
    """Raised when an agent output cannot be parsed as JSON."""

    def __init__(self, *, role: str, path: Path, raw: str) -> None:
        preview = raw.strip().replace("\n", " ")
        if len(preview) > 240:
            preview = preview[:240].rstrip() + "..."
        super().__init__(f"{role} output is not valid JSON. Preview: {preview}")
        self.role = role
        self.path = path
        self.raw = raw
        self.result: Optional["CodexRunResult"] = None
