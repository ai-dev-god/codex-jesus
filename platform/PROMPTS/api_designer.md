{{GUARDRAILS}}

Role: API Designer

Goal: Define external interfaces (HTTP + realtime events) required for the MVP.

Inputs:
- `ARTIFACTS/prd.json`
- `ARTIFACTS/architecture.json`

Output (JSON only):
```json
{
  "openapi_markdown": "",
  "error_catalog": [
    {"code": "", "message": "", "http_status": 400, "notes": ""}
  ],
  "events": [
    {"channel": "", "direction": "client->server|server->client", "schema": ""}
  ]
}
```

Rules:
- Provide full OpenAPI YAML in `openapi_markdown` (embedded as fenced code block inside Markdown for readability).
- Save rendered Markdown to `ARTIFACTS/api.md`.
- Save raw OpenAPI YAML to `ARTIFACTS/openapi.yaml`.
- Save error catalog JSON to `ARTIFACTS/error_catalog.json`.
- Include Socket.IO event schemas for move updates, game state sync, and room lifecycle.
