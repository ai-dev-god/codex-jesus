from __future__ import annotations

import argparse
from pathlib import Path
from typing import Optional

from .errors import WorkflowError
from .paths import PROJECT_IDEA_FILE


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the Codex documentation/task workflow in headless mode."
    )
    parser.add_argument(
        "--workspace",
        default=".",
        help="Repository root that contains the docs/ directory (default: current directory).",
    )
    parser.add_argument(
        "--project-idea",
        nargs="+",
        help=(
            "Raw project idea text used for Prompt 1. Mutually exclusive with --project-idea-file. "
            f"If omitted, the workflow will read from {PROJECT_IDEA_FILE} when available."
        ),
    )
    parser.add_argument(
        "--project-idea-file",
        help=(
            "File containing the project idea text used for Prompt 1. "
            f"Overrides {PROJECT_IDEA_FILE} if provided."
        ),
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Execution model (defaults to gpt-5-codex).",
    )
    parser.add_argument(
        "--allow-model-override",
        action="store_true",
        help="Allow using a model other than gpt-5-codex.",
    )
    parser.add_argument(
        "--manager-model",
        default=None,
        help="Optional override for the manager validation agent model.",
    )
    parser.add_argument(
        "--include-plan",
        action="store_true",
        help="Pass --include-plan-tool to Codex exec calls.",
    )
    parser.add_argument(
        "--skip-devops",
        action="store_true",
        help="Skip the Scaffolder/DevOps stage (docker compose and scripts).",
    )
    parser.add_argument(
        "--skip-docs",
        action="store_true",
        help="Skip the documentation pipeline (Intake PM through UX).",
    )
    parser.add_argument(
        "--skip-roadmap",
        action="store_true",
        help="Skip planning stages (treated the same as --skip-backlog).",
    )
    parser.add_argument(
        "--skip-backlog",
        action="store_true",
        help="Skip the Planner stage (no backlog DAG generation).",
    )
    parser.add_argument(
        "--skip-tasks",
        action="store_true",
        help="Skip Prompt 4 task execution loop.",
    )
    parser.add_argument(
        "--max-tasks",
        type=int,
        default=None,
        help="Maximum number of tasks to process with Prompt 4. Omit for no limit.",
    )
    parser.add_argument(
        "--agent-retries",
        type=int,
        default=10,
        help="Maximum number of manager-driven retries per agent run (default: 10).",
    )
    parser.add_argument(
        "--manager-retries",
        type=int,
        default=5,
        help="Maximum number of retries for manager validation prompts (default: 5).",
    )
    parser.add_argument(
        "--qa-retries",
        type=int,
        default=5,
        help="Maximum number of retries for QA validation prompts (default: 5).",
    )
    parser.add_argument(
        "--mvp-mode",
        action="store_true",
        help="Generate lean MVP documentation, roadmap, and tasks focused on rapid implementation.",
    )
    parser.add_argument(
        "--force-devops",
        action="store_true",
        help="Regenerate DevOps tooling even if existing files are present.",
    )
    parser.add_argument(
        "--force-docs",
        action="store_true",
        help="Regenerate doc artifacts even if ARTIFACTS/prd.* etc already exist.",
    )
    parser.add_argument(
        "--force-roadmap",
        action="store_true",
        help="Force rerun of planning stages (Planner).",
    )
    parser.add_argument(
        "--force-backlog",
        action="store_true",
        help="Force regeneration of BACKLOG/backlog.json even if populated.",
    )
    parser.add_argument(
        "--smoke-test",
        action="store_true",
        help="Run a quick writeability smoke test and exit.",
    )
    parser.add_argument(
        "--smoke-path",
        default="platform/ARTIFACTS/smoke-test.md",
        help="Target file path (relative to workspace) for the write smoke test.",
    )
    parser.add_argument(
        "--reprocess-tasks",
        action="store_true",
        help="Process tasks even if already marked as completed in automation artifacts.",
    )
    parser.add_argument(
        "--sandbox",
        default="danger-full-access",
        choices=["read-only", "workspace-write", "danger-full-access"],
        help="Sandbox policy to pass to Codex exec (default: danger-full-access).",
    )
    parser.add_argument(
        "--approval-policy",
        default="never",
        choices=["untrusted", "on-failure", "on-request", "never"],
        help="Approval policy to pass to Codex exec (default: never).",
    )
    parser.add_argument(
        "--reasoning-effort",
        default="high",
        choices=["low", "medium", "high"],
        help="Reasoning effort level for Codex runs (default: high).",
    )
    parser.add_argument(
        "--artifacts-dir",
        default="platform/automation_artifacts",
        help="Directory where transcripts and validation metadata will be stored.",
    )
    return parser.parse_args()


def read_project_idea(args: argparse.Namespace, *, default_path: Optional[Path] = None) -> str:
    if args.project_idea and args.project_idea_file:
        raise WorkflowError("Provide either --project-idea or --project-idea-file, not both.")
    if args.project_idea:
        idea_text = " ".join(args.project_idea).strip()
    elif args.project_idea_file:
        idea_path = Path(args.project_idea_file)
        if not idea_path.exists():
            raise WorkflowError(f"Project idea file not found: {idea_path}")
        idea_text = idea_path.read_text(encoding="utf-8").strip()
    elif default_path and default_path.exists():
        idea_text = default_path.read_text(encoding="utf-8").strip()
    else:
        raise WorkflowError(
            f"Prompt 1 requires --project-idea, --project-idea-file, or a populated {PROJECT_IDEA_FILE}."
        )

    if not idea_text:
        raise WorkflowError("Project idea text is empty.")
    return idea_text


def ensure_workspace_paths(workspace: Path) -> None:
    docs_dir = workspace / "docs"
    if not docs_dir.exists():
        raise WorkflowError(f"Expected docs directory at {docs_dir}")
    platform_dir = workspace / "platform"
    if not platform_dir.exists():
        raise WorkflowError(f"Expected platform directory at {platform_dir}")
    required_dirs = [
        "PROMPTS",
        "ARTIFACTS",
        "BACKLOG",
        "EVAL",
        "POLICY",
        "automation_artifacts",
    ]
    for directory in required_dirs:
        path = platform_dir / directory
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
