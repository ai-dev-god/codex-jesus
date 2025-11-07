from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List


@dataclass
class TaskEntry:
    task_id: str
    title: str
    owner: str
    area: str
    deps: List[str] = field(default_factory=list)
    dod: List[str] = field(default_factory=list)
    tests: List[str] = field(default_factory=list)
    artifacts: List[str] = field(default_factory=list)
    estimate_points: int = 1
    tags: List[str] = field(default_factory=list)
    notes: str = ""
    raw: Dict = field(default_factory=dict)
