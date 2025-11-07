from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

from .errors import InvalidAgentResponseError, WorkflowError


def strip_json_content(payload: str) -> str:
    payload = payload.strip()
    fence = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)
    match = fence.match(payload)
    if match:
        return match.group(1).strip()
    return payload


def _extract_json_object(payload: str) -> Optional[dict]:
    decoder = json.JSONDecoder()
    idx = 0
    length = len(payload)
    while idx < length:
        char = payload[idx]
        if char in "{[":
            try:
                obj, _ = decoder.raw_decode(payload[idx:])
                return obj
            except json.JSONDecodeError:
                pass
        idx += 1
    return None


def read_agent_output(path: Path, *, role: str) -> dict:
    if not path.exists():
        raise WorkflowError(f"{role.capitalize()} output not found: {path}")
    raw = path.read_text(encoding="utf-8")
    try:
        json_text = strip_json_content(raw)
        return json.loads(json_text)
    except json.JSONDecodeError as exc:
        fallback = _extract_json_object(json_text)
        if fallback is not None:
            return fallback
        raise InvalidAgentResponseError(role=role, path=path, raw=json_text) from exc
