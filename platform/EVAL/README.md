# Evaluation Artifacts

Use this directory to store structured grading outputs, QA reports, and gate evidence.

Recommended layout:
- `graders/` — configuration for automated rubric graders.
- `reports/` — JSON/Markdown records from QA, Security, Perf, Reviewer agents.
- `history/` — timeline of gate decisions.

Until automated graders exist, agents should record manual findings here to maintain provenance.
