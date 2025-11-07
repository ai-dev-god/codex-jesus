#!/usr/bin/env python3
"""
Automation workflow for running Codex prompts headlessly.

This script orchestrates the staged workflow defined in automation/agents:
0. Intake PM (PRD)
1. Research
2. Solution Architecture
3. API Design
4. UX & Flows
5. Planner (task DAG)
6. Scaffolder (DevOps)
7. Task execution loop driven by BACKLOG/backlog.json

Each primary agent run is followed by manager validation (and optional QA) to
ensure deliverables satisfy UPDATE.md requirements before progressing to the
next gate.
"""

from __future__ import annotations

import argparse
import heapq
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parent.parent))

from automation.agents import get_supporting_prompt, load_primary_prompt_specs
from automation.agents.base import PromptSpec
from automation.agents.manager import agent as manager_agent
from automation.agents.qa import agent as qa_agent
from automation.config import ensure_workspace_paths, parse_args, read_project_idea
from automation.errors import InvalidAgentResponseError, WorkflowError
from automation.parsing import read_agent_output
from automation.paths import PROJECT_IDEA_FILE, SESSIONS_DIR, BACKLOG_FILE, BUGS_DIR, FEEDBACK_DIR
from automation.runner import CodexRunResult, CodexRunner
from automation.tasks import TaskEntry


