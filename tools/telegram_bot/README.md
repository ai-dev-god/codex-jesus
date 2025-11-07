# Telegram Bot Relay

This bot lets you talk to the Codex agent from Telegram. Each chat maintains its own Codex session so conversations can continue between messages.

## Setup

1. Install dependencies (preferably in a virtualenv):

   ```bash
   pip install -r tools/telegram_bot/requirements.txt
   ```

2. Create a Telegram bot using @BotFather and copy the API token.

3. Export the token (and optionally allowed usernames) before running the bot:

   ```bash
   export TELEGRAM_BOT_TOKEN=123456:ABCDEF...
   export TELEGRAM_ALLOWED_USERS=fishmaster2  # comma-separated list, defaults to fishmaster2
   ```

4. Start the relay (runs until you stop it):

   ```bash
   python tools/telegram_bot/bot.py
   ```

## How It Works

- Each chat gets a dedicated folder under `platform/automation_artifacts/telegram/<chat-id>/` containing:
  - `session.txt` — the Codex session id (keeps the conversation alive).
  - `response.md` — the latest answer written by Codex.
  - `codex.log` — captured stdout/stderr for debugging.
- Messages are forwarded to Codex via the “Telegram relay” prompt (`platform/automation/agents/telegram/prompt.txt`). The agent writes its final response to `response.md`; the bot reads that file and sends the contents back to Telegram.
- Use `/stop` to clear the stored session if you want a fresh conversation.

### Commands

- `/start` — initializes or resumes your general Codex session.
- `/stop` — clears the stored session id.
- `/refresh` — restarts the Codex CLI for the existing session while keeping the conversation id intact.
- `/devops <message>` — Scaffolder / DevOps agent (prompt 6).
- `/docs <message>` — Intake PM agent (prompt 0).
- `/roadmap <message>` — Planner / backlog agent (prompt 5).
- `/tasks <message>` — Module developer agent (prompt 7).
- Additional shortcuts exist for Research (`/research`), API (`/api`), Security (`/security`), QA (`/qa`), Release (`/release`), etc. Run `/help` inside Telegram to see the full alias list and current prompt numbers.

## Notes

- The bot runs Codex locally using the existing repository checkout. Make sure any required environment variables or tooling are configured before chatting.
- Large responses are sent as Markdown. If you need plain text, adjust `bot.py` accordingly.
