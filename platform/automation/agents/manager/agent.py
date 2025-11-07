from __future__ import annotations

from pathlib import Path
from typing import Optional, Sequence

from ..base import load_prompt_text

PROMPT_PATH = Path(__file__).with_name("prompt.txt")
BASE_PROMPT = load_prompt_text(PROMPT_PATH)


def build_prompt(
    *,
    deliverables: Sequence[Path],
    original_instructions: str,
    execution_focus: bool,
    devops_focus: bool,
    backlog_focus: bool,
    include_next_actor: bool,
    task_id: Optional[str] = None,
    task_source: Optional[Path] = None,
    qa_review: Optional[dict] = None,
    qa_report_path: Optional[Path] = None,
    workspace: Optional[Path] = None,
) -> str:
    if deliverables:
        deliverable_text = "\n".join(f"- {path}" for path in deliverables)
    else:
        deliverable_text = "- (no direct file deliverables)"
    parts = [
        BASE_PROMPT,
        f"Deliverable locations:\n{deliverable_text}",
    ]
    if task_id and task_source:
        parts.append(f"The agent executed task {task_id} defined in {task_source}.")
    parts.append(
        "Original instructions provided to the execution agent:\n"
        f"---\n{original_instructions}\n---"
    )

    if qa_review:
        qa_status = qa_review.get("status", "unknown")
        qa_summary = qa_review.get("summary", "")
        qa_issues = qa_review.get("issues") or []
        qa_section = [
            "Latest QA Review:",
            f"- Status: {qa_status}",
            f"- Summary: {qa_summary}",
            "- Outstanding QA Issues:",
            format_issue_list(qa_issues),
        ]
        parts.append("\n".join(qa_section))

    if execution_focus and task_id:
        parts.append(
            "Validation focus:\n"
            "- Inspect automation_artifacts/tasks/<task-id>/agent-report.md for summary, tests, and follow-ups.\n"
            "- Confirm code changes satisfy the DoD listed in the backlog entry and that reported tests were executed.\n"
            "- Verify new or updated tests live alongside the implementation.\n"
            "- Flag missing validations, untracked assumptions, or regressions."
        )
        parts.append(
            "If issues remain, set `next_actor` to `agent` when implementation changes are required, "
            "or `qa` when additional QA validation is needed before sign-off."
        )
    elif devops_focus:
        parts.append(
            "Validation focus:\n"
            "- Ensure docker-compose.dev.yml defines services for frontend and backend (and any other dependencies) with volume mounts pointing to the repository source directories.\n"
            "- Verify devops/start-dev.sh, devops/stop-dev.sh, and devops/logs.sh are executable scripts, contain the expected docker compose commands, and reference the compose file via -f docker-compose.dev.yml.\n"
            "- Confirm .env.example exists and lists variables referenced by the compose services.\n"
            "- Check that frontend/package.json and backend/package.json exist with minimal scripts (e.g., dev) matching what the documentation will reference.\n"
            "- Fail validation if any required file is missing, empty, not executable (for scripts), or obviously inconsistent with the instructions."
        )
    elif backlog_focus:
        parts.append(
            "Validation focus:\n"
            "- Ensure BACKLOG/backlog.json is valid JSON with `version`, `generated_at`, and a `tasks` array.\n"
            "- Confirm every task has fields: id, title, owner, area, deps[], dod[], tests[], artifacts[], estimate_points.\n"
            "- Check for duplicate IDs or dependencies on missing tasks.\n"
            "- Report an issue if the graph appears cyclic or if required metadata is absent."
        )
    else:
        parts.append(
            "Validation focus:\n"
            "- Ensure each deliverable exists and is updated.\n"
            "- Cross-check that the content satisfies every requirement stated in the original instructions."
        )

    if qa_review and qa_report_path:
        report_reference = Path(qa_report_path)
        if report_reference.is_absolute() and workspace:
            try:
                report_reference = report_reference.relative_to(workspace)
            except ValueError:
                pass
        parts.append(f"QA report for this task lives at {report_reference}.")

    schema = (
        '{"status":"pass|fail","issues":["<list of problems>"],"summary":"<short recap>","next_actor":"agent|qa"}'
        if include_next_actor
        else '{"status":"pass|fail","issues":["<list of problems>"],"summary":"<short recap>"}'
    )
    parts.append(
        "Respond ONLY with a JSON object using this schema:\n"
        f"{schema}"
    )
    return "\n\n".join(parts)


def format_issue_list(issues: Sequence[str]) -> str:
    formatted = "\n".join(f"- {issue}" for issue in issues if issue)
    return formatted or "- No details provided."
