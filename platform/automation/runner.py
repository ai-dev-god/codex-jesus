from __future__ import annotations

import itertools
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from automation.paths import ARTIFACTS_DIR


@dataclass
class CodexRunResult:
    label: str
    last_message_path: Path
    transcript_path: Path
    session_id: Optional[str]


class CodexRunner:
    """Utility wrapper around the Codex CLI."""

    def __init__(
        self,
        workspace: Path,
        artifacts_dir: Path,
        sandbox: str,
        approval_policy: str,
        include_plan: bool,
        model: Optional[str],
        reasoning_effort: str,
    ) -> None:
        self.workspace = workspace
        self.artifacts_dir = artifacts_dir
        self.sandbox = sandbox
        self.approval_policy = approval_policy
        self.include_plan = include_plan
        self.model = model
        self.reasoning_effort = reasoning_effort

    def run(
        self,
        prompt_text: str,
        *,
        label: str,
        model_override: Optional[str] = None,
        resume_session: Optional[str] = None,
    ) -> CodexRunResult:
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)

        transcript_path = self.artifacts_dir / f"{label}.log"
        last_message_path = self.artifacts_dir / f"{label}.txt"
        transcript_path.parent.mkdir(parents=True, exist_ok=True)
        last_message_path.parent.mkdir(parents=True, exist_ok=True)

        command: List[str] = [
            "codex",
            "--dangerously-bypass-approvals-and-sandbox",
            "exec",
            "--sandbox",
            "danger-full-access",
        ]
        command.extend(
            [
                "--skip-git-repo-check",
                "--cd",
                str(self.workspace),
            ]
        )

        model_to_use = model_override or self.model
        if model_to_use:
            command.extend(["-m", model_to_use])
        if self.reasoning_effort:
            command.extend(["-c", f'reasoning.effort="{self.reasoning_effort}"'])
        if self.include_plan and not resume_session:
            command.append("--include-plan-tool")
        if resume_session:
            command.extend(["resume", resume_session])

        print(f"\n[Codex] Running '{label}'...")
        self._reconcile_artifacts_root()
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=self.workspace,
        )

        raw_lines: List[str] = []
        assert process.stdin is not None
        process.stdin.write(prompt_text)
        process.stdin.close()

        assert process.stdout is not None
        with transcript_path.open("w", encoding="utf-8") as log_handle:
            for line in process.stdout:
                raw_lines.append(line)
                log_handle.write(line)
                log_handle.flush()
                sys.stdout.write(line)
                sys.stdout.flush()

        return_code = process.wait()
        raw_output = "".join(raw_lines)

        if return_code != 0:
            raise subprocess.CalledProcessError(
                returncode=return_code,
                cmd=command,
                output=raw_output,
            )

        last_message = self._extract_last_message(raw_output)
        last_message_path.write_text(last_message + "\n", encoding="utf-8")

        session_id = self._extract_session_id(raw_output) or resume_session

        if session_id:
            print(f"[Codex] Session: {session_id}")
        print(f"[Codex] '{label}' completed. Transcript saved to {transcript_path}")
        self._reconcile_artifacts_root()
        return CodexRunResult(
            label=label,
            last_message_path=last_message_path,
            transcript_path=transcript_path,
            session_id=session_id,
        )

    def _reconcile_artifacts_root(self) -> None:
        stray_root = self.workspace / "ARTIFACTS"
        target_root = self.workspace / ARTIFACTS_DIR
        if stray_root == target_root:
            return
        if not stray_root.exists() or not stray_root.is_dir():
            return
        target_root.mkdir(parents=True, exist_ok=True)
        self._merge_directories(stray_root, target_root)
        try:
            stray_root.rmdir()
        except OSError:
            # Leave the directory if non-empty after merge.
            pass

    def _merge_directories(self, source: Path, destination: Path) -> None:
        for item in source.iterdir():
            dest_path = destination / item.name
            if item.is_dir():
                if dest_path.exists() and dest_path.is_file():
                    dest_path = self._unique_path(destination, item.name + "_dir")
                dest_path.mkdir(parents=True, exist_ok=True)
                self._merge_directories(item, dest_path)
                try:
                    item.rmdir()
                except OSError:
                    shutil.rmtree(item, ignore_errors=True)
                continue

            if not dest_path.exists():
                item.replace(dest_path)
                continue

            if dest_path.is_dir():
                dest_path = self._unique_path(destination, item.name)
                item.replace(dest_path)
                continue

            try:
                if item.read_bytes() == dest_path.read_bytes():
                    item.unlink()
                    continue
            except OSError:
                pass

            backup_path = self._unique_path(destination, dest_path.stem + "-duplicate" + dest_path.suffix)
            item.replace(backup_path)

    @staticmethod
    def _unique_path(directory: Path, base_name: str) -> Path:
        stem = base_name
        suffix = ""
        if "." in base_name and not base_name.startswith("."):
            stem = base_name[: base_name.rfind(".")]
            suffix = base_name[base_name.rfind("."):]
        counter = itertools.count(1)
        while True:
            candidate = directory / f"{stem}.{next(counter)}{suffix}"
            if not candidate.exists():
                return candidate

    @staticmethod
    def _extract_session_id(raw_output: str) -> Optional[str]:
        for line in raw_output.splitlines():
            line = line.strip()
            if line.lower().startswith("session id:"):
                return line.split(":", 1)[1].strip()
            if line.lower().startswith("thread id:"):
                return line.split(":", 1)[1].strip()
        return None

    @staticmethod
    def _extract_last_message(raw_output: str) -> str:
        lines = raw_output.splitlines()
        last_codex_index = None
        for idx, line in enumerate(lines):
            if line.strip() == "codex":
                last_codex_index = idx
        if last_codex_index is None:
            return raw_output.strip()

        message_lines: List[str] = []
        for line in lines[last_codex_index + 1 :]:
            if line.strip().lower() == "tokens used":
                break
            message_lines.append(line)
        return "\n".join(message_lines).strip()
