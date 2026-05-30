# claude/ — AI coding router skill + hook

This folder ships the **ai-coding-router** Claude Code skill and an auto-routing hook
that pairs with this repo's swarm. It is named `claude/` (not `.claude/`) on purpose, so
it doesn't get picked up as this repo's own project config — it's a portable copy you
install into your user-level Claude config.

## What it does

Claude plans and reviews; cheap models do the bulk work. The skill is the routing brain:

- **Bulk / greenfield / many independent files** → drive this repo's `swarm-exec` (DeepSeek
  + MiMo run in parallel).
- **Hard / tricky single change** → Claude Sonnet, reviewed by Opus.
- **Risky** (security, crypto, auth, payments, migrations) → **never** the cheap swarm.
- **Trivial single edit** → just do it inline.

The hook (`skills/ai-coding-router/hooks/route-implementation.mjs`) is a `UserPromptSubmit`
hook: on prompts that look like implementation work it injects the routing reminder (and a
risk warning when the prompt touches security/crypto/auth). It nudges; it never forces.

## Install

1. Copy the skill into your user Claude config:

   ```bash
   # macOS / Linux
   cp -r claude/skills/ai-coding-router ~/.claude/skills/

   # Windows (PowerShell)
   Copy-Item -Recurse claude\skills\ai-coding-router "$env:USERPROFILE\.claude\skills\"
   ```

2. (Optional) Enable the auto-routing hook. Merge `claude/settings.snippet.json` into your
   `~/.claude/settings.json` under `hooks`, and fix the path to point at where you copied the
   skill. Example command:

   ```
   node "<YOUR_HOME>/.claude/skills/ai-coding-router/hooks/route-implementation.mjs"
   ```

3. Read `skills/ai-coding-router/SKILL.md` for the full routing table and the `swarm-exec`
   contract. Set up worker backends with this repo's `.env.example`.

No secrets live here. The skill's `templates/env.example` lists variable names only; your
API keys belong in this repo's gitignored `.env`, never in any committed file.
