# ai-coding-router

A CLI-first harness for routing coding tasks across Claude and cheaper coders
(DeepSeek V4 Flash/Pro, MiMo V2.5/Pro) plus optional local OpenAI-compatible models.
Claude plans and reviews; the cheap models do bulk work; **OpenCode** and **Aider**
are the two harnesses that drive them.

This is a Claude Skill. Claude reads `SKILL.md` to learn how to route work. Humans
read this file to operate the CLIs.

## TL;DR

```
# 1. confirm tools + credentials (prints NO secrets)
scripts/check-env.ps1        # or check-env.sh

# 2. log keys into the harness (user-level, not in any repo)
opencode auth login          # pick DeepSeek; paste key when prompted

# 3. wire the custom providers (prints config; backs up before any change)
scripts/setup-opencode.ps1
scripts/setup-aider.ps1

# 4. run a task
scripts/run-opencode-deepseek-flash.ps1     # default cheap worker
scripts/run-aider-deepseek-pro.ps1 file1 file2
```

## Where keys live

Keys live **with the harness**, at the user level — not in this skill, not in any
project repo. OpenCode stores them via `opencode auth login`. Aider reads them from
user-level environment variables. There is intentionally **no `.env` in your working
repos**. See [docs/security.md](docs/security.md).

## Models and when to use them

See [docs/router.md](docs/router.md). Short version:

- **Easy scaffold** → DeepSeek V4 Flash or MiMo V2.5 (or a local model)
- **Medium coding** → DeepSeek V4 Flash first, MiMo V2.5 challenger, Sonnet fallback
- **Hard coding** → Sonnet, DeepSeek V4 Pro, MiMo V2.5-Pro
- **Long-context repo work** → DeepSeek V4 Pro or MiMo V2.5-Pro
- **Risky code** → Sonnet first, Opus final review, DeepSeek/MiMo only as second opinion

## Layout

| Path | What |
|---|---|
| `SKILL.md` | Routing instructions Claude reads |
| `templates/env.example` | Variable names only — no values |
| `templates/opencode.example.json` | Custom-provider config for OpenCode |
| `templates/aider.model-settings.example.yml` | Per-model Aider settings |
| `scripts/check-env.*` | Verify tools + report credential presence (no secrets) |
| `scripts/setup-opencode.*` | Print/merge OpenCode provider config (backs up first) |
| `scripts/setup-aider.*` | Print Aider model setup |
| `scripts/run-opencode-*.*` | Launch OpenCode pinned to a model |
| `scripts/run-aider-*.*` | Launch Aider pinned to a model |
| `docs/router.md` | The routing table, expanded |
| `docs/provider-setup.md` | Exact provider + tool setup steps |
| `docs/security.md` | Key handling, rotation, gitignore, history hygiene |
| `docs/benchmark-plan.md` | How to compare models fairly |
| `bench/tasks/001..010` | 10 realistic scaffold/edit tasks |
| `bench/scorecard.md` | Copy-paste scoring table |

## Model-name caveat

`deepseek-v4-flash`, `deepseek-v4-pro`, `mimo-v2.5`, `mimo-v2.5-pro` are wired exactly
as supplied. **Verify them against `opencode` `/models` or the provider's API before
spending credits** — if a name is wrong the call fails or silently bills the wrong
model. MiMo's base URL is intentionally **not hardcoded**; set `MIMO_BASE_URL` from
official MiMo docs or your supplied value.

## Status of tools (at skill creation)

- OpenCode: installed (`opencode --version`).
- Aider: not installed — install is operator-approved only (see provider-setup.md).
- No provider has been called. No benchmark has been run. No keys are stored by this
  skill.
