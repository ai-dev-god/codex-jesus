#!/usr/bin/env python3
"""Telegram bot relay for Codex sessions."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import math
import json
import logging
import os
import shlex
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set, TextIO

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.error import BadRequest
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ConversationHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
PLATFORM_DIR = REPO_ROOT / "platform"
PROMPT_TEMPLATE = (
    PLATFORM_DIR / "automation" / "agents" / "telegram" / "prompt.txt"
).read_text(encoding="utf-8")
TELEGRAM_BASE_DIR = PLATFORM_DIR / "automation_artifacts" / "telegram"
SESSIONS_DIR = PLATFORM_DIR / "automation_artifacts" / "sessions"
WORKFLOW_SCRIPT = PLATFORM_DIR / "automation" / "workflow.py"
BACKLOG_FILE = PLATFORM_DIR / "BACKLOG" / "backlog.json"
TASKS_ARTIFACT_DIR = PLATFORM_DIR / "automation_artifacts" / "tasks"
CONVERSATIONS_LOG = PLATFORM_DIR / "automation_artifacts" / "conversations.jsonl"
ARTIFACTS_DIR = PLATFORM_DIR / "ARTIFACTS"
BUGS_DIR = PLATFORM_DIR / "automation_artifacts" / "bugs"
FEEDBACK_DIR = PLATFORM_DIR / "automation_artifacts" / "feedback"

ALLOWED_USERNAMES = {
    username.strip().lower()
    for username in os.getenv("TELEGRAM_ALLOWED_USERS", "fishmaster2").split(",")
    if username.strip()
}

PROMPT_ALIAS_MAP: Dict[int, List[str]] = {
    0: ["docs", "intake"],
    1: ["research"],
    2: ["architecture", "arch"],
    3: ["api"],
    4: ["ux", "design"],
    5: ["planner", "roadmap"],
    6: ["devops", "scaffold"],
    7: ["tasks", "module"],
    8: ["qa", "test"],
    9: ["review", "reviewer"],
    10: ["security", "compliance"],
    11: ["perf"],
    12: ["release"],
    13: ["docwriter"],
    14: ["grader", "metagrader"],
}

PROMPT_COMMANDS: Dict[str, int] = {
    alias: prompt_number
    for prompt_number, aliases in PROMPT_ALIAS_MAP.items()
    for alias in aliases
}

PROMPT_DESCRIPTIONS: Dict[int, str] = {
    0: "Intake PM",
    1: "Research analyst",
    2: "Solution architect",
    3: "API designer",
    4: "UX designer",
    5: "Planner / backlog DAG",
    6: "Scaffolder / DevOps",
    7: "Module developer",
    8: "Test engineer",
    9: "Code reviewer",
    10: "Security & compliance",
    11: "Performance & resilience",
    12: "Release engineer",
    13: "Documentation writer",
    14: "Meta-grader",
}

MAIN_MENU_CALLBACK = "menu:root"
TASKS_MENU_CALLBACK = "menu:tasks"
AGENTS_MENU_CALLBACK = "menu:agents"
TASK_DETAIL_PREFIX = "task:"
TASK_CONTEXT_PREFIX = "taskctx:"
TASK_CONTEXT_CLEAR = "taskctx:clear"
TASKS_PAGE_PREFIX = "menu:tasks:page:"
BUGS_MENU_CALLBACK = "menu:bugs"
BUG_DETAIL_PREFIX = "bug:"
BUGS_PAGE_PREFIX = "menu:bugs:page:"
FEEDBACK_MENU_CALLBACK = "menu:feedback"
FEEDBACK_DETAIL_PREFIX = "feedback:"
FEEDBACK_PAGE_PREFIX = "menu:feedback:page:"
TASK_CHAT_PREFIX = "taskchat:"
TASK_CHAT_STOP = "taskchat:stop"
AGENT_SELECT_PREFIX = "agent:"
AGENT_CLEAR_CALLBACK = "agent:clear"
STATUS_REFRESH_CALLBACK = "menu:status"
WORKFLOW_START_CALLBACK = "workflow:start"
WORKFLOW_STOP_CALLBACK = "workflow:stop"
TASK_MARK_COMPLETE_PREFIX = "taskcomplete:"
TASK_PAGE_SIZE = 6
BUG_PAGE_SIZE = 6
FEEDBACK_PAGE_SIZE = 6

WORKFLOW_PROCESS: Optional[subprocess.Popen[str]] = None
WORKFLOW_LOG_HANDLE: Optional[TextIO] = None
WORKFLOW_LOG_PATH: Optional[Path] = None
LAST_WORKFLOW_LOG_PATH: Optional[Path] = None
LAST_WORKFLOW_EXIT_CODE: Optional[int] = None
WORKFLOW_LOCK = asyncio.Lock()
WORKFLOW_MONITOR_TASK: Optional[asyncio.Task] = None
WORKFLOW_SUBSCRIBERS: Set[int] = set()
STATUS_SUMMARY_PATH = TELEGRAM_BASE_DIR / "status.json"
STAGE_NAMES: Dict[int, str] = {
    0: "DevOps bootstrap",
    1: "PRD / Intake",
    2: "Research",
    3: "Architecture",
    4: "API design",
    5: "Planner",
    6: "Scaffolder",
}

BUG_SUMMARY, BUG_SEVERITY, BUG_EXPECTED, BUG_OBSERVED, BUG_REPRO, BUG_ENV = range(6)
(
    FEEDBACK_SUMMARY,
    FEEDBACK_TYPE,
    FEEDBACK_PROBLEM,
    FEEDBACK_SOLUTION,
    FEEDBACK_BENEFIT,
    FEEDBACK_AUDIENCE,
    FEEDBACK_LINKS,
) = range(6, 13)


def _workflow_process_info() -> Optional[Dict[str, str]]:
    if WORKFLOW_PROCESS and WORKFLOW_PROCESS.poll() is None:
        args = WORKFLOW_PROCESS.args if isinstance(WORKFLOW_PROCESS.args, (list, tuple)) else [str(WORKFLOW_PROCESS.args)]
        command = " ".join(str(arg) for arg in args)
        return {"pid": str(WORKFLOW_PROCESS.pid), "command": command}
    result = subprocess.run(
        ["pgrep", "-fl", str(WORKFLOW_SCRIPT)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    line = result.stdout.strip().splitlines()[0]
    pid_str, *cmd_parts = line.split(maxsplit=1)
    try:
        int(pid_str)
    except ValueError:
        return None
    command = cmd_parts[0] if cmd_parts else str(WORKFLOW_SCRIPT)
    return {"pid": pid_str, "command": command}


def _load_backlog_map() -> Dict[str, Dict[str, Any]]:
    if not BACKLOG_FILE.exists():
        return {}
    try:
        data = json.loads(BACKLOG_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    tasks: Dict[str, Dict[str, Any]] = {}
    for item in data.get("tasks", []):
        tasks[item.get("id", "")] = item
    return tasks


def _load_task_runs() -> Dict[str, Dict[str, Any]]:
    runs: Dict[str, Dict[str, Any]] = {}
    if not TASKS_ARTIFACT_DIR.exists():
        return runs
    for path in TASKS_ARTIFACT_DIR.iterdir():
        if not path.is_dir():
            continue
        entry: Dict[str, Any] = {"mtime": 0.0}
        for file in path.glob("*.txt"):
            try:
                payload = json.loads(file.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                payload = None
            role_key = file.stem
            if role_key.startswith("agent"):
                role_key = "agent"
            elif role_key.startswith("qa"):
                role_key = "qa"
            elif role_key.startswith("manager"):
                role_key = "manager"
            entry[role_key] = payload
            entry["mtime"] = max(entry["mtime"], file.stat().st_mtime)
        runs[path.name.upper()] = entry
    return runs


def _classify_status(run_info: Dict[str, Any]) -> str:
    manager_status = (run_info.get("manager") or {}).get("status") if run_info.get("manager") else None
    qa_status = (run_info.get("qa") or {}).get("status") if run_info.get("qa") else None
    if manager_status == "pass":
        return "pass"
    if manager_status == "fail":
        return "manager_fail"
    if qa_status == "fail":
        return "qa_fail"
    if qa_status == "pass":
        return "qa_pass"
    if run_info.get("agent"):
        return "in_progress"
    return "pending"


def _status_emoji(status: str) -> str:
    if status == "pass":
        return "✅"
    if status in {"manager_fail", "qa_fail"}:
        return "❌"
    if status in {"in_progress", "qa_pass"}:
        return "🚧"
    return "⏳"


def _generate_bug_id() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    suffix = uuid.uuid4().hex[:6]
    return f"bug-{timestamp}-{suffix}"


def _normalize_severity(raw: str) -> Optional[str]:
    text = (raw or "").strip().lower()
    mappings = {
        "critical": "critical",
        "crit": "critical",
        "p0": "critical",
        "high": "high",
        "p1": "high",
        "medium": "medium",
        "med": "medium",
        "p2": "medium",
        "low": "low",
        "minor": "low",
        "p3": "low",
        "unknown": "unknown",
        "n/a": "unknown",
        "na": "unknown",
        "p4": "unknown",
    }
    return mappings.get(text)


def _record_bug_step(bug_data: Dict[str, Any], update: Update, step: str, value: str) -> None:
    message = update.message
    if message is None:
        return
    bug_data.setdefault("messages", []).append(
        {
            "step": step,
            "message_id": message.message_id,
            "text": value,
            "timestamp": (message.date or datetime.now(timezone.utc)).isoformat(),
        }
    )


def _persist_bug_submission(bug_data: Dict[str, Any]) -> Path:
    BUGS_DIR.mkdir(parents=True, exist_ok=True)
    bug_dir = BUGS_DIR / bug_data["bug_id"]
    bug_dir.mkdir(parents=True, exist_ok=True)

    submission_path = bug_dir / "submission.json"
    submission_path.write_text(json.dumps(bug_data, indent=2), encoding="utf-8")

    state_path = bug_dir / "state.json"
    if state_path.exists():
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logging.warning("Invalid state file for bug %s; resetting.", bug_data["bug_id"])
            state = {}
    else:
        state = {}

    history = state.get("history")
    if not isinstance(history, list):
        history = []
    state["history"] = history
    state["bug_id"] = bug_data["bug_id"]
    state["pending_stage"] = "intake"
    state["awaiting_human"] = False
    state.pop("awaiting_reason", None)
    state["last_submission_at"] = bug_data["submitted_at"]
    state["updated_at"] = bug_data["submitted_at"]
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    return bug_dir


def _generate_feedback_id() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    suffix = uuid.uuid4().hex[:6]
    return f"fb-{timestamp}-{suffix}"


def _normalize_feedback_type(raw: str) -> Optional[str]:
    text = (raw or "").strip().lower()
    mappings = {
        "improvement": "improvement",
        "improve": "improvement",
        "enhancement": "improvement",
        "enhance": "improvement",
        "new": "new_feature",
        "feature": "new_feature",
        "new feature": "new_feature",
        "idea": "new_feature",
        "question": "question",
        "feedback": "other",
        "other": "other",
        "bug": "other",
    }
    return mappings.get(text)


def _normalize_feedback_audience(raw: str) -> Optional[str]:
    text = (raw or "").strip().lower()
    mappings = {
        "external": "external",
        "customer": "external",
        "client": "external",
        "internal": "internal",
        "team": "internal",
        "staff": "internal",
        "unknown": "unknown",
        "n/a": "unknown",
        "na": "unknown",
        "all": "unknown",
    }
    return mappings.get(text)


def _record_feedback_step(feedback_data: Dict[str, Any], update: Update, step: str, value: str) -> None:
    message = update.message
    if message is None:
        return
    feedback_data.setdefault("messages", []).append(
        {
            "step": step,
            "message_id": message.message_id,
            "text": value,
            "timestamp": (message.date or datetime.now(timezone.utc)).isoformat(),
        }
    )


def _persist_feedback_submission(feedback_data: Dict[str, Any]) -> Path:
    FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)
    fb_dir = FEEDBACK_DIR / feedback_data["feedback_id"]
    fb_dir.mkdir(parents=True, exist_ok=True)

    submission_path = fb_dir / "submission.json"
    submission_path.write_text(json.dumps(feedback_data, indent=2), encoding="utf-8")

    state_path = fb_dir / "state.json"
    if state_path.exists():
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logging.warning("Invalid state file for feedback %s; resetting.", feedback_data["feedback_id"])
            state = {}
    else:
        state = {}

    history = state.get("history")
    if not isinstance(history, list):
        history = []
    state["history"] = history
    state["feedback_id"] = feedback_data["feedback_id"]
    state["pending_stage"] = "intake"
    state["awaiting_human"] = False
    state.pop("awaiting_reason", None)
    state["last_submission_at"] = feedback_data["submitted_at"]
    state["updated_at"] = feedback_data["submitted_at"]
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    return fb_dir


def _read_json_file(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        logging.warning("Failed to parse JSON: %s", path)
        return None


async def _trigger_workflow_after_submission(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    chat = update.effective_chat
    if chat is None:
        return

    message = update.effective_message

    async def send(text: str) -> None:
        if message:
            await message.reply_text(text)
        else:
            await context.bot.send_message(chat.id, text)

    await _start_workflow_core(
        context=context,
        chat_id=chat.id,
        extra_args=[],
        args_text="",
        send=send,
    )


def _agent_label(prompt_number: Optional[int]) -> str:
    if prompt_number is None:
        return "🤖 Agents"
    description = PROMPT_DESCRIPTIONS.get(prompt_number, f"Prompt {prompt_number}")
    return f"🤖 Active: {description}"


def _workflow_running() -> bool:
    return _workflow_process_info() is not None


def build_main_menu(active_agent: Optional[int]) -> InlineKeyboardMarkup:
    running = _workflow_running()
    status_text = "🟢 Workflow running" if running else "🔴 Workflow idle"
    buttons: List[List[InlineKeyboardButton]] = [
        [InlineKeyboardButton(text=status_text, callback_data=STATUS_REFRESH_CALLBACK)],
        [
            InlineKeyboardButton(text="▶️ Start", callback_data=WORKFLOW_START_CALLBACK),
            InlineKeyboardButton(text="⏹️ Stop", callback_data=WORKFLOW_STOP_CALLBACK),
        ],
        [InlineKeyboardButton(text="📋 Tasks", callback_data=TASKS_MENU_CALLBACK)],
        [
            InlineKeyboardButton(text="🐞 Bugs", callback_data=BUGS_MENU_CALLBACK),
            InlineKeyboardButton(text="💡 Feedback", callback_data=FEEDBACK_MENU_CALLBACK),
        ],
        [InlineKeyboardButton(text=_agent_label(active_agent), callback_data=AGENTS_MENU_CALLBACK)],
    ]
    return InlineKeyboardMarkup(buttons)


def _summarize_tasks_for_menu(summary: Dict[str, Any]) -> List[Dict[str, Any]]:
    prioritized: List[Dict[str, Any]] = []
    prioritized.extend(summary.get("ready", [])[:5])
    prioritized.extend(summary.get("in_progress", [])[:5])
    seen = {task["id"] for task in prioritized}
    if len(prioritized) < 10:
        for task in summary.get("all", []):
            if task["id"] in seen:
                continue
            prioritized.append(task)
            seen.add(task["id"])
            if len(prioritized) >= 10:
                break
    return prioritized


def build_tasks_overview(
    summary: Dict[str, Any],
    *,
    page: int,
    page_size: int,
) -> tuple[str, InlineKeyboardMarkup]:
    counts = summary["counts"]
    tasks = summary.get("all", [])
    total = len(tasks)
    total_pages = max(1, math.ceil(total / max(1, page_size)))
    page = max(0, min(page, total_pages - 1))
    start = page * page_size
    end = start + page_size
    slice_tasks = tasks[start:end]

    lines = [
        "Task overview:",
        f"✅ {counts['pass']}  🚧 {counts['progress']}  ❌ {counts['fail']}  ⏳ {counts['pending']}",
        f"Select a task for details. Page {page + 1}/{total_pages}",
    ]
    buttons: List[List[InlineKeyboardButton]] = []
    for task in slice_tasks:
        label = f"{_status_emoji(task['status'])} {task['id']}"
        buttons.append(
            [InlineKeyboardButton(text=label, callback_data=f"{TASK_DETAIL_PREFIX}{task['id']}")]
        )

    if total_pages > 1:
        prev_page = (page - 1) % total_pages
        next_page = (page + 1) % total_pages
        buttons.append(
            [
                InlineKeyboardButton(
                    text="◀️ Prev", callback_data=f"{TASKS_PAGE_PREFIX}{prev_page}"
                ),
                InlineKeyboardButton(
                    text="▶️ Next", callback_data=f"{TASKS_PAGE_PREFIX}{next_page}"
                ),
            ]
        )

    buttons.append([InlineKeyboardButton(text="⬅️ Back", callback_data=MAIN_MENU_CALLBACK)])
    return "\n".join(lines), InlineKeyboardMarkup(buttons)


def build_task_detail(
    task: Dict[str, Any],
    active_task_id: Optional[str],
    active_chat_task_id: Optional[str],
) -> tuple[str, InlineKeyboardMarkup]:
    deps = task.get("deps") or []
    deps_line = ", ".join(deps) if deps else "(none)"
    artifact_path = (TASKS_ARTIFACT_DIR / task["id"].upper()) if task.get("id") else None
    artifact_text = _format_log_path(artifact_path) if artifact_path else "n/a"
    updated_at = datetime.fromtimestamp(task.get("mtime", 0)) if task.get("mtime") else None
    lines = [
        f"{_status_emoji(task['status'])} {task['id']}",
        f"Title: {task.get('title') or 'n/a'}",
        f"Owner: {task.get('owner') or 'n/a'}",
        f"Area: {task.get('area') or 'n/a'}",
        f"Dependencies: {deps_line}",
        f"Artifacts: {artifact_text}",
    ]
    if updated_at:
        lines.append(f"Last update: {updated_at.strftime('%Y-%m-%d %H:%M:%S')}")
    if task.get("id") and task["id"] == active_task_id:
        lines.append("This task is active for chat prompts.")
    
    buttons: List[List[InlineKeyboardButton]] = []
    buttons.append(
        [InlineKeyboardButton(text="📌 Set active task", callback_data=f"{TASK_CONTEXT_PREFIX}{task['id']}")]
    )
    if task.get("id") and task["id"] == active_task_id:
        buttons.append([InlineKeyboardButton(text="❎ Clear active task", callback_data=TASK_CONTEXT_CLEAR)])
    session_id = _find_task_agent_session(task["id"])
    chat_active = task.get("id") and task["id"] == active_chat_task_id
    if chat_active:
        lines.append("Agent chat: active — send a message in this chat to continue the agent conversation.")
    elif session_id:
        lines.append("Agent chat: available — use the talk button to resume the agent conversation.")
    if session_id and not chat_active:
        buttons.append(
            [
                InlineKeyboardButton(
                    text="💬 Talk to agent", callback_data=f"{TASK_CHAT_PREFIX}{task['id']}"
                )
            ]
        )
    if chat_active:
        buttons.append(
            [
                InlineKeyboardButton(
                    text="🛑 Stop task chat", callback_data=TASK_CHAT_STOP
                )
            ]
        )
    if task.get("status") != "pass":
        buttons.append(
            [
                InlineKeyboardButton(
                    text="✅ Mark completed", callback_data=f"{TASK_MARK_COMPLETE_PREFIX}{task['id']}"
                )
            ]
        )
    buttons.append([InlineKeyboardButton(text="⬅️ Back to tasks", callback_data=TASKS_MENU_CALLBACK)])
    buttons.append([InlineKeyboardButton(text="🏠 Main menu", callback_data=MAIN_MENU_CALLBACK)])
    return "\n".join(lines), InlineKeyboardMarkup(buttons)


def build_agents_menu(active_agent: Optional[int]) -> InlineKeyboardMarkup:
    buttons: List[List[InlineKeyboardButton]] = []
    for prompt_number in sorted(PROMPT_DESCRIPTIONS):
        description = PROMPT_DESCRIPTIONS[prompt_number]
        prefix = "✅ " if prompt_number == active_agent else ""
        buttons.append(
            [
                InlineKeyboardButton(
                    text=f"{prefix}{description}",
                    callback_data=f"{AGENT_SELECT_PREFIX}{prompt_number}",
                )
            ]
        )
    buttons.append([InlineKeyboardButton(text="♻️ Clear agent", callback_data=AGENT_CLEAR_CALLBACK)])
    buttons.append([InlineKeyboardButton(text="🏠 Main menu", callback_data=MAIN_MENU_CALLBACK)])
    return InlineKeyboardMarkup(buttons)

def _collect_task_states() -> Dict[str, Any]:
    backlog = _load_backlog_map()
    runs = _load_task_runs()
    tasks_summary: List[Dict[str, Any]] = []
    completed_ids: set[str] = set()
    counts = {"pass": 0, "fail": 0, "progress": 0, "pending": 0}

    for task_id, meta in backlog.items():
        run_info = runs.get(task_id.upper(), {})
        status = _classify_status(run_info)
        mtime = run_info.get("mtime", 0.0)
        if status == "pass":
            counts["pass"] += 1
            completed_ids.add(task_id)
        elif status in {"manager_fail", "qa_fail"}:
            counts["fail"] += 1
        elif status in {"in_progress", "qa_pass"}:
            counts["progress"] += 1
        else:
            counts["pending"] += 1
        tasks_summary.append(
            {
                "id": task_id,
                "title": meta.get("title", ""),
                "owner": meta.get("owner", ""),
                "area": meta.get("area", ""),
                "deps": meta.get("deps", []),
                "status": status,
                "mtime": mtime,
            }
        )

    # Include any tasks that may exist in automation artifacts but not the backlog (fallback)
    for run_id, run_info in runs.items():
        task_id = run_id
        if task_id in backlog:
            continue
        status = _classify_status(run_info)
        if status == "pass":
            counts["pass"] += 1
            completed_ids.add(task_id)
        elif status in {"manager_fail", "qa_fail"}:
            counts["fail"] += 1
        elif status in {"in_progress", "qa_pass"}:
            counts["progress"] += 1
        else:
            counts["pending"] += 1
        tasks_summary.append(
            {
                "id": task_id,
                "title": run_info.get("manager", {}).get("summary", ""),
                "owner": "",
                "area": "",
                "deps": [],
                "status": status,
                "mtime": run_info.get("mtime", 0.0),
            }
        )

    ready_tasks = [
        task
        for task in tasks_summary
        if task["status"] == "pending" and all(dep in completed_ids for dep in task["deps"])
    ]
    in_progress_tasks = [
        task for task in tasks_summary if task["status"] in {"in_progress", "qa_pass", "manager_fail", "qa_fail"}
    ]
    completed_tasks = sorted(
        [task for task in tasks_summary if task["status"] == "pass"],
        key=lambda item: item["mtime"],
        reverse=True,
    )

    return {
        "all": tasks_summary,
        "counts": counts,
        "ready": ready_tasks,
        "in_progress": in_progress_tasks,
        "completed_recent": completed_tasks[:5],
    }


def _mark_task_completed(task_id: str) -> Path:
    slug = task_id.lower()
    task_dir = TASKS_ARTIFACT_DIR / slug
    task_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "status": "pass",
        "summary": "Manually marked completed via Telegram.",
        "issues": [],
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds") + "Z",
    }
    result_path = task_dir / "manager-manual.txt"
    result_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return result_path


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return datetime.fromisoformat(value)
    except ValueError:
        try:
            return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return None


def _collect_bug_states() -> List[Dict[str, Any]]:
    bugs: List[Dict[str, Any]] = []
    if not BUGS_DIR.exists():
        return bugs
    for bug_dir in sorted(path for path in BUGS_DIR.iterdir() if path.is_dir()):
        bug_id = bug_dir.name
        state = _read_json_file(bug_dir / "state.json") or {}
        submission = _read_json_file(bug_dir / "submission.json") or {}
        intake = _read_json_file(bug_dir / "intake.json") or {}
        triage = _read_json_file(bug_dir / "triage.json") or {}
        repro = _read_json_file(bug_dir / "repro.json") or {}
        title = intake.get("summary") or submission.get("summary") or bug_id
        severity = (
            intake.get("severity")
            or triage.get("severity")
            or submission.get("severity")
            or "unknown"
        )
        pending_stage = state.get("pending_stage", "intake")
        awaiting = state.get("awaiting_human", False)
        awaiting_reason = state.get("awaiting_reason", "")
        history = state.get("history") or []
        updated_at = state.get("updated_at") or submission.get("submitted_at")
        bugs.append(
            {
                "id": bug_id,
                "title": title,
                "severity": severity,
                "pending_stage": pending_stage,
                "awaiting": awaiting,
                "awaiting_reason": awaiting_reason,
                "history": history,
                "updated_at": updated_at,
                "path": bug_dir,
                "context": {
                    "submission": submission,
                    "intake": intake,
                    "triage": triage,
                    "repro": repro,
                    "state": state,
                },
            }
        )
    return bugs


def _collect_feedback_states() -> List[Dict[str, Any]]:
    feedback_items: List[Dict[str, Any]] = []
    if not FEEDBACK_DIR.exists():
        return feedback_items
    for fb_dir in sorted(path for path in FEEDBACK_DIR.iterdir() if path.is_dir()):
        feedback_id = fb_dir.name
        state = _read_json_file(fb_dir / "state.json") or {}
        submission = _read_json_file(fb_dir / "submission.json") or {}
        intake = _read_json_file(fb_dir / "intake.json") or {}
        review = _read_json_file(fb_dir / "review.json") or {}
        plan = _read_json_file(fb_dir / "plan.json") or {}
        title = intake.get("title") or submission.get("title") or submission.get("summary") or feedback_id
        request_type = intake.get("request_type") or submission.get("request_type") or "other"
        impact = review.get("impact") or "unknown"
        pending_stage = state.get("pending_stage", "intake")
        awaiting = state.get("awaiting_human", False)
        awaiting_reason = state.get("awaiting_reason", "")
        history = state.get("history") or []
        updated_at = state.get("updated_at") or submission.get("submitted_at")
        feedback_items.append(
            {
                "id": feedback_id,
                "title": title,
                "request_type": request_type,
                "impact": impact,
                "pending_stage": pending_stage,
                "awaiting": awaiting,
                "awaiting_reason": awaiting_reason,
                "history": history,
                "updated_at": updated_at,
                "path": fb_dir,
                "context": {
                    "submission": submission,
                    "intake": intake,
                    "review": review,
                    "plan": plan,
                    "state": state,
                },
            }
        )
    return feedback_items


def _find_task_agent_session(task_id: str) -> Optional[str]:
    if not CONVERSATIONS_LOG.exists():
        return None
    slug = task_id.lower()
    agent_label = f"tasks/{slug}/agent"
    try:
        lines = [
            line
            for line in CONVERSATIONS_LOG.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    except OSError:
        return None

    for raw in reversed(lines):
        try:
            entry = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if entry.get("role") != "agent":
            continue
        label = entry.get("agent_label") or ""
        if not label.startswith(agent_label):
            continue
        session_id = entry.get("session_id")
        if session_id:
            return session_id
    return None


def build_bugs_overview(
    bugs: List[Dict[str, Any]],
    *,
    page: int,
    page_size: int,
) -> tuple[str, InlineKeyboardMarkup]:
    total = len(bugs)
    total_pages = max(1, math.ceil(total / max(1, page_size)))
    page = max(0, min(page, total_pages - 1))
    start = page * page_size
    end = start + page_size
    slice_items = bugs[start:end]

    lines = [
        "Bug tracker:",
        f"Total: {total}. Page {page + 1}/{total_pages}",
        "Tap a bug for details.",
    ]
    if not slice_items:
        lines.append("No bugs recorded yet.")

    buttons: List[List[InlineKeyboardButton]] = []
    for bug in slice_items:
        status_text = bug["pending_stage"]
        if bug["awaiting"]:
            status_text += " (awaiting)"
        label = f"{_status_emoji('in_progress' if bug['pending_stage'] != 'done' else 'pass')} {bug['id']} — {bug['severity']} ({status_text})"
        buttons.append(
            [InlineKeyboardButton(text=label, callback_data=f"{BUG_DETAIL_PREFIX}{bug['id']}")]
        )

    if total_pages > 1:
        prev_page = (page - 1) % total_pages
        next_page = (page + 1) % total_pages
        buttons.append(
            [
                InlineKeyboardButton(
                    text="◀️ Prev", callback_data=f"{BUGS_PAGE_PREFIX}{prev_page}"
                ),
                InlineKeyboardButton(
                    text="▶️ Next", callback_data=f"{BUGS_PAGE_PREFIX}{next_page}"
                ),
            ]
        )
    buttons.append([InlineKeyboardButton(text="⬅️ Back", callback_data=MAIN_MENU_CALLBACK)])
    return "\n".join(lines), InlineKeyboardMarkup(buttons)


def build_bug_detail(bug: Dict[str, Any]) -> tuple[str, InlineKeyboardMarkup]:
    path = bug.get("path")
    state = bug["context"].get("state") or {}
    intake = bug["context"].get("intake") or {}
    triage = bug["context"].get("triage") or {}
    repro = bug["context"].get("repro") or {}
    updated = _parse_iso_datetime(bug.get("updated_at"))
    lines = [
        f"{bug['id']} — {bug['title']}",
        f"Severity: {bug['severity']}",
        f"Stage: {bug['pending_stage']}"
        + (" (awaiting human: {})".format(bug["awaiting_reason"]) if bug["awaiting"] and bug["awaiting_reason"] else ""),
        f"Awaiting human: {'yes' if bug['awaiting'] else 'no'}",
        f"Directory: {_format_log_path(path)}",
    ]
    if updated:
        lines.append(f"Last update: {updated.strftime('%Y-%m-%d %H:%M:%S')}")
    if intake:
        lines.append(f"Intake status: {intake.get('status', 'n/a')}")
    if triage:
        lines.append(f"Triage status: {triage.get('status', 'n/a')} (priority {triage.get('priority', 'n/a')})")
    if repro:
        lines.append(f"Repro status: {repro.get('status', 'n/a')}")
    history = bug.get("history") or []
    if history:
        hist_lines = [
            f"- {entry.get('stage')} → {entry.get('status')} @ {entry.get('timestamp')}"
            for entry in history[-4:]
        ]
        lines.append("Recent history:")
        lines.extend(hist_lines)

    buttons = [
        [InlineKeyboardButton(text="⬅️ Back to bugs", callback_data=BUGS_MENU_CALLBACK)],
        [InlineKeyboardButton(text="🏠 Main menu", callback_data=MAIN_MENU_CALLBACK)],
    ]
    return "\n".join(lines), InlineKeyboardMarkup(buttons)


def build_feedback_overview(
    items: List[Dict[str, Any]],
    *,
    page: int,
    page_size: int,
) -> tuple[str, InlineKeyboardMarkup]:
    total = len(items)
    total_pages = max(1, math.ceil(total / max(1, page_size)))
    page = max(0, min(page, total_pages - 1))
    start = page * page_size
    end = start + page_size
    slice_items = items[start:end]

    lines = [
        "Feedback tracker:",
        f"Total: {total}. Page {page + 1}/{total_pages}",
        "Tap an entry for details.",
    ]
    if not slice_items:
        lines.append("No feedback recorded yet.")

    buttons: List[List[InlineKeyboardButton]] = []
    for fb in slice_items:
        status_text = fb["pending_stage"]
        if fb["awaiting"]:
            status_text += " (awaiting)"
        label = f"{_status_emoji('in_progress' if fb['pending_stage'] != 'done' else 'pass')} {fb['id']} — {fb['request_type']} ({status_text})"
        buttons.append(
            [InlineKeyboardButton(text=label, callback_data=f"{FEEDBACK_DETAIL_PREFIX}{fb['id']}")]
        )

    if total_pages > 1:
        prev_page = (page - 1) % total_pages
        next_page = (page + 1) % total_pages
        buttons.append(
            [
                InlineKeyboardButton(
                    text="◀️ Prev", callback_data=f"{FEEDBACK_PAGE_PREFIX}{prev_page}"
                ),
                InlineKeyboardButton(
                    text="▶️ Next", callback_data=f"{FEEDBACK_PAGE_PREFIX}{next_page}"
                ),
            ]
        )
    buttons.append([InlineKeyboardButton(text="⬅️ Back", callback_data=MAIN_MENU_CALLBACK)])
    return "\n".join(lines), InlineKeyboardMarkup(buttons)


def build_feedback_detail(item: Dict[str, Any]) -> tuple[str, InlineKeyboardMarkup]:
    path = item.get("path")
    state = item["context"].get("state") or {}
    intake = item["context"].get("intake") or {}
    review = item["context"].get("review") or {}
    plan = item["context"].get("plan") or {}
    updated = _parse_iso_datetime(item.get("updated_at"))
    lines = [
        f"{item['id']} — {item['title']}",
        f"Type: {item['request_type']}",
        f"Impact: {item['impact']}",
        f"Stage: {item['pending_stage']}"
        + (" (awaiting human: {})".format(item["awaiting_reason"]) if item["awaiting"] and item["awaiting_reason"] else ""),
        f"Awaiting human: {'yes' if item['awaiting'] else 'no'}",
        f"Directory: {_format_log_path(path)}",
    ]
    if updated:
        lines.append(f"Last update: {updated.strftime('%Y-%m-%d %H:%M:%S')}")
    if intake:
        lines.append(f"Intake status: {intake.get('status', 'n/a')}")
    if review:
        lines.append(
            f"Review status: {review.get('status', 'n/a')} (priority {review.get('priority', 'n/a')})"
        )
    if plan:
        lines.append(f"Plan status: {plan.get('status', 'n/a')}")
    history = item.get("history") or []
    if history:
        hist_lines = [
            f"- {entry.get('stage')} → {entry.get('status')} @ {entry.get('timestamp')}"
            for entry in history[-4:]
        ]
        lines.append("Recent history:")
        lines.extend(hist_lines)

    buttons = [
        [InlineKeyboardButton(text="⬅️ Back to feedback", callback_data=FEEDBACK_MENU_CALLBACK)],
        [InlineKeyboardButton(text="🏠 Main menu", callback_data=MAIN_MENU_CALLBACK)],
    ]
    return "\n".join(lines), InlineKeyboardMarkup(buttons)


def _latest_stage_entry() -> Optional[Dict[str, Any]]:
    if not CONVERSATIONS_LOG.exists():
        return None
    try:
        lines = [json.loads(line) for line in CONVERSATIONS_LOG.read_text(encoding="utf-8").splitlines() if line.strip()]
    except json.JSONDecodeError:
        return None
    for entry in reversed(lines):
        prompt_number = entry.get("prompt_number")
        if prompt_number in STAGE_NAMES:
            return entry
    return None


def _build_status_message() -> str:
    summary = _collect_task_states()
    counts = summary["counts"]
    process_info = _workflow_process_info()
    workflow_line = "Workflow: 🔴 stopped"
    if process_info:
        workflow_line = f"Workflow: 🟢 running (PID {process_info['pid']})"

    stage_entry = _latest_stage_entry()
    stage_line = None
    if stage_entry:
        stage_name = STAGE_NAMES.get(stage_entry.get("prompt_number"))
        if stage_name:
            stage_line = f"Stage: {stage_name} (prompt {stage_entry['prompt_number']})"

    ready = summary["ready"]
    in_progress = summary["in_progress"]
    completed_recent = summary["completed_recent"]

    lines = [workflow_line]
    if stage_line:
        lines.append(stage_line)
    totals_line = (
        f"Totals — ✅ {counts['pass']} | 🚧 {counts['progress']} | ❌ {counts['fail']} | ⏳ {counts['pending']}"
    )
    lines.append(totals_line)

    if ready:
        lines.append("Next ready tasks:")
        for task in ready[:3]:
            lines.append(
                f"  {_status_emoji(task['status'])} {task['id']} — {task['title']} (owner: {task['owner'] or 'n/a'})"
            )

    if in_progress:
        lines.append("In progress:")
        for task in in_progress[:3]:
            lines.append(
                f"  {_status_emoji(task['status'])} {task['id']} — {task['title']} (owner: {task['owner'] or 'n/a'})"
            )

    if completed_recent:
        lines.append("Recent completions:")
        for task in completed_recent[:3]:
            lines.append(
                f"  {_status_emoji(task['status'])} {task['id']} — {task['title']} (owner: {task['owner'] or 'n/a'})"
            )

    lines.append("Use /tasks or /artifact commands for more details.")
    return "\n".join(lines)


def is_authorized(update: Update) -> bool:
    user = update.effective_user
    if not user:
        return False
    username = (user.username or "").lower()
    if username in ALLOWED_USERNAMES:
        return True
    chat = update.effective_chat
    if chat and update.message:
        update.message.reply_text(
            "Sorry, this bot is restricted. If you believe this is an error, contact the owner."
        )
    logging.warning("Unauthorized access attempt from telegram user: %s", username)
    return False


def ensure_chat_dir(chat_id: int) -> Path:
    chat_dir = TELEGRAM_BASE_DIR / str(chat_id)
    chat_dir.mkdir(parents=True, exist_ok=True)
    return chat_dir

def get_prompt_session_path(prompt_number: int) -> Path:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    return SESSIONS_DIR / f"prompt{prompt_number}.session"

def parse_command_argument(text: str | None) -> str:
    if not text:
        return ""
    parts = text.split(" ", 1)
    if len(parts) < 2:
        return ""
    return parts[1].strip()


async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        return
    if update.message is None:
        return
    try:
        message = _build_status_message()
    except Exception as exc:  # noqa: BLE001
        logging.exception("Failed to build status message")
        await update.message.reply_text(f"Unable to gather status: {exc}")
        return
    await update.message.reply_text(message)


def _init_bug_payload(update: Update) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds") + "Z"
    user = update.effective_user
    chat = update.effective_chat
    full_name = ""
    if user:
        parts = [user.first_name or "", user.last_name or ""]
        full_name = " ".join(part for part in parts if part).strip()
    reporter = {
        "id": user.id if user else None,
        "handle": (user.username or "") if user else "",
        "name": full_name,
        "contact": (user.username or "") if user and user.username else full_name,
    }
    payload: Dict[str, Any] = {
        "bug_id": _generate_bug_id(),
        "submitted_at": now,
        "source": "telegram",
        "chat_id": chat.id if chat else None,
        "reporter": reporter,
        "summary": "",
        "severity": "unknown",
        "expected_behavior": "",
        "observed_behavior": "",
        "reproduction_steps": "",
        "environment": "",
        "messages": [],
    }
    return payload


async def bug_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not is_authorized(update):
        return ConversationHandler.END
    message = update.message
    if message is None:
        return ConversationHandler.END
    bug_data = _init_bug_payload(update)
    context.user_data["bug_report"] = bug_data
    await message.reply_text(
        "Starting a new bug report.\n"
        "Q1/6: What's a short summary of the issue? "
        "Reply with one or two sentences. You can /cancel at any time."
    )
    return BUG_SUMMARY


def _get_active_bug(context: ContextTypes.DEFAULT_TYPE) -> Optional[Dict[str, Any]]:
    data = context.user_data.get("bug_report")
    if isinstance(data, dict):
        return data
    return None


async def bug_collect_summary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    bug_data = _get_active_bug(context)
    message = update.message
    if bug_data is None or message is None:
        if message:
            await message.reply_text("Bug report session expired. Run /bug to start again.")
        context.user_data.pop("bug_report", None)
        return ConversationHandler.END
    summary = (message.text or "").strip()
    if not summary:
        await message.reply_text("Please provide a short summary describing the bug.")
        return BUG_SUMMARY
    bug_data["summary"] = summary
    _record_bug_step(bug_data, update, "summary", summary)
    await message.reply_text(
        "Q2/6: How severe is the issue? Reply with one of: critical, high, medium, low, unknown."
    )
    return BUG_SEVERITY


async def bug_collect_severity(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    bug_data = _get_active_bug(context)
    message = update.message
    if bug_data is None or message is None:
        if message:
            await message.reply_text("Bug report session expired. Run /bug to start again.")
        context.user_data.pop("bug_report", None)
        return ConversationHandler.END
    severity_input = (message.text or "").strip()
    severity = _normalize_severity(severity_input)
    if not severity:
        await message.reply_text(
            "I didn't recognize that severity. Please respond with critical, high, medium, low, or unknown."
        )
        return BUG_SEVERITY
    bug_data["severity"] = severity
    _record_bug_step(bug_data, update, "severity", severity_input)
    await message.reply_text(
        "Q3/6: What did you expect to happen instead? Give the expected behaviour."
    )
    return BUG_EXPECTED


async def bug_collect_expected(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    bug_data = _get_active_bug(context)
    message = update.message
    if bug_data is None or message is None:
        if message:
            await message.reply_text("Bug report session expired. Run /bug to start again.")
        context.user_data.pop("bug_report", None)
        return ConversationHandler.END
    expected = (message.text or "").strip()
    if not expected:
        await message.reply_text("Please describe the expected behaviour so we can compare.")
        return BUG_EXPECTED
    bug_data["expected_behavior"] = expected
    _record_bug_step(bug_data, update, "expected_behavior", expected)
    await message.reply_text(
        "Q4/6: What actually happened? Include any error messages you saw."
    )
    return BUG_OBSERVED


async def bug_collect_observed(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    bug_data = _get_active_bug(context)
    message = update.message
    if bug_data is None or message is None:
        if message:
            await message.reply_text("Bug report session expired. Run /bug to start again.")
        context.user_data.pop("bug_report", None)
        return ConversationHandler.END
    observed = (message.text or "").strip()
    if not observed:
        await message.reply_text("Please describe what you observed when the bug occurred.")
        return BUG_OBSERVED
    bug_data["observed_behavior"] = observed
    _record_bug_step(bug_data, update, "observed_behavior", observed)
    await message.reply_text(
        "Q5/6: List the steps to reproduce the issue. "
        "Include commands or navigation needed. If unknown, say 'unknown'."
    )
    return BUG_REPRO


async def bug_collect_repro(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    bug_data = _get_active_bug(context)
    message = update.message
    if bug_data is None or message is None:
        if message:
            await message.reply_text("Bug report session expired. Run /bug to start again.")
        context.user_data.pop("bug_report", None)
        return ConversationHandler.END
    steps = (message.text or "").strip()
    if not steps:
        await message.reply_text("Please provide reproduction steps or say 'unknown'.")
        return BUG_REPRO
    bug_data["reproduction_steps"] = steps
    _record_bug_step(bug_data, update, "reproduction_steps", steps)
    await message.reply_text(
        "Q6/6: Any environment details or links to logs/screenshots? "
        "Reply with 'none' if there's nothing to add."
    )
    return BUG_ENV


async def bug_collect_environment(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    bug_data = _get_active_bug(context)
    message = update.message
    if bug_data is None or message is None:
        if message:
            await message.reply_text("Bug report session expired. Run /bug to start again.")
        context.user_data.pop("bug_report", None)
        return ConversationHandler.END
    environment = (message.text or "").strip()
    if environment.lower() in {"none", "n/a", "na", "no", "skip"}:
        environment = ""
    bug_data["environment"] = environment
    _record_bug_step(bug_data, update, "environment", environment or "(none)")

    bug_dir = _persist_bug_submission(bug_data)
    context.user_data.pop("bug_report", None)

    relative_dir = bug_dir.relative_to(REPO_ROOT)
    await message.reply_text(
        f"Thanks! Bug `{bug_data['bug_id']}` is recorded and queued for intake.\n"
        f"Artifacts live under `{relative_dir}`. We'll follow up here if we need anything else.",
        parse_mode="Markdown",
    )
    try:
        await _trigger_workflow_after_submission(update, context)
    except Exception:  # noqa: BLE001
        logging.exception("Failed to auto-start workflow after bug submission")
        await message.reply_text(
            "Bug recorded, but automatic workflow start failed. Use /workflow_start to run it manually."
        )
    return ConversationHandler.END


async def bug_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.pop("bug_report", None)
    if update.message:
        await update.message.reply_text("Bug report cancelled. Use /bug to start again.")
    return ConversationHandler.END


def _init_feedback_payload(update: Update) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds") + "Z"
    user = update.effective_user
    chat = update.effective_chat
    full_name = ""
    if user:
        parts = [user.first_name or "", user.last_name or ""]
        full_name = " ".join(part for part in parts if part).strip()
    reporter = {
        "id": user.id if user else None,
        "handle": (user.username or "") if user else "",
        "name": full_name,
        "contact": (user.username or "") if user and user.username else full_name,
    }
    payload: Dict[str, Any] = {
        "feedback_id": _generate_feedback_id(),
        "submitted_at": now,
        "source": "telegram",
        "chat_id": chat.id if chat else None,
        "reporter": reporter,
        "title": "",
        "request_type": "other",
        "problem_statement": "",
        "proposed_solution": "",
        "benefits": "",
        "audience": "unknown",
        "supporting_links": [],
        "messages": [],
    }
    return payload


def _get_active_feedback(context: ContextTypes.DEFAULT_TYPE) -> Optional[Dict[str, Any]]:
    data = context.user_data.get("feedback_report")
    if isinstance(data, dict):
        return data
    return None


async def feedback_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not is_authorized(update):
        return ConversationHandler.END
    message = update.message
    if message is None:
        return ConversationHandler.END
    feedback_data = _init_feedback_payload(update)
    context.user_data["feedback_report"] = feedback_data
    await message.reply_text(
        "Starting a product feedback submission.\n"
        "Q1/7: What change or feature are you requesting? "
        "Share a short headline. Use /cancel to stop."
    )
    return FEEDBACK_SUMMARY


async def feedback_collect_summary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data = _get_active_feedback(context)
    message = update.message
    if data is None or message is None:
        if message:
            await message.reply_text("Feedback session expired. Use /feedback to start again.")
        context.user_data.pop("feedback_report", None)
        return ConversationHandler.END
    summary = (message.text or "").strip()
    if not summary:
        await message.reply_text("Please provide a short summary of your request.")
        return FEEDBACK_SUMMARY
    data["title"] = summary
    _record_feedback_step(data, update, "title", summary)
    await message.reply_text(
        "Q2/7: Is this an improvement to something existing, a brand new feature, a question, or other?"
    )
    return FEEDBACK_TYPE


async def feedback_collect_type(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data = _get_active_feedback(context)
    message = update.message
    if data is None or message is None:
        if message:
            await message.reply_text("Feedback session expired. Use /feedback to start again.")
        context.user_data.pop("feedback_report", None)
        return ConversationHandler.END
    request_type_input = (message.text or "").strip()
    normalized = _normalize_feedback_type(request_type_input)
    if not normalized:
        await message.reply_text(
            "I didn't catch that. Please reply with improvement, new feature, question, or other."
        )
        return FEEDBACK_TYPE
    data["request_type"] = normalized
    _record_feedback_step(data, update, "request_type", request_type_input)
    await message.reply_text(
        "Q3/7: What problem or pain point are you trying to solve?"
    )
    return FEEDBACK_PROBLEM


async def feedback_collect_problem(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data = _get_active_feedback(context)
    message = update.message
    if data is None or message is None:
        if message:
            await message.reply_text("Feedback session expired. Use /feedback to start again.")
        context.user_data.pop("feedback_report", None)
        return ConversationHandler.END
    problem = (message.text or "").strip()
    if not problem:
        await message.reply_text("Describe the problem this change will address.")
        return FEEDBACK_PROBLEM
    data["problem_statement"] = problem
    _record_feedback_step(data, update, "problem_statement", problem)
    await message.reply_text(
        "Q4/7: Do you have a proposed solution or idea for how we should address it?"
    )
    return FEEDBACK_SOLUTION


async def feedback_collect_solution(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data = _get_active_feedback(context)
    message = update.message
    if data is None or message is None:
        if message:
            await message.reply_text("Feedback session expired. Use /feedback to start again.")
        context.user_data.pop("feedback_report", None)
        return ConversationHandler.END
    solution = (message.text or "").strip()
    data["proposed_solution"] = solution
    _record_feedback_step(data, update, "proposed_solution", solution or "(unspecified)")
    await message.reply_text(
        "Q5/7: What benefits or outcomes do you expect if we build this?"
    )
    return FEEDBACK_BENEFIT


async def feedback_collect_benefit(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data = _get_active_feedback(context)
    message = update.message
    if data is None or message is None:
        if message:
            await message.reply_text("Feedback session expired. Use /feedback to start again.")
        context.user_data.pop("feedback_report", None)
        return ConversationHandler.END
    benefits = (message.text or "").strip()
    if not benefits:
        await message.reply_text("Share the benefits or outcomes you expect.")
        return FEEDBACK_BENEFIT
    data["benefits"] = benefits
    _record_feedback_step(data, update, "benefits", benefits)
    await message.reply_text(
        "Q6/7: Who is primarily impacted? Reply with external, internal, or unknown."
    )
    return FEEDBACK_AUDIENCE


async def feedback_collect_audience(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data = _get_active_feedback(context)
    message = update.message
    if data is None or message is None:
        if message:
            await message.reply_text("Feedback session expired. Use /feedback to start again.")
        context.user_data.pop("feedback_report", None)
        return ConversationHandler.END
    audience_input = (message.text or "").strip()
    audience = _normalize_feedback_audience(audience_input)
    if not audience:
        await message.reply_text(
            "Please respond with external, internal, or unknown to describe the audience."
        )
        return FEEDBACK_AUDIENCE
    data["audience"] = audience
    _record_feedback_step(data, update, "audience", audience_input)
    await message.reply_text(
        "Q7/7: Share any links, notes, or references (comma separated). Reply with 'none' if not applicable."
    )
    return FEEDBACK_LINKS


async def feedback_collect_links(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    data = _get_active_feedback(context)
    message = update.message
    if data is None or message is None:
        if message:
            await message.reply_text("Feedback session expired. Use /feedback to start again.")
        context.user_data.pop("feedback_report", None)
        return ConversationHandler.END
    raw_links = (message.text or "").strip()
    if raw_links.lower() in {"none", "n/a", "na", "skip"}:
        links: List[str] = []
    else:
        splits = [part.strip() for part in raw_links.replace("\n", ",").split(",")]
        links = [entry for entry in splits if entry]
    data["supporting_links"] = links
    display_value = ", ".join(links) if links else "(none)"
    _record_feedback_step(data, update, "supporting_links", display_value)

    fb_dir = _persist_feedback_submission(data)
    context.user_data.pop("feedback_report", None)

    relative_dir = fb_dir.relative_to(REPO_ROOT)
    await message.reply_text(
        f"Thanks! Feedback `{data['feedback_id']}` is queued for review.\n"
        f"Artifacts live under `{relative_dir}`.",
        parse_mode="Markdown",
    )
    try:
        await _trigger_workflow_after_submission(update, context)
    except Exception:  # noqa: BLE001
        logging.exception("Failed to auto-start workflow after feedback submission")
        await message.reply_text(
            "Feedback recorded, but automatic workflow start failed. Use /workflow_start to run it manually."
        )
    return ConversationHandler.END


async def feedback_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.pop("feedback_report", None)
    if update.message:
        await update.message.reply_text("Feedback submission cancelled. Use /feedback to start again.")
    return ConversationHandler.END


def _cleanup_finished_process() -> None:
    global WORKFLOW_PROCESS, WORKFLOW_LOG_HANDLE, WORKFLOW_LOG_PATH
    global LAST_WORKFLOW_LOG_PATH, LAST_WORKFLOW_EXIT_CODE
    if WORKFLOW_PROCESS and WORKFLOW_PROCESS.poll() is not None:
        LAST_WORKFLOW_EXIT_CODE = WORKFLOW_PROCESS.returncode
        if WORKFLOW_LOG_HANDLE:
            WORKFLOW_LOG_HANDLE.flush()
        WORKFLOW_LOG_HANDLE.close()
    LAST_WORKFLOW_LOG_PATH = WORKFLOW_LOG_PATH
    WORKFLOW_PROCESS = None
    WORKFLOW_LOG_HANDLE = None
    WORKFLOW_LOG_PATH = None


def _cancel_workflow_monitor() -> None:
    global WORKFLOW_MONITOR_TASK
    task = WORKFLOW_MONITOR_TASK
    if task and not task.done():
        task.cancel()
    WORKFLOW_MONITOR_TASK = None


def _register_workflow_observer(chat_id: int, application) -> None:
    WORKFLOW_SUBSCRIBERS.add(chat_id)
    _ensure_workflow_monitor(application)


def _ensure_workflow_monitor(application) -> None:
    global WORKFLOW_MONITOR_TASK
    if WORKFLOW_MONITOR_TASK and not WORKFLOW_MONITOR_TASK.done():
        return
    process = WORKFLOW_PROCESS
    if process is None:
        return
    WORKFLOW_MONITOR_TASK = application.create_task(_wait_for_workflow_exit(application, process))


async def _wait_for_workflow_exit(application, process: subprocess.Popen[str]) -> None:
    global WORKFLOW_MONITOR_TASK
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, process.wait)
        async with WORKFLOW_LOCK:
            _cleanup_finished_process()
            exit_code = LAST_WORKFLOW_EXIT_CODE
            log_path = LAST_WORKFLOW_LOG_PATH
        await _broadcast_workflow_idle(application, exit_code, log_path)
    except asyncio.CancelledError:
        return
    finally:
        WORKFLOW_MONITOR_TASK = None


def _compose_workflow_idle_message(exit_code: Optional[int], log_path: Optional[Path]) -> str:
    log_display = _format_log_path(log_path)
    if exit_code is None:
        status_line = f"⚠️ Workflow stopped. Logs: {log_display}"
    elif exit_code == 0:
        status_line = f"✅ Workflow completed (exit code {exit_code}). Logs: {log_display}"
    else:
        status_line = f"⚠️ Workflow exited with code {exit_code}. Logs: {log_display}"

    lines = [status_line]
    try:
        summary = _build_status_message()
    except Exception as exc:  # noqa: BLE001
        logging.exception("Failed to build status summary after workflow exit")
        lines.append(f"Status summary unavailable: {exc}")
    else:
        lines.append("")
        lines.append(summary)
        lines.append("")
        lines.append("Use /workflow_start to resume once issues are resolved.")
    return "\n".join(lines)


async def _broadcast_workflow_idle(application, exit_code: Optional[int], log_path: Optional[Path]) -> None:
    if not WORKFLOW_SUBSCRIBERS:
        return
    message = _compose_workflow_idle_message(exit_code, log_path)
    for chat_id in list(WORKFLOW_SUBSCRIBERS):
        try:
            await application.bot.send_message(chat_id, message)
        except Exception:  # noqa: BLE001
            logging.exception("Failed to notify chat %s about workflow status", chat_id)


async def _edit_menu_message(query, text: str, reply_markup: InlineKeyboardMarkup) -> None:
    try:
        await query.edit_message_text(text, reply_markup=reply_markup)
    except BadRequest as exc:
        if "message is not modified" in str(exc).lower():
            return
        raise


async def _start_workflow_core(
    *,
    context: ContextTypes.DEFAULT_TYPE,
    chat_id: int,
    extra_args: List[str],
    args_text: str,
    send: Callable[[str], Awaitable[Any]],
) -> None:
    global WORKFLOW_PROCESS, WORKFLOW_LOG_HANDLE, WORKFLOW_LOG_PATH

    _cancel_workflow_monitor()

    async with WORKFLOW_LOCK:
        _cleanup_finished_process()
        if WORKFLOW_PROCESS and WORKFLOW_PROCESS.poll() is None:
            log_path = _format_log_path(WORKFLOW_LOG_PATH)
            await send(f"Workflow already running (PID {WORKFLOW_PROCESS.pid}). Logs: {log_path}")
            WORKFLOW_SUBSCRIBERS.add(chat_id)
            _ensure_workflow_monitor(context.application)
            return

        workflow_script = PLATFORM_DIR / "automation" / "workflow.py"
        if not workflow_script.exists():
            await send(f"Workflow script not found at {workflow_script}")
            return

        chat_dir = ensure_chat_dir(chat_id)
        workflow_dir = chat_dir / "workflow"
        workflow_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        log_path = workflow_dir / f"workflow-{timestamp}.log"

        command = [
            sys.executable,
            str(workflow_script),
            "--workspace",
            str(REPO_ROOT),
        ]
        command.extend(extra_args)

        log_handle = log_path.open("w", encoding="utf-8")
        try:
            process = subprocess.Popen(
                command,
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                cwd=REPO_ROOT,
                text=True,
            )
        except Exception as exc:  # noqa: BLE001
            log_handle.close()
            await send(f"Failed to start workflow: {exc}")
            return

        WORKFLOW_PROCESS = process
        WORKFLOW_LOG_HANDLE = log_handle
        WORKFLOW_LOG_PATH = log_path

        args_note = f" with args: {args_text}" if args_text else ""
        log_display = _format_log_path(log_path)
        await send(f"Workflow started (PID {process.pid}){args_note}. Logs: {log_display}")
        if LAST_WORKFLOW_EXIT_CODE is not None and LAST_WORKFLOW_LOG_PATH:
            last_log = _format_log_path(LAST_WORKFLOW_LOG_PATH)
            await send(
                f"Previous run exited with code {LAST_WORKFLOW_EXIT_CODE}. Logs: {last_log}"
            )

    if chat_id:
        _register_workflow_observer(chat_id, context.application)


async def _stop_workflow_core(
    *,
    context: ContextTypes.DEFAULT_TYPE,
    chat_id: int,
    send: Callable[[str], Awaitable[Any]],
) -> None:
    global WORKFLOW_PROCESS

    WORKFLOW_SUBSCRIBERS.add(chat_id)

    async with WORKFLOW_LOCK:
        _cleanup_finished_process()
        if WORKFLOW_PROCESS is None:
            if LAST_WORKFLOW_LOG_PATH:
                last_log = _format_log_path(LAST_WORKFLOW_LOG_PATH)
                if LAST_WORKFLOW_EXIT_CODE is not None:
                    await send(
                        f"No workflow process running. Last exit code: {LAST_WORKFLOW_EXIT_CODE}. Logs: {last_log}"
                    )
                else:
                    await send(f"No workflow process running. Logs: {last_log}")
            else:
                await send("No workflow process running.")
            return

        process = WORKFLOW_PROCESS
        log_path = _format_log_path(WORKFLOW_LOG_PATH)

        if process.poll() is not None:
            exit_code = process.returncode
            _cleanup_finished_process()
            await send(f"Workflow already stopped (exit code {exit_code}). Logs: {log_path}")
            return

        process.terminate()
        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(None, lambda: process.wait(timeout=15))
            terminated = "terminated"
        except subprocess.TimeoutExpired:
            process.kill()
            await loop.run_in_executor(None, process.wait)
            terminated = "killed"

        exit_code = process.returncode
        _cleanup_finished_process()
        await send(f"Workflow {terminated} (exit code {exit_code}). Logs: {log_path}")


async def menu_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query is None:
        return
    if not is_authorized(update):
        await query.answer("Unauthorized", show_alert=True)
        return

    data = query.data or ""
    chat_data = context.chat_data
    active_agent = chat_data.get("active_agent")
    active_task = chat_data.get("active_task")
    active_task_id = active_task.get("id") if isinstance(active_task, dict) else None

    if data == MAIN_MENU_CALLBACK:
        await _edit_menu_message(query, "Select an option:", build_main_menu(active_agent))
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer()
        return

    if data == STATUS_REFRESH_CALLBACK:
        await _edit_menu_message(query, "Select an option:", build_main_menu(active_agent))
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer("Status updated")
        return

    if data == WORKFLOW_START_CALLBACK:
        chat = update.effective_chat
        if chat is None:
            await query.answer("Chat unavailable", show_alert=True)
            return

        async def send(text: str) -> None:
            await context.bot.send_message(chat.id, text)

        await _start_workflow_core(
            context=context,
            chat_id=chat.id,
            extra_args=[],
            args_text="",
            send=send,
        )
        await query.answer("Workflow start requested")
        await _edit_menu_message(query, "Select an option:", build_main_menu(active_agent))
        return

    if data == WORKFLOW_STOP_CALLBACK:
        chat = update.effective_chat
        if chat is None:
            await query.answer("Chat unavailable", show_alert=True)
            return

        async def send(text: str) -> None:
            await context.bot.send_message(chat.id, text)

        await _stop_workflow_core(context=context, chat_id=chat.id, send=send)
        await query.answer("Workflow stop requested")
        await _edit_menu_message(query, "Select an option:", build_main_menu(active_agent))
        return

    if data == TASKS_MENU_CALLBACK:
        summary = _collect_task_states()
        total_pages = max(1, math.ceil(len(summary.get("all", [])) / max(1, TASK_PAGE_SIZE)))
        page = chat_data.get("tasks_page", 0)
        if page >= total_pages:
            page = 0
        chat_data["tasks_page"] = page
        text, markup = build_tasks_overview(summary, page=page, page_size=TASK_PAGE_SIZE)
        await _edit_menu_message(query, text, markup)
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer()
        return

    if data == BUGS_MENU_CALLBACK:
        bugs = _collect_bug_states()
        total_pages = max(1, math.ceil(len(bugs) / max(1, BUG_PAGE_SIZE)))
        page = chat_data.get("bugs_page", 0)
        if page >= total_pages:
            page = 0
        chat_data["bugs_page"] = page
        text, markup = build_bugs_overview(bugs, page=page, page_size=BUG_PAGE_SIZE)
        await _edit_menu_message(query, text, markup)
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer()
        return

    if data == FEEDBACK_MENU_CALLBACK:
        items = _collect_feedback_states()
        total_pages = max(1, math.ceil(len(items) / max(1, FEEDBACK_PAGE_SIZE)))
        page = chat_data.get("feedback_page", 0)
        if page >= total_pages:
            page = 0
        chat_data["feedback_page"] = page
        text, markup = build_feedback_overview(items, page=page, page_size=FEEDBACK_PAGE_SIZE)
        await _edit_menu_message(query, text, markup)
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer()
        return

    if data.startswith(TASKS_PAGE_PREFIX):
        summary = _collect_task_states()
        try:
            requested_page = int(data[len(TASKS_PAGE_PREFIX) :])
        except ValueError:
            requested_page = 0
        total_pages = max(1, math.ceil(len(summary.get("all", [])) / max(1, TASK_PAGE_SIZE)))
        page = requested_page % total_pages
        chat_data["tasks_page"] = page
        text, markup = build_tasks_overview(summary, page=page, page_size=TASK_PAGE_SIZE)
        await _edit_menu_message(query, text, markup)
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer(f"Page {page + 1}/{total_pages}")
        return

    if data.startswith(BUGS_PAGE_PREFIX):
        bugs = _collect_bug_states()
        try:
            requested_page = int(data[len(BUGS_PAGE_PREFIX) :])
        except ValueError:
            requested_page = 0
        total_pages = max(1, math.ceil(len(bugs) / max(1, BUG_PAGE_SIZE)))
        page = requested_page % total_pages
        chat_data["bugs_page"] = page
        text, markup = build_bugs_overview(bugs, page=page, page_size=BUG_PAGE_SIZE)
        await _edit_menu_message(query, text, markup)
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer(f"Page {page + 1}/{total_pages}")
        return

    if data.startswith(FEEDBACK_PAGE_PREFIX):
        items = _collect_feedback_states()
        try:
            requested_page = int(data[len(FEEDBACK_PAGE_PREFIX) :])
        except ValueError:
            requested_page = 0
        total_pages = max(1, math.ceil(len(items) / max(1, FEEDBACK_PAGE_SIZE)))
        page = requested_page % total_pages
        chat_data["feedback_page"] = page
        text, markup = build_feedback_overview(items, page=page, page_size=FEEDBACK_PAGE_SIZE)
        await _edit_menu_message(query, text, markup)
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer(f"Page {page + 1}/{total_pages}")
        return

    if data.startswith(TASK_DETAIL_PREFIX):
        task_id = data[len(TASK_DETAIL_PREFIX) :]
        summary = _collect_task_states()
        task = next((item for item in summary.get("all", []) if item.get("id") == task_id), None)
        if task is None:
            await query.answer("Task not found", show_alert=True)
            return
        chat_data["_last_task_detail"] = task
        text, markup = build_task_detail(
            task,
            active_task_id,
            chat_data.get("task_chat_task_id"),
        )
        await _edit_menu_message(query, text, markup)
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer()
        return

    if data.startswith(BUG_DETAIL_PREFIX):
        bug_id = data[len(BUG_DETAIL_PREFIX) :]
        bugs = _collect_bug_states()
        bug = next((item for item in bugs if item.get("id") == bug_id), None)
        if bug is None:
            await query.answer("Bug not found", show_alert=True)
            return
        chat_data["_last_bug_detail"] = bug
        text, markup = build_bug_detail(bug)
        await _edit_menu_message(query, text, markup)
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer()
        return

    if data.startswith(FEEDBACK_DETAIL_PREFIX):
        feedback_id = data[len(FEEDBACK_DETAIL_PREFIX) :]
        items = _collect_feedback_states()
        item = next((entry for entry in items if entry.get("id") == feedback_id), None)
        if item is None:
            await query.answer("Feedback not found", show_alert=True)
            return
        chat_data["_last_feedback_detail"] = item
        text, markup = build_feedback_detail(item)
        await _edit_menu_message(query, text, markup)
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer()
        return

    if data == TASK_CONTEXT_CLEAR:
        chat_data.pop("active_task", None)
        task = chat_data.get("_last_task_detail")
        if isinstance(task, dict):
            text, markup = build_task_detail(
                task,
                None,
                chat_data.get("task_chat_task_id"),
            )
            await _edit_menu_message(query, text, markup)
            context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer("Cleared active task")
        return

    if data.startswith(TASK_CONTEXT_PREFIX):
        task_id = data[len(TASK_CONTEXT_PREFIX) :]
        summary = _collect_task_states()
        task = next((item for item in summary.get("all", []) if item.get("id") == task_id), None)
        if task is None:
            await query.answer("Task not found", show_alert=True)
            return
        chat_data["active_task"] = task
        chat_data["_last_task_detail"] = task
        text, markup = build_task_detail(
            task,
            task_id,
            chat_data.get("task_chat_task_id"),
        )
        await _edit_menu_message(query, text, markup)
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer(f"Active task set to {task_id}")
        return

    if data.startswith(TASK_CHAT_PREFIX):
        task_id = data[len(TASK_CHAT_PREFIX) :]
        summary = _collect_task_states()
        task = next((item for item in summary.get("all", []) if item.get("id") == task_id), None)
        if task is None:
            await query.answer("Task not found", show_alert=True)
            return
        session_id = _find_task_agent_session(task_id)
        if not session_id:
            await query.answer("No agent session found", show_alert=True)
            return
        chat = update.effective_chat
        if chat is None:
            await query.answer("Chat unavailable", show_alert=True)
            return
        chat_dir = ensure_chat_dir(chat.id)
        session_path = chat_dir / f"session-task-{task_id.lower()}.txt"
        session_path.write_text(session_id, encoding="utf-8")
        chat_data["task_chat_session_path"] = str(session_path)
        chat_data["task_chat_task_id"] = task_id
        chat_data["task_chat_label"] = f"task-{task_id.lower()}"
        chat_data.pop("active_agent", None)
        chat_data["_last_task_detail"] = task
        text, markup = build_task_detail(
            task,
            active_task_id,
            task_id,
        )
        await _edit_menu_message(query, text, markup)
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer("Agent chat activated")
        return

    if data == TASK_CHAT_STOP:
        session_path_value = chat_data.pop("task_chat_session_path", None)
        chat_data.pop("task_chat_task_id", None)
        chat_data.pop("task_chat_label", None)
        if session_path_value:
            try:
                session_path_obj = Path(session_path_value)
                if session_path_obj.exists():
                    session_path_obj.unlink()
            except Exception:  # noqa: BLE001
                pass
        task = chat_data.get("_last_task_detail")
        active_task = chat_data.get("active_task")
        active_task_id_local = active_task.get("id") if isinstance(active_task, dict) else None
        if isinstance(task, dict):
            text, markup = build_task_detail(
                task,
                active_task_id_local,
                None,
            )
            await _edit_menu_message(query, text, markup)
            context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer("Agent chat cleared")
        return

    if data.startswith(TASK_MARK_COMPLETE_PREFIX):
        task_id = data[len(TASK_MARK_COMPLETE_PREFIX) :]
        summary = _collect_task_states()
        task = next((item for item in summary.get("all", []) if item.get("id") == task_id), None)
        if task is None:
            await query.answer("Task not found", show_alert=True)
            return
        _mark_task_completed(task_id)
        summary = _collect_task_states()
        updated_task = next(
            (item for item in summary.get("all", []) if item.get("id") == task_id), None
        )
        if updated_task is None:
            await query.answer("Task not found", show_alert=True)
            return
        chat_data["_last_task_detail"] = updated_task
        active_task = chat_data.get("active_task")
        if isinstance(active_task, dict) and active_task.get("id") == task_id:
            chat_data["active_task"] = updated_task
            active_task_id = task_id
        else:
            active_task_id = active_task.get("id") if isinstance(active_task, dict) else None
        text, markup = build_task_detail(
            updated_task,
            active_task_id,
            chat_data.get("task_chat_task_id"),
        )
        await _edit_menu_message(query, text, markup)
        context.chat_data["menu_message_id"] = query.message.message_id
        await query.answer("Task marked completed")
        return

    if data == AGENTS_MENU_CALLBACK:
        await _edit_menu_message(query, "Choose an agent to activate:", build_agents_menu(active_agent))
        await query.answer()
        return

    if data == AGENT_CLEAR_CALLBACK:
        chat_data.pop("active_agent", None)
        await _edit_menu_message(query, "Agent selection cleared.", build_agents_menu(None))
        await query.answer("Agent cleared")
        return

    if data.startswith(AGENT_SELECT_PREFIX):
        payload = data[len(AGENT_SELECT_PREFIX) :]
        try:
            prompt_number = int(payload)
        except ValueError:
            await query.answer("Unknown selection", show_alert=True)
            return
        chat_data["active_agent"] = prompt_number
        description = PROMPT_DESCRIPTIONS.get(prompt_number, f"Prompt {prompt_number}")
        await _edit_menu_message(query, f"Active agent: {description}.", build_agents_menu(prompt_number))
        await query.answer("Agent enabled")
        return

    await query.answer("Unsupported action", show_alert=True)

def _format_log_path(path: Optional[Path]) -> str:
    if not path:
        return "(no log recorded)"
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def handle_prompt_command_factory(command_name: str):
    prompt_number = PROMPT_COMMANDS[command_name]

    async def handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not is_authorized(update):
            return
        if update.message is None:
            return
        chat_id = update.effective_chat.id
        chat_dir = ensure_chat_dir(chat_id)
        message = parse_command_argument(update.message.text)
        if not message:
            await update.message.reply_text(f"Usage: /{command_name} <message>")
            return
        session_path = get_prompt_session_path(prompt_number)
        if not session_path.exists():
            await update.message.reply_text(
                "No stored session for this agent. Run the main workflow first (prompt {}).".format(
                    prompt_number
                )
            )
            return
        await process_prompt(
            update,
            chat_dir,
            message,
            session_path=session_path,
            log_label=command_name,
        )

    return handler

def build_prompt(user_message: str, response_path: Path) -> str:
    prompt = PROMPT_TEMPLATE.replace("<<<USER_MESSAGE>>>", user_message.strip())
    prompt = prompt.replace("<<<RESPONSE_PATH>>>", str(response_path))
    prompt = prompt.replace("<<REPO_ROOT>>", str(REPO_ROOT))
    return prompt


def extract_session_id(output: str) -> Optional[str]:
    for line in output.splitlines():
        line = line.strip()
        lower = line.lower()
        if lower.startswith("session id:") or lower.startswith("thread id:"):
            return line.split(":", 1)[1].strip()
    return None


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        return
    chat_id = update.effective_chat.id
    chat_dir = ensure_chat_dir(chat_id)
    session_file = chat_dir / "session.txt"
    response_file = chat_dir / "response.md"
    if response_file.exists():
        response_file.unlink()
    if session_file.exists():
        msg = "Resuming existing Codex session. Send a message to continue the conversation."
    else:
        msg = "Started a fresh Codex session. Send your first message to begin."
    await update.message.reply_text(msg)
    await update.message.reply_text("Need the UI? Use /menu to open the dashboard.")


async def menu_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        return
    chat = update.effective_chat
    if chat is None:
        return
    chat_dir = ensure_chat_dir(chat.id)
    session_file = chat_dir / "session.txt"
    if not session_file.exists():
        session_file.write_text("", encoding="utf-8")
    text = "Select an option:"
    markup = build_main_menu(context.chat_data.get("active_agent"))
    menu_message_id = context.chat_data.get("menu_message_id")
    if menu_message_id:
        try:
            await context.bot.edit_message_text(
                chat_id=chat.id,
                message_id=menu_message_id,
                text=text,
                reply_markup=markup,
            )
            return
        except BadRequest:
            context.chat_data.pop("menu_message_id", None)

    message = await update.message.reply_text(text, reply_markup=markup)
    context.chat_data["menu_message_id"] = message.message_id
    await update.message.reply_text(
        "Select an option:", reply_markup=build_main_menu(context.chat_data.get("active_agent"))
    )


async def stop(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        return
    chat_id = update.effective_chat.id
    chat_dir = ensure_chat_dir(chat_id)
    session_file = chat_dir / "session.txt"
    if session_file.exists():
        session_file.unlink()
    context.chat_data.pop("active_agent", None)
    context.chat_data.pop("active_task", None)
    context.chat_data.pop("_last_task_detail", None)
    await update.message.reply_text("Session cleared. Use /start to begin again.")


async def end_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        return
    if update.message is None:
        return
    cleared_agent = context.chat_data.pop("active_agent", None) is not None
    cleared_task = context.chat_data.pop("active_task", None) is not None
    context.chat_data.pop("_last_task_detail", None)
    if cleared_agent and cleared_task:
        msg = "Cleared active agent and task context."
    elif cleared_agent:
        msg = "Cleared active agent."
    elif cleared_task:
        msg = "Cleared active task context."
    else:
        msg = "No active agent or task context was set."
    await update.message.reply_text(msg)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        return
    if update.message is None:
        return
    alias_lines = []
    for prompt_number, aliases in PROMPT_ALIAS_MAP.items():
        primary = aliases[0]
        others = ", ".join(f"/{alias}" for alias in aliases[1:]) if len(aliases) > 1 else ""
        description = PROMPT_DESCRIPTIONS.get(prompt_number, "Agent")
        line = f"/{primary} <msg> — {description}"
        if others:
            line += f" (aliases: {others})"
        alias_lines.append(line)
    agent_commands = "\n".join(alias_lines)

    help_text = (
        "Available commands:\n"
        "/start — Start or resume a general Codex chat session for this chat.\n"
        "/menu — Open the interactive dashboard menu.\n"
        "/stop — Clear the stored Codex chat session state.\n"
        "/end — Clear the active agent and task context selections.\n"
        "/refresh — Tell Codex the environment was refreshed and resume the existing session.\n"
        "/status — Show current workflow stage and task summary.\n"
        "/bug — Guided flow to report a bug.\n"
        "/feedback — Guided flow to suggest improvements or new features.\n"
        "/workflow_start <args> — Launch platform/automation/workflow.py with optional CLI arguments.\n"
        "/workflow_stop — Terminate the active workflow process (if any).\n"
        "Use the /start menu to browse 🐞 Bugs and 💡 Feedback lists.\n"
        "Agent shortcuts:\n"
        f"{agent_commands}\n"
        "Sending any other text continues the session. Use the inline menu after /start to browse tasks and toggle agents."
    )
    await update.message.reply_text(help_text)


async def workflow_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        return
    if update.message is None:
        return
    chat = update.effective_chat
    if chat is None:
        return

    args_text = parse_command_argument(update.message.text)
    try:
        extra_args = shlex.split(args_text) if args_text else []
    except ValueError as exc:
        await update.message.reply_text(f"Could not parse arguments: {exc}")
        return

    async def send(text: str) -> None:
        await update.message.reply_text(text)

    await _start_workflow_core(
        context=context,
        chat_id=chat.id,
        extra_args=extra_args,
        args_text=args_text,
        send=send,
    )


async def workflow_stop(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        return
    if update.message is None:
        return
    chat = update.effective_chat
    if chat is None:
        return

    async def send(text: str) -> None:
        await update.message.reply_text(text)

    await _stop_workflow_core(context=context, chat_id=chat.id, send=send)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message is None or update.message.text is None:
        return
    if not is_authorized(update):
        return
    chat_id = update.effective_chat.id
    chat_dir = ensure_chat_dir(chat_id)
    chat_data = context.chat_data
    user_text = update.message.text

    active_task = chat_data.get("active_task")
    if isinstance(active_task, dict) and active_task.get("id"):
        task_lines = [f"Task context: {active_task['id']}"]
        if active_task.get("title"):
            task_lines.append(f"Title: {active_task['title']}")
        user_text = "\n".join(task_lines + ["", user_text])

    process_kwargs: Dict[str, Any] = {"log_label": "general"}
    task_chat_path_value = chat_data.get("task_chat_session_path")
    if task_chat_path_value:
        session_path = Path(task_chat_path_value)
        if session_path.exists():
            process_kwargs["session_path"] = session_path
            process_kwargs["log_label"] = chat_data.get("task_chat_label", "task-chat")
        else:
            chat_data.pop("task_chat_session_path", None)
            chat_data.pop("task_chat_task_id", None)
            chat_data.pop("task_chat_label", None)

    if "session_path" not in process_kwargs:
        active_agent = chat_data.get("active_agent")
        if active_agent is not None:
            session_path = get_prompt_session_path(active_agent)
            if not session_path.exists():
                context.chat_data.pop("active_agent", None)
                await update.message.reply_text(
                    (
                        "No stored session for this agent. Run the main workflow first (prompt {}). "
                        "Agent selection has been cleared."
                    ).format(active_agent)
                )
                return
            process_kwargs["session_path"] = session_path
            process_kwargs["log_label"] = f"agent{active_agent}"

    await process_prompt(update, chat_dir, user_text, **process_kwargs)


async def refresh(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        return
    if update.message is None:
        return
    chat_id = update.effective_chat.id
    chat_dir = ensure_chat_dir(chat_id)
    session_file = chat_dir / "session.txt"
    if not session_file.exists():
        await update.message.reply_text(
            "No existing session to refresh. Use /start first to establish a Codex session."
        )
        return

    system_message = (
        "System notice: the operator refreshed the CLI environment. Assume any previous long-running "
        "commands were interrupted. Confirm readiness and summarize any context you still recall."
    )
    await process_prompt(
        update,
        chat_dir,
        system_message,
        session_path=session_file,
        log_label="refresh",
    )


async def process_prompt(
    update: Update,
    chat_dir: Path,
    user_text: str,
    *,
    session_path: Path | None = None,
    log_label: str = "general",
) -> None:
    if session_path is None:
        session_path = chat_dir / "session.txt"
    session_path.parent.mkdir(parents=True, exist_ok=True)
    response_file = chat_dir / "response.md"
    logs_file = chat_dir / f"codex-{log_label}.log"

    response_file.write_text("", encoding="utf-8")

    session_id = session_path.read_text(encoding="utf-8").strip() if session_path.exists() else None
    prompt = build_prompt(user_text, response_file)

    command = [
        "codex",
        "--dangerously-bypass-approvals-and-sandbox",
        "exec",
        "--sandbox",
        "danger-full-access",
        "--skip-git-repo-check",
        "--cd",
        str(REPO_ROOT),
    ]
    if session_id:
        command.extend(["resume", session_id])

    process = subprocess.run(
        command,
        input=prompt,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    logs_file.parent.mkdir(parents=True, exist_ok=True)
    with logs_file.open("a", encoding="utf-8") as log:
        log.write("\n--- Message ---\n")
        log.write(prompt + "\n")
        log.write("--- STDOUT ---\n")
        log.write(process.stdout)
        log.write("\n--- STDERR ---\n")
        log.write(process.stderr)
        log.write("\n")

    if process.returncode != 0:
        snippet = process.stderr.strip() or process.stdout.strip()
        if snippet:
            snippet = "\n" + snippet[-500:]
        if update.message:
            await update.message.reply_text(
                "Codex command failed (return code {}).{}".format(process.returncode, snippet or "")
            )
        return

    new_session = extract_session_id(process.stdout)
    if new_session:
        session_path.write_text(new_session, encoding="utf-8")

    if not response_file.exists() or not response_file.read_text(encoding="utf-8").strip():
        if update.message:
            await update.message.reply_text(
                "Codex did not write a response. Check logs with ./devops/logs.sh or inspect {}.".format(
                    shlex.quote(str(logs_file.relative_to(REPO_ROOT)))
                )
            )
        return

    text = response_file.read_text(encoding="utf-8")
    if update.message:
        await update.message.reply_text(text, parse_mode="Markdown")


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit("TELEGRAM_BOT_TOKEN environment variable is required")

    TELEGRAM_BASE_DIR.mkdir(parents=True, exist_ok=True)

    application = ApplicationBuilder().token(token).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("menu", menu_command))
    application.add_handler(CommandHandler("stop", stop))
    application.add_handler(CommandHandler("end", end_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("refresh", refresh))
    application.add_handler(CommandHandler("status", status_command))
    application.add_handler(CommandHandler("workflow_start", workflow_start))
    application.add_handler(CommandHandler("workflow_stop", workflow_stop))
    bug_handler = ConversationHandler(
        entry_points=[CommandHandler("bug", bug_start)],
        states={
            BUG_SUMMARY: [MessageHandler(filters.TEXT & ~filters.COMMAND, bug_collect_summary)],
            BUG_SEVERITY: [MessageHandler(filters.TEXT & ~filters.COMMAND, bug_collect_severity)],
            BUG_EXPECTED: [MessageHandler(filters.TEXT & ~filters.COMMAND, bug_collect_expected)],
            BUG_OBSERVED: [MessageHandler(filters.TEXT & ~filters.COMMAND, bug_collect_observed)],
            BUG_REPRO: [MessageHandler(filters.TEXT & ~filters.COMMAND, bug_collect_repro)],
            BUG_ENV: [MessageHandler(filters.TEXT & ~filters.COMMAND, bug_collect_environment)],
        },
        fallbacks=[CommandHandler("cancel", bug_cancel)],
        allow_reentry=True,
    )
    application.add_handler(bug_handler)
    feedback_handler = ConversationHandler(
        entry_points=[CommandHandler("feedback", feedback_start)],
        states={
            FEEDBACK_SUMMARY: [MessageHandler(filters.TEXT & ~filters.COMMAND, feedback_collect_summary)],
            FEEDBACK_TYPE: [MessageHandler(filters.TEXT & ~filters.COMMAND, feedback_collect_type)],
            FEEDBACK_PROBLEM: [MessageHandler(filters.TEXT & ~filters.COMMAND, feedback_collect_problem)],
            FEEDBACK_SOLUTION: [MessageHandler(filters.TEXT & ~filters.COMMAND, feedback_collect_solution)],
            FEEDBACK_BENEFIT: [MessageHandler(filters.TEXT & ~filters.COMMAND, feedback_collect_benefit)],
            FEEDBACK_AUDIENCE: [MessageHandler(filters.TEXT & ~filters.COMMAND, feedback_collect_audience)],
            FEEDBACK_LINKS: [MessageHandler(filters.TEXT & ~filters.COMMAND, feedback_collect_links)],
        },
        fallbacks=[CommandHandler("cancel", feedback_cancel)],
        allow_reentry=True,
    )
    application.add_handler(feedback_handler)
    for command_name in sorted(PROMPT_COMMANDS):
        application.add_handler(
            CommandHandler(command_name, handle_prompt_command_factory(command_name))
        )
    application.add_handler(CallbackQueryHandler(menu_callback))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    application.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