class Workflow:
    OWNER_TOKEN_MAP: Dict[str, str] = {
        "moduledev": "module_developer",
        "moduledeveloper": "module_developer",
        "dev": "module_developer",
        "developer": "module_developer",
        "coder": "module_developer",
        "engineer": "module_developer",
        "test": "test_engineer",
        "qa": "test_engineer",
        "tester": "test_engineer",
        "testengineer": "test_engineer",
        "codereviewer": "code_reviewer",
        "reviewer": "code_reviewer",
        "review": "code_reviewer",
        "security": "security",
        "compliance": "security",
        "securitycompliance": "security",
        "perf": "perf",
        "performance": "perf",
        "resilience": "perf",
        "release": "release",
        "devops": "release",
        "deployment": "release",
        "deploy": "release",
        "ops": "release",
        "scaffolder": "scaffolder_support",
        "scaffold": "scaffolder_support",
        "scaffolding": "scaffolder_support",
        "bootstrap": "scaffolder_support",
        "doc": "doc_writer",
        "docs": "doc_writer",
        "documentation": "doc_writer",
        "writer": "doc_writer",
        "scribe": "doc_writer",
        "metagrader": "meta_grader",
        "grader": "meta_grader",
        "meta": "meta_grader",
        "playwright": "playwright_runner",
        "e2e": "playwright_runner",
        "browser": "playwright_runner",
        "browser-test": "playwright_runner",
        "playwrightrunner": "playwright_runner",
        "bug": "bug_intake",
        "bugreport": "bug_intake",
        "bugintake": "bug_intake",
        "bugtriage": "bug_triage",
        "bugrepro": "bug_repro",
        "bugreproduction": "bug_repro",
        "feedback": "feedback_intake",
        "suggestion": "feedback_intake",
        "feature": "feedback_intake",
        "productfeedback": "feedback_intake",
        "feedbackreview": "feedback_review",
        "feedbackplan": "feedback_plan",
    }
    def __init__(self, args: argparse.Namespace) -> None:
        self.workspace = Path(args.workspace).resolve()
        ensure_workspace_paths(self.workspace)

        self.prompts = list(load_primary_prompt_specs())
        if not self.prompts:
            raise WorkflowError("No primary prompt specifications were registered.")
        idea_path = self.workspace / PROJECT_IDEA_FILE

        if args.smoke_test:
            self.project_idea = ""
        else:
            try:
                self.project_idea = read_project_idea(args, default_path=idea_path)
            except WorkflowError:
                if args.skip_docs:
                    self.project_idea = ""
                else:
                    raise

        selected_model = args.model or "gpt-5-codex"
        if not args.allow_model_override and selected_model != "gpt-5-codex":
            raise WorkflowError(
                "This workflow requires the gpt-5-codex model. Pass --allow-model-override to bypass."
            )
        if args.reasoning_effort != "high" and not args.allow_model_override:
            raise WorkflowError(
                "High reasoning effort is mandatory unless --allow-model-override is provided."
            )

        self.runner = CodexRunner(
            workspace=self.workspace,
            artifacts_dir=(self.workspace / args.artifacts_dir),
            sandbox=args.sandbox,
            approval_policy=args.approval_policy,
            include_plan=args.include_plan,
            model=selected_model,
            reasoning_effort=args.reasoning_effort,
        )
        self.manager_model = args.manager_model
        self.skip_devops = getattr(args, "skip_devops", False)
        self.skip_docs = args.skip_docs
        self.skip_roadmap = args.skip_roadmap
        self.skip_backlog = args.skip_backlog
        self.skip_tasks = args.skip_tasks
        self.max_tasks = args.max_tasks
        self.reprocess_tasks = args.reprocess_tasks
        self.agent_retry_limit = max(0, args.agent_retries)
        self.manager_retry_limit = max(0, getattr(args, "manager_retries", 0))
        self.qa_retry_limit = max(0, getattr(args, "qa_retries", 0))
        self.smoke_test = args.smoke_test
        self.smoke_path = Path(args.smoke_path)
        self.force_devops = getattr(args, "force_devops", False)
        self.force_docs = args.force_docs
        self.force_roadmap = args.force_roadmap
        self.force_backlog = args.force_backlog
        self.mvp_mode = args.mvp_mode

        self.tasks_state_path = self.runner.artifacts_dir / "processed_tasks.json"
        self.processed_tasks = self._load_processed_tasks()
        self._bootstrap_processed_tasks()
        self.conversation_log_path = self.runner.artifacts_dir / "conversations.jsonl"
        self.bugs_dir = self.workspace / BUGS_DIR
        self.feedback_dir = self.workspace / FEEDBACK_DIR

    def _load_processed_tasks(self) -> set[str]:
        if self.tasks_state_path.exists():
            try:
                data = json.loads(self.tasks_state_path.read_text(encoding="utf-8"))
                return set(data)
            except json.JSONDecodeError:
                print(f"[warn] Could not parse {self.tasks_state_path}, starting fresh.")
        return set()

    def _save_processed_tasks(self) -> None:
        self.tasks_state_path.parent.mkdir(parents=True, exist_ok=True)
        with self.tasks_state_path.open("w", encoding="utf-8") as handle:
            json.dump(sorted(self.processed_tasks), handle, indent=2)

    def _bootstrap_processed_tasks(self) -> None:
        # No-op bootstrap; processed tasks persist via automation_artifacts.
        return

    def run(self) -> None:
        try:
            if self.smoke_test:
                self._run_smoke_test()
                return
            self._run_primary_chain()
            self._run_bug_pipeline()
            self._run_feedback_pipeline()
            if not self.skip_tasks:
                self._run_task_loop()
        except subprocess.CalledProcessError as exc:
            raise WorkflowError(f"Codex command failed with exit code {exc.returncode}") from exc

    def _run_primary_chain(self) -> None:
        DOC_CHAIN = {
            "Intake PM",
            "Researcher",
            "Solution Architect",
            "API Designer",
            "UX Designer",
        }
        for spec in self.prompts:
            if spec.name in DOC_CHAIN and self.skip_docs:
                continue
            if spec.name == "Planner" and (self.skip_backlog or self.skip_roadmap):
                continue
            if spec.name == "Scaffolder" and self.skip_devops:
                continue

            force = False
            if spec.name in DOC_CHAIN:
                force = self.force_docs
            elif spec.name == "Planner":
                force = self.force_backlog or self.force_roadmap
            elif spec.name == "Scaffolder":
                force = self.force_devops

            if not force and self._deliverables_have_content(spec.deliverables):
                print(
                    f"[skip] {spec.name} deliverables already populated; use force flag to regenerate."
                )
                continue

            context = self._build_context_for_spec(spec)
            self._run_prompt(spec=spec, context=context)

    def _run_prompt(self, *, spec: PromptSpec, context: str = "") -> None:
        prompt_text = self._get_prompt_text(spec=spec, context=context)

        base_label = f"prompts/prompt{spec.number}"
        agent_label = f"{base_label}/agent"
        manager_label = f"{base_label}/manager"
        self._execute_agent_flow(
            spec=spec,
            initial_prompt=prompt_text,
            agent_label=agent_label,
            manager_label=manager_label,
        )
        self._verify_deliverables(spec.deliverables)
        if spec.name == "Planner":
            self._validate_backlog_resource_constraints()

    def _run_manager_validation(
        self,
        *,
        spec: PromptSpec,
        original_prompt: str,
        attempt: int,
        label_base: str,
        task_id: Optional[str] = None,
        task_source: Optional[Path] = None,
        resume_session: Optional[str] = None,
        qa_review: Optional[dict] = None,
        qa_report_path: Optional[Path] = None,
    ) -> tuple[dict, CodexRunResult]:
        label = (
            label_base
            if attempt == 1
            else f"{label_base}-retry{attempt-1}"
        )
        execution_focus = spec.name == "Module Developer"
        devops_focus = spec.name == "Scaffolder"
        backlog_focus = spec.name == "Planner"

        manager_prompt = manager_agent.build_prompt(
            deliverables=spec.deliverables,
            original_instructions=original_prompt,
            execution_focus=execution_focus,
            devops_focus=devops_focus,
            backlog_focus=backlog_focus,
            include_next_actor=execution_focus,
            task_id=task_id,
            task_source=task_source,
            qa_review=qa_review,
            qa_report_path=qa_report_path,
            workspace=self.workspace,
        )

        manager_result = self.runner.run(
            manager_prompt,
            label=label,
            model_override=self.manager_model,
            resume_session=resume_session,
        )
        self._record_conversation(
            result=manager_result,
            role="manager",
            spec=spec,
            attempt=attempt,
            agent_label=label_base,
            task_id=task_id,
        )

        try:
            review = read_agent_output(manager_result.last_message_path, role="manager")
        except InvalidAgentResponseError as exc:
            exc.result = manager_result
            raise
        return review, manager_result

    def _run_qa_review(
        self,
        *,
        spec: PromptSpec,
        task_id: str,
        task_source: Path,
        agent_prompt: str,
        label_base: str,
        attempt: int,
        task_dir: Path,
        resume_session: Optional[str],
        context_notes: Optional[str],
    ) -> tuple[dict, CodexRunResult]:
        label = (
            label_base if attempt == 1 else f"{label_base}-retry{attempt-1}"
        )
        report_path = task_dir / "agent-report.md"

        qa_prompt = qa_agent.build_prompt(
            task_id=task_id,
            task_source=task_source,
            tracker_path=task_source,
            report_path=report_path,
            task_dir=task_dir,
            workspace=self.workspace,
            agent_prompt=agent_prompt,
            context_notes=context_notes,
        )

        qa_result = self.runner.run(
            qa_prompt,
            label=label,
            model_override=self.manager_model,
            resume_session=resume_session,
        )
        self._record_conversation(
            result=qa_result,
            role="qa",
            spec=spec,
            attempt=attempt,
            agent_label=label_base,
            task_id=task_id,
        )

        try:
            review = read_agent_output(qa_result.last_message_path, role="qa")
        except InvalidAgentResponseError as exc:
            exc.result = qa_result
            raise
        return review, qa_result

    def _perform_manager_validation_with_retries(
        self,
        *,
        spec: PromptSpec,
        original_prompt: str,
        attempt: int,
        label_base: str,
        task_id: Optional[str],
        task_source: Optional[Path],
        resume_session: Optional[str],
        qa_review: Optional[dict],
        qa_report_path: Optional[Path],
    ) -> tuple[dict, CodexRunResult]:
        session = resume_session
        max_attempts = self.manager_retry_limit + 1
        for retry_index in range(max_attempts):
            try:
                review, result = self._run_manager_validation(
                    spec=spec,
                    original_prompt=original_prompt,
                    attempt=attempt,
                    label_base=label_base,
                    task_id=task_id,
                    task_source=task_source,
                    resume_session=session,
                    qa_review=qa_review,
                    qa_report_path=qa_report_path,
                )
                return review, result
            except subprocess.CalledProcessError as exc:
                attempt_count = retry_index + 1
                if attempt_count >= max_attempts:
                    raise WorkflowError(
                        f"Manager validation failed for {label_base} on attempt {attempt} after {attempt_count} execution error(s)."
                    ) from exc
                print(
                    f"[manager] Execution error for {label_base} (attempt {attempt}, retry {attempt_count}/{max_attempts}). Retrying."
                )
                session = None
            except InvalidAgentResponseError as exc:
                attempt_count = retry_index + 1
                if attempt_count >= max_attempts:
                    display_path = self._rel_path(exc.path)
                    raise WorkflowError(
                        f"Manager validation never produced valid JSON for {label_base} (attempt {attempt}). "
                        f"See {display_path} for the last response."
                    ) from exc
                display_path = self._rel_path(exc.path)
                print(
                    f"[manager] Non-JSON response for {label_base} (attempt {attempt}). Raw output saved at {display_path}. "
                    f"Retry {attempt_count}/{max_attempts}."
                )
                session = exc.result.session_id if getattr(exc, "result", None) else None
        # Should not reach here
        raise WorkflowError(f"Manager validation exhausted retries for {label_base} (attempt {attempt}).")

    def _perform_qa_review_with_retries(
        self,
        *,
        spec: PromptSpec,
        task_id: str,
        task_source: Path,
        agent_prompt: str,
        label_base: str,
        attempt: int,
        task_dir: Path,
        resume_session: Optional[str],
        context_notes: Optional[str],
    ) -> tuple[dict, CodexRunResult, int]:
        session = resume_session
        max_attempts = self.qa_retry_limit + 1
        for retry_index in range(max_attempts):
            current_attempt = attempt if retry_index == 0 else attempt + retry_index
            try:
                review, result = self._run_qa_review(
                    spec=spec,
                    task_id=task_id,
                    task_source=task_source,
                    agent_prompt=agent_prompt,
                    label_base=label_base,
                    attempt=current_attempt,
                    task_dir=task_dir,
                    resume_session=session,
                    context_notes=context_notes,
                )
                return review, result, current_attempt
            except subprocess.CalledProcessError as exc:
                attempt_count = retry_index + 1
                if attempt_count >= max_attempts:
                    raise WorkflowError(
                        f"QA validation failed for {label_base} on attempt {current_attempt} after {attempt_count} execution error(s)."
                    ) from exc
                print(
                    f"[qa] Execution error for {label_base} (attempt {current_attempt}, retry {attempt_count}/{max_attempts}). Retrying."
                )
                session = None
            except InvalidAgentResponseError as exc:
                attempt_count = retry_index + 1
                if attempt_count >= max_attempts:
                    display_path = self._rel_path(exc.path)
                    raise WorkflowError(
                        f"QA validation never produced valid JSON for {label_base} (attempt {current_attempt}). "
                        f"See {display_path} for the last response."
                    ) from exc
                display_path = self._rel_path(exc.path)
                print(
                    f"[qa] Non-JSON response for {label_base} (attempt {current_attempt}). Raw output saved at {display_path}. "
                    f"Retry {attempt_count}/{max_attempts}."
                )
                session = exc.result.session_id if getattr(exc, "result", None) else None
        raise WorkflowError(f"QA validation exhausted retries for {label_base} (attempt {attempt}).")

    def _rel_path(self, path: Path) -> str:
        try:
            return str(path.relative_to(self.workspace))
        except ValueError:
            return str(path)

    @staticmethod
    def _verify_deliverables(deliverables: Sequence[Path]) -> None:
        missing = [str(path) for path in deliverables if not path.exists()]
        if missing:
            raise WorkflowError(f"Expected deliverables were not created: {missing}")

    def _deliverables_have_content(self, deliverables: Sequence[Path]) -> bool:
        for rel_path in deliverables:
            path = self.workspace / rel_path
            if not path.exists():
                return False
            if not path.read_text(encoding="utf-8").strip():
                return False
        return True

    def _build_context_for_spec(self, spec: PromptSpec) -> str:
        if spec.placeholder == "<<<PROJECT_IDEA>>>":
            if not self.project_idea:
                raise WorkflowError("Project idea text is required for the Intake PM prompt.")
            return self.project_idea
        return ""

    def _get_prompt_text(self, spec: PromptSpec, context: str) -> str:
        prompt_text = spec.template
        if spec.placeholder:
            if not context:
                raise WorkflowError(f"{spec.name} prompt requires context for placeholder.")
            prompt_text = prompt_text.replace(spec.placeholder, context)
        return prompt_text

    def _execute_agent_flow(
        self,
        *,
        spec: PromptSpec,
        initial_prompt: str,
        agent_label: str,
        manager_label: str,
        task_id: Optional[str] = None,
        task_source: Optional[Path] = None,
        task_dir: Optional[Path] = None,
        enable_qa: bool = False,
        qa_label: Optional[str] = None,
    ) -> None:
        prompt_text = initial_prompt
        agent_session: Optional[str] = None
        report_path = task_dir / "agent-report.md" if task_dir else None

        max_agent_attempts = self.agent_retry_limit + 1
        for attempt in range(1, max_agent_attempts + 1):
            suffix = "" if attempt == 1 else f"-retry{attempt-1}"
            try:
                agent_result = self.runner.run(
                    prompt_text,
                    label=f"{agent_label}{suffix}",
                    resume_session=agent_session,
                )
                self._record_conversation(
                    result=agent_result,
                    role="agent",
                    spec=spec,
                    attempt=attempt,
                    agent_label=agent_label,
                    task_id=task_id,
                )
            except subprocess.CalledProcessError as exc:
                if attempt == max_agent_attempts:
                    raise WorkflowError(
                        f"Agent execution failed for {agent_label} after {attempt} attempt(s)."
                    ) from exc
                print(
                    f"[agent] Execution error for {agent_label} (attempt {attempt}/{max_agent_attempts}). Retrying."
                )
                agent_session = None
                continue
            agent_session = agent_result.session_id

            missing_deliverables = self._missing_deliverables(spec.deliverables)
            if missing_deliverables:
                deliverable_text = ", ".join(str(path) for path in missing_deliverables)
                print(
                    f"[agent] Deliverables missing after {agent_label} attempt {attempt}: {deliverable_text}. "
                    "Requesting the agent to write the files."
                )
                if not agent_session:
                    print(
                        "[warn] Agent session id unavailable; follow-up prompt will start a new session."
                    )
                prompt_text = self._build_missing_deliverables_prompt(
                    original_prompt=initial_prompt,
                    missing=missing_deliverables,
                )
                continue

            qa_review: Optional[dict] = None
            qa_session: Optional[str] = None
            qa_attempt_index = 0  # Track which QA attempt index was last used
            if enable_qa and task_id and task_source and qa_label and task_dir:
                qa_review, qa_result, qa_attempt_index = self._perform_qa_review_with_retries(
                    spec=spec,
                    task_id=task_id,
                    task_source=task_source,
                    agent_prompt=initial_prompt,
                    label_base=qa_label,
                    attempt=1,
                    task_dir=task_dir,
                    resume_session=None,
                    context_notes=None,
                )
                qa_session = qa_result.session_id
                qa_status = (qa_review.get("status") or "").lower()
                if qa_status != "pass":
                    issues = qa_review.get("issues") or []
                    print(
                        f"[qa] Validation failed for {qa_label}. Issues: {issues}"
                    )
                    agent_session = agent_result.session_id
                    if not agent_session:
                        print(
                            "[warn] Agent session id unavailable; retry will start a new conversation."
                        )
                    prompt_text = self._build_retry_prompt(
                        original_prompt=initial_prompt,
                        issues=issues,
                    )
                    continue

            manager_attempt = 1
            manager_session: Optional[str] = None
            current_qa_review = qa_review
            qa_follow_counter = max(qa_attempt_index, 1) if enable_qa else 0

            while True:
                review, manager_result = self._perform_manager_validation_with_retries(
                    spec=spec,
                    original_prompt=initial_prompt,
                    attempt=manager_attempt,
                    label_base=manager_label,
                    task_id=task_id,
                    task_source=task_source,
                    resume_session=manager_session,
                    qa_review=current_qa_review,
                    qa_report_path=report_path if report_path and report_path.exists() else None,
                )
                manager_session = manager_result.session_id

                status = (review.get("status") or "").lower()
                if status == "pass":
                    planner_violations: List[str] = []
                    if spec.name == "Planner":
                        planner_violations = self._validate_backlog_resource_constraints(
                            raise_error=False
                        )
                        if planner_violations:
                            print(
                                "[planner] Resource-plan violations detected after manager validation: "
                                + "; ".join(planner_violations)
                            )
                            agent_session = agent_result.session_id
                            if not agent_session:
                                print(
                                    "[warn] Agent session id unavailable; retry will start a new conversation."
                                )
                            prompt_text = self._build_retry_prompt(
                                original_prompt=initial_prompt,
                                issues=planner_violations,
                            )
                            break

                    print(
                        f"[manager] Validation passed for {manager_label} (attempt {manager_attempt}). "
                        f"Summary: {review.get('summary', '')}"
                    )
                    return

                issues = review.get("issues") or []
                next_actor = (review.get("next_actor") or "agent").lower()
                if manager_attempt > self.manager_retry_limit:
                    raise WorkflowError(
                        f"Manager validation failed for {manager_label} after {manager_attempt} attempt(s). Issues: {issues}"
                    )

                print(
                    f"[manager] Validation failed for {manager_label} (attempt {manager_attempt}). "
                    f"Next actor: {next_actor}. Issues: {issues}"
                )

                if next_actor == "qa" and enable_qa and task_id and task_source and qa_label and task_dir:
                    qa_follow_counter += 1
                    qa_review, qa_result, qa_follow_counter = self._perform_qa_review_with_retries(
                        spec=spec,
                        task_id=task_id,
                        task_source=task_source,
                        agent_prompt=initial_prompt,
                        label_base=qa_label,
                        attempt=qa_follow_counter,
                        task_dir=task_dir,
                        resume_session=qa_session,
                        context_notes=manager_agent.format_issue_list(issues),
                    )
                    qa_session = qa_result.session_id
                    qa_status = (qa_review.get("status") or "").lower()
                    if qa_status != "pass":
                        issues = qa_review.get("issues") or issues
                        agent_session = agent_result.session_id
                        if not agent_session:
                            print(
                                "[warn] Agent session id unavailable; retry will start a new conversation."
                            )
                        prompt_text = self._build_retry_prompt(
                            original_prompt=initial_prompt,
                            issues=issues,
                        )
                        break
                    current_qa_review = qa_review
                    manager_attempt += 1
                    continue

                agent_session = agent_result.session_id
                if not agent_session:
                    print(
                        "[warn] Agent session id unavailable; retry will start a new conversation."
                    )
                prompt_text = self._build_retry_prompt(
                    original_prompt=initial_prompt,
                    issues=issues,
                )
                break

    @staticmethod
    def _build_retry_prompt(
        *,
        original_prompt: str,
        issues: Sequence[str],
    ) -> str:
        issue_lines = "\n".join(f"- {issue}" for issue in issues) or "- No details provided."
        return (
            "The quality assurance manager reported the following issues:\n"
            f"{issue_lines}\n\n"
            "Please correct the deliverables so they fully satisfy the original instructions below. "
            "Regenerate the complete content rather than incremental edits.\n\n"
            "Original instructions:\n"
            f"{original_prompt}"
        )

    def _run_smoke_test(self) -> None:
        target_relative = self.smoke_path
        target_path = (self.workspace / target_relative).resolve()
        target_path.parent.mkdir(parents=True, exist_ok=True)
        if target_path.exists():
            target_path.unlink()

        spec = PromptSpec(
            number=0,
            name="Smoke Test",
            template="",
            deliverables=[target_relative],
        )
        instruction = (
            "Respond with a single Markdown code block whose content is exactly:\n"
            "SMOKE TEST PASS\n"
            "Do not add any commentary, headers, fences outside the block, or additional lines."
        )
        result = self.runner.run(
            instruction,
            label="smoke-test-agent",
        )
        self._record_conversation(
            result=result,
            role="agent",
            spec=spec,
            attempt=1,
            agent_label="smoke-test-agent",
        )
        session = result.session_id
        prompt_text = instruction

        for retry in range(1, self.agent_retry_limit + 1):
            pending = self._missing_deliverables(spec.deliverables)
            if not pending:
                break
            if not session:
                print(
                    "[warn] Smoke test agent session unavailable; follow-up will start a new session."
                )
            prompt_text = self._build_missing_deliverables_prompt(
                original_prompt=instruction,
                missing=pending,
            )
            suffix = f"-retry{retry}"
            result = self.runner.run(
                prompt_text,
                label=f"smoke-test-agent{suffix}",
                resume_session=session,
            )
            self._record_conversation(
                result=result,
                role="agent",
                spec=spec,
                attempt=retry + 1,
                agent_label="smoke-test-agent",
            )
            session = result.session_id
        else:
            pending = self._missing_deliverables(spec.deliverables)
            if pending:
                raise WorkflowError(
                    f"Smoke test failed to write deliverable(s): {', '.join(str(p) for p in pending)}."
                )

        if not target_path.exists():
            raise WorkflowError(
                f"Smoke test failed: {target_relative} was not created."
            )
        content = target_path.read_text(encoding="utf-8").strip()
        if content != "SMOKE TEST PASS":
            raise WorkflowError(
                f"Smoke test failed: unexpected content in {target_relative!s}: {content!r}"
            )
        print(
            f"[smoke] Successfully wrote to {target_relative}. "
            "Environment appears writable."
        )

    def _collect_tasks(self) -> List[TaskEntry]:
        backlog_path = self.workspace / BACKLOG_FILE
        if not backlog_path.exists():
            return []
        try:
            payload = json.loads(backlog_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise WorkflowError(f"Invalid JSON in {BACKLOG_FILE}: {exc}") from exc

        tasks_data = payload.get("tasks", [])
        entries: List[TaskEntry] = []
        observed_ids: List[str] = []
        for item in tasks_data:
            try:
                task_id = item["id"]
            except KeyError as exc:
                raise WorkflowError(f"Task entry missing id field: {item}") from exc
            if task_id in observed_ids:
                raise WorkflowError(f"Duplicate task id detected in backlog: {task_id}")
            observed_ids.append(task_id)
            entry = TaskEntry(
                task_id=task_id,
                title=item.get("title", ""),
                owner=item.get("owner", ""),
                area=item.get("area", ""),
                deps=item.get("deps", []) or [],
                dod=item.get("dod", []) or [],
                tests=item.get("tests", []) or [],
                artifacts=item.get("artifacts", []) or [],
                estimate_points=int(item.get("estimate_points", 1) or 1),
                tags=item.get("tags", []) or [],
                notes=item.get("notes", "") or "",
                raw=item,
            )
            entries.append(entry)
        if observed_ids:
            expected_ids = [f"T-{index:03d}" for index in range(1, len(observed_ids) + 1)]
            if observed_ids != expected_ids:
                formatted_found = ", ".join(observed_ids)
                formatted_expected = ", ".join(expected_ids)
                raise WorkflowError(
                    "Backlog tasks are not in chronological order. "
                    f"Expected sequential ids [{formatted_expected}] but found [{formatted_found}]."
                )
        return self._topologically_sort(entries)

    def _topologically_sort(self, tasks: List[TaskEntry]) -> List[TaskEntry]:
        index = {task.task_id: task for task in tasks}
        indegree: dict[str, int] = {task.task_id: 0 for task in tasks}
        adjacency: dict[str, List[str]] = {task.task_id: [] for task in tasks}

        for task in tasks:
            for dep in task.deps:
                if dep not in index:
                    raise WorkflowError(
                        f"Task {task.task_id} depends on unknown task {dep}."
                    )
                indegree[task.task_id] += 1
                adjacency[dep].append(task.task_id)

        ready = [task_id for task_id, degree in indegree.items() if degree == 0]
        heapq.heapify(ready)
        ordered_ids: List[str] = []
        while ready:
            current = heapq.heappop(ready)
            ordered_ids.append(current)
            for neighbor in adjacency[current]:
                indegree[neighbor] -= 1
                if indegree[neighbor] == 0:
                    heapq.heappush(ready, neighbor)

        if len(ordered_ids) != len(tasks):
            unresolved = [task_id for task_id, degree in indegree.items() if degree > 0]
            raise WorkflowError(
                f"Cyclic dependencies detected in backlog: {', '.join(unresolved)}"
            )

        return [index[task_id] for task_id in ordered_ids]

    def _select_prompt_for_task(self, task: TaskEntry) -> PromptSpec | None:
        spec = self._resolve_supporting_prompt_for_owner(task.owner)
        if spec is None:
            return None
        return spec

    def _resolve_supporting_prompt_for_owner(self, owner: str) -> PromptSpec | None:
        owner_raw = (owner or "").strip().lower()
        if not owner_raw:
            return None

        owner_compact = re.sub(r"[^a-z]", "", owner_raw)
        owner_tokens = [token for token in re.split(r"[^a-z]+", owner_raw) if token]

        seen: set[str] = set()
        for candidate in [owner_compact, *owner_tokens]:
            if not candidate or candidate in seen:
                continue
            seen.add(candidate)
            key = self.OWNER_TOKEN_MAP.get(candidate)
            if not key:
                continue
            return get_supporting_prompt(key)
        return None

    def _validate_backlog_resource_constraints(
        self,
        tasks: Optional[List[TaskEntry]] = None,
        *,
        raise_error: bool = True,
    ) -> List[str]:
        # Resource planner support removed; keep hook for future validation logic.
        return []

    def _run_bug_pipeline(self) -> None:
        bugs_dir = self.bugs_dir
        if not bugs_dir.exists():
            return

        backlog_path = self.workspace / BACKLOG_FILE
        backlog_data = self._read_json(backlog_path) if backlog_path.exists() else None

        stage_to_prompt = {
            "intake": "bug_intake",
            "triage": "bug_triage",
            "repro": "bug_repro",
        }

        for bug_dir in sorted(p for p in bugs_dir.iterdir() if p.is_dir()):
            state = self._load_bug_state(bug_dir)
            bug_id = state.get("bug_id") or bug_dir.name
            state["bug_id"] = bug_id

            state_path = bug_dir / "state.json"
            if not state_path.exists():
                self._save_bug_state(bug_dir, state)

            pending_stage = state.get("pending_stage") or "intake"
            if pending_stage == "done":
                continue
            if state.get("awaiting_human"):
                continue

            prompt_key = stage_to_prompt.get(pending_stage)
            if not prompt_key:
                print(f"[bugs] Unknown pending stage '{pending_stage}' for bug {bug_id}; skipping.")
                continue

            try:
                spec = get_supporting_prompt(prompt_key)
            except KeyError:
                print(f"[bugs] Prompt '{prompt_key}' is not registered; skipping bug {bug_id}.")
                continue

            context_payload = self._build_bug_context(
                stage=pending_stage,
                bug_dir=bug_dir,
                backlog_data=backlog_data,
                state=state,
            )
            if context_payload is None:
                continue

            prompt_text = self._get_prompt_text(spec=spec, context=context_payload)
            prompt_text += (
                "\n\nBug artifacts:\n"
                f"- Bug directory: {self._rel_path(bug_dir)}\n"
                f"- State file: {self._rel_path(state_path)}\n"
            )

            agent_label = f"bugs/{bug_id}/{pending_stage}/agent"
            manager_label = f"bugs/{bug_id}/{pending_stage}/manager"

            try:
                self._execute_agent_flow(
                    spec=spec,
                    initial_prompt=prompt_text,
                    agent_label=agent_label,
                    manager_label=manager_label,
                    task_id=bug_id,
                    task_source=state_path,
                    task_dir=bug_dir,
                    enable_qa=False,
                )
            except WorkflowError as exc:
                print(f"[bugs] Stage '{pending_stage}' failed for bug {bug_id}: {exc}")
                continue

            try:
                state = self._update_bug_state_after_stage(
                    stage=pending_stage,
                    bug_dir=bug_dir,
                    state=state,
                )
            except WorkflowError as exc:
                print(f"[bugs] Could not update state for bug {bug_id}: {exc}")
                continue

            self._save_bug_state(bug_dir, state)

    def _run_feedback_pipeline(self) -> None:
        feedback_dir = self.feedback_dir
        if not feedback_dir.exists():
            return

        backlog_path = self.workspace / BACKLOG_FILE
        backlog_data = self._read_json(backlog_path) if backlog_path.exists() else None

        stage_to_prompt = {
            "intake": "feedback_intake",
            "review": "feedback_review",
            "plan": "feedback_plan",
        }

        for fb_dir in sorted(p for p in feedback_dir.iterdir() if p.is_dir()):
            state = self._load_feedback_state(fb_dir)
            feedback_id = state.get("feedback_id") or fb_dir.name
            state["feedback_id"] = feedback_id

            state_path = fb_dir / "state.json"
            if not state_path.exists():
                self._save_feedback_state(fb_dir, state)

            pending_stage = state.get("pending_stage") or "intake"
            if pending_stage == "done":
                continue
            if state.get("awaiting_human"):
                continue

            prompt_key = stage_to_prompt.get(pending_stage)
            if not prompt_key:
                print(f"[feedback] Unknown stage '{pending_stage}' for feedback {feedback_id}; skipping.")
                continue

            try:
                spec = get_supporting_prompt(prompt_key)
            except KeyError:
                print(f"[feedback] Prompt '{prompt_key}' is not registered; skipping {feedback_id}.")
                continue

            context_payload = self._build_feedback_context(
                stage=pending_stage,
                feedback_dir=fb_dir,
                backlog_data=backlog_data,
                state=state,
            )
            if context_payload is None:
                continue

            prompt_text = self._get_prompt_text(spec=spec, context=context_payload)
            prompt_text += (
                "\n\nFeedback artifacts:\n"
                f"- Feedback directory: {self._rel_path(fb_dir)}\n"
                f"- State file: {self._rel_path(state_path)}\n"
            )

            agent_label = f"feedback/{feedback_id}/{pending_stage}/agent"
            manager_label = f"feedback/{feedback_id}/{pending_stage}/manager"

            try:
                self._execute_agent_flow(
                    spec=spec,
                    initial_prompt=prompt_text,
                    agent_label=agent_label,
                    manager_label=manager_label,
                    task_id=feedback_id,
                    task_source=state_path,
                    task_dir=fb_dir,
                    enable_qa=False,
                )
            except WorkflowError as exc:
                print(f"[feedback] Stage '{pending_stage}' failed for {feedback_id}: {exc}")
                continue

            try:
                state = self._update_feedback_state_after_stage(
                    stage=pending_stage,
                    feedback_dir=fb_dir,
                    state=state,
                )
            except WorkflowError as exc:
                print(f"[feedback] Could not update state for {feedback_id}: {exc}")
                continue

            self._save_feedback_state(fb_dir, state)

    def _run_task_loop(self) -> None:
        tasks = self._collect_tasks()
        self._validate_backlog_resource_constraints(tasks)
        if not tasks:
            print("[tasks] No tasks found in BACKLOG/backlog.json. Skipping execution loop.")
            return

        backlog_path = self.workspace / BACKLOG_FILE
        count = 0
        for task in tasks:
            if not self.reprocess_tasks and task.task_id in self.processed_tasks:
                print(f"[tasks] Skipping {task.task_id} (already processed).")
                continue

            if self.max_tasks is not None and count >= self.max_tasks:
                print("[tasks] Reached max task limit, stopping.")
                break

            spec = self._select_prompt_for_task(task)
            if spec is None:
                print(f"[tasks] No automation prompt mapped for owner '{task.owner}' (task {task.task_id}); skipping.")
                continue

            task_payload = json.dumps(task.raw, indent=2)
            prompt_text = self._get_prompt_text(spec=spec, context=task_payload)

            task_slug = task.task_id.lower()
            task_dir = self.runner.artifacts_dir / "tasks" / task_slug
            task_dir.mkdir(parents=True, exist_ok=True)
            report_path = task_dir / "agent-report.md"

            prompt_text += (
                "\n\nRepository resources:\n"
                f"- Task artifact directory: {self._rel_path(task_dir)}\n"
                f"- Agent report path: {self._rel_path(report_path)}\n"
                f"- Source backlog: {self._rel_path(backlog_path)}\n"
                "- QA will inspect the updated repository and record findings."
            )

            agent_label = f"tasks/{task_slug}/agent"
            manager_label = f"tasks/{task_slug}/manager"
            qa_label = f"tasks/{task_slug}/qa"

            enable_qa = spec.name == "Module Developer"

            self._execute_agent_flow(
                spec=spec,
                initial_prompt=prompt_text,
                agent_label=agent_label,
                manager_label=manager_label,
                task_id=task.task_id,
                task_source=backlog_path,
                task_dir=task_dir,
                enable_qa=enable_qa,
                qa_label=qa_label,
            )

            self.processed_tasks.add(task.task_id)
            self._save_processed_tasks()
            count += 1

        if count == 0:
            print("[tasks] No new tasks executed.")

    def _missing_deliverables(self, deliverables: Sequence[Path]) -> List[Path]:
        missing: List[Path] = []
        for rel_path in deliverables:
            path = self.workspace / rel_path
            if not path.exists():
                missing.append(rel_path)
                continue
            if not path.read_text(encoding="utf-8").strip():
                missing.append(rel_path)
        return missing

    def _record_conversation(
        self,
        *,
        result: CodexRunResult,
        role: str,
        spec: PromptSpec,
        attempt: int,
        agent_label: str,
        task_id: Optional[str] = None,
    ) -> None:
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds") + "Z",
            "role": role,
            "prompt_number": spec.number,
            "agent_label": agent_label,
            "attempt": attempt,
            "session_id": result.session_id,
            "transcript_path": self._rel_path(result.transcript_path),
            "last_message_path": self._rel_path(result.last_message_path),
        }
        if spec.number == 4 and task_id:
            entry["task_id"] = task_id
        self.conversation_log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.conversation_log_path.open("a", encoding="utf-8") as handle:
            json.dump(entry, handle)
            handle.write("\n")

        if role == "agent" and result.session_id:
            sessions_dir = self.workspace / SESSIONS_DIR
            sessions_dir.mkdir(parents=True, exist_ok=True)
            session_path = sessions_dir / f"prompt{spec.number}.session"
            session_path.write_text(result.session_id, encoding="utf-8")

    def _build_missing_deliverables_prompt(
        self,
        *,
        original_prompt: str,
        missing: Sequence[Path],
    ) -> str:
        lines = "\n".join(f"- {path}" for path in missing)
        return (
            "You did not write the required deliverables to the repository.\n"
            f"The following files are missing or empty:\n{lines}\n\n"
            "Resume the work and update each file directly in the repo so it matches the original instructions.\n"
            "Do not return the content inline; write the files exactly as required and confirm completion.\n\n"
            "Original instructions:\n"
            f"{original_prompt}"
        )

    def _load_bug_state(self, bug_dir: Path) -> dict:
        state_path = bug_dir / "state.json"
        state: dict = {}
        if state_path.exists():
            try:
                state = json.loads(state_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                print(f"[bugs] Could not parse state file {self._rel_path(state_path)}; starting fresh.")
                state = {}
        state.setdefault("bug_id", bug_dir.name)
        state.setdefault("pending_stage", "intake")
        state.setdefault("history", [])
        return state

    def _save_bug_state(self, bug_dir: Path, state: dict) -> None:
        state_path = bug_dir / "state.json"
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds") + "Z"
        state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    def _load_feedback_state(self, feedback_dir: Path) -> dict:
        state_path = feedback_dir / "state.json"
        state: dict = {}
        if state_path.exists():
            try:
                state = json.loads(state_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                print(
                    f"[feedback] Could not parse state file {self._rel_path(state_path)}; starting fresh."
                )
                state = {}
        state.setdefault("feedback_id", feedback_dir.name)
        state.setdefault("pending_stage", "intake")
        state.setdefault("history", [])
        return state

    def _save_feedback_state(self, feedback_dir: Path, state: dict) -> None:
        state_path = feedback_dir / "state.json"
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds") + "Z"
        state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    def _build_bug_context(
        self,
        *,
        stage: str,
        bug_dir: Path,
        backlog_data: Optional[dict],
        state: dict,
    ) -> Optional[str]:
        submission = self._read_json(bug_dir / "submission.json")
        intake = self._read_json(bug_dir / "intake.json")
        triage = self._read_json(bug_dir / "triage.json")
        repro = self._read_json(bug_dir / "repro.json")

        if stage == "intake":
            if submission is None:
                print(
                    f"[bugs] No submission.json found for bug {bug_dir.name}; waiting for raw report."
                )
                return None
            payload = submission
        else:
            if intake is None:
                print(f"[bugs] Cannot run stage '{stage}' for bug {bug_dir.name} without intake.json.")
                return None
            payload = {
                "bug_id": state.get("bug_id"),
                "submission": submission,
                "intake": intake,
                "triage": triage,
                "repro": repro,
                "backlog": backlog_data,
                "state": state,
            }
        return json.dumps(payload, indent=2)

    def _build_feedback_context(
        self,
        *,
        stage: str,
        feedback_dir: Path,
        backlog_data: Optional[dict],
        state: dict,
    ) -> Optional[str]:
        submission = self._read_json(feedback_dir / "submission.json")
        intake = self._read_json(feedback_dir / "intake.json")
        review = self._read_json(feedback_dir / "review.json")
        plan = self._read_json(feedback_dir / "plan.json")

        if stage == "intake":
            if submission is None:
                print(
                    f"[feedback] No submission.json found for feedback {feedback_dir.name}; waiting for reporter input."
                )
                return None
            payload = submission
        else:
            if intake is None:
                print(
                    f"[feedback] Cannot run stage '{stage}' for feedback {feedback_dir.name} without intake.json."
                )
                return None
            payload = {
                "feedback_id": state.get("feedback_id"),
                "submission": submission,
                "intake": intake,
                "review": review,
                "plan": plan,
                "backlog": backlog_data,
                "state": state,
            }
        return json.dumps(payload, indent=2)

    def _update_bug_state_after_stage(
        self,
        *,
        stage: str,
        bug_dir: Path,
        state: dict,
    ) -> dict:
        stage_map = {
            "intake": bug_dir / "intake.json",
            "triage": bug_dir / "triage.json",
            "repro": bug_dir / "repro.json",
        }
        result_path = stage_map.get(stage)
        if result_path is None or not result_path.exists():
            raise WorkflowError(
                f"Expected result file for stage '{stage}' is missing in {self._rel_path(bug_dir)}."
            )

        result_data = self._read_json(result_path)
        if result_data is None:
            raise WorkflowError(f"Result file {self._rel_path(result_path)} is not valid JSON.")

        status = (result_data.get("status") or "").lower()
        timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds") + "Z"
        state.setdefault("history", []).append(
            {
                "stage": stage,
                "status": status,
                "timestamp": timestamp,
            }
        )

        state.pop("awaiting_reason", None)
        state["awaiting_human"] = False

        if stage == "intake":
            if status == "needs_info":
                state["pending_stage"] = "intake"
                state["awaiting_human"] = True
                state["awaiting_reason"] = "needs_info"
            else:
                state["pending_stage"] = "triage"
        elif stage == "triage":
            if status == "needs_info":
                state["pending_stage"] = "triage"
                state["awaiting_human"] = True
                state["awaiting_reason"] = "needs_info"
            elif status in {"duplicate", "rejected"}:
                state["pending_stage"] = "done"
            elif status == "triaged":
                state["pending_stage"] = "repro"
            else:
                state["pending_stage"] = "repro"
        elif stage == "repro":
            if status == "blocked":
                state["pending_stage"] = "repro"
                state["awaiting_human"] = True
                state["awaiting_reason"] = "blocked"
            else:
                state["pending_stage"] = "done"
        else:
            state["pending_stage"] = "done"

        return state

    def _update_feedback_state_after_stage(
        self,
        *,
        stage: str,
        feedback_dir: Path,
        state: dict,
    ) -> dict:
        stage_map = {
            "intake": feedback_dir / "intake.json",
            "review": feedback_dir / "review.json",
            "plan": feedback_dir / "plan.json",
        }
        result_path = stage_map.get(stage)
        if result_path is None or not result_path.exists():
            raise WorkflowError(
                f"Expected result file for stage '{stage}' is missing in {self._rel_path(feedback_dir)}."
            )

        result_data = self._read_json(result_path)
        if result_data is None:
            raise WorkflowError(f"Result file {self._rel_path(result_path)} is not valid JSON.")

        status = (result_data.get("status") or "").lower()
        timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds") + "Z"
        state.setdefault("history", []).append(
            {
                "stage": stage,
                "status": status,
                "timestamp": timestamp,
            }
        )

        state.pop("awaiting_reason", None)
        state["awaiting_human"] = False

        if stage == "intake":
            if status == "needs_info":
                state["pending_stage"] = "intake"
                state["awaiting_human"] = True
                state["awaiting_reason"] = "needs_info"
            else:
                state["pending_stage"] = "review"
        elif stage == "review":
            if status == "needs_info":
                state["pending_stage"] = "review"
                state["awaiting_human"] = True
                state["awaiting_reason"] = "needs_info"
            elif status in {"rejected", "duplicate"}:
                state["pending_stage"] = "done"
            elif status == "reviewed":
                state["pending_stage"] = "plan"
            else:
                state["pending_stage"] = "plan"
        elif stage == "plan":
            if status == "blocked":
                state["pending_stage"] = "plan"
                state["awaiting_human"] = True
                state["awaiting_reason"] = "blocked"
            else:
                state["pending_stage"] = "done"
        else:
            state["pending_stage"] = "done"

        return state

    def _read_json(self, path: Path) -> Optional[dict]:
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"[bugs] Failed to parse JSON file {self._rel_path(path)}.")
            return None


def main() -> None:
    args = parse_args()
    workflow = Workflow(args)
    try:
        workflow.run()
    except WorkflowError as exc:
        print(f"\n[error] {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
