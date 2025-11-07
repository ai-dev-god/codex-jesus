from __future__ import annotations

from pathlib import Path
from typing import Optional

from ..base import load_prompt_text

PROMPT_PATH = Path(__file__).with_name("prompt.txt")
BASE_PROMPT = load_prompt_text(PROMPT_PATH)


def build_prompt(
    *,
    task_id: str,
    task_source: Path,
    tracker_path: Optional[Path],
    report_path: Path,
    task_dir: Path,
    workspace: Path,
    agent_prompt: str,
    context_notes: Optional[str] = None,
) -> str:
    artifacts_dir = task_dir
    if artifacts_dir.is_absolute():
        try:
            artifacts_dir = artifacts_dir.relative_to(workspace)
        except ValueError:
            pass

    parts = [
        BASE_PROMPT,
        f"Task ID: {task_id}",
        f"Task definition source: {task_source}",
        f"Agent report: {report_path}",
        f"Task artifact directory: {artifacts_dir}",
        "Available context:\n"
        f"{agent_prompt}",
        "Expectations:\n"
        "- Review the agent report for completeness and accuracy.\n"
        "- Review relevant code changes, paying attention to regressions, security, and edge cases.\n"
        "- Run any necessary tests or scripts (unit, integration, lint, etc.) to validate the work. "
        "Summarize the commands you executed and tie them to pass/fail outcomes.\n"
        "- Do not modify files; report issues for the implementation agent to resolve.",
    ]

    if tracker_path:
        parts.insert(3, f"Backlog tracker: {tracker_path}")

    if context_notes:
        parts.append(
            "Additional focus areas from management:\n"
            f"{context_notes}"
        )

    parts.append(
        "Respond ONLY with a JSON object using this schema:\n"
        '{"status":"pass|fail","issues":["<list of problems>"],"summary":"<short recap>","tests":["<test command and outcome>"]}'
    )

    return "\n\n".join(parts)
