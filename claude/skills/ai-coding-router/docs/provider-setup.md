# Provider & tool setup

Exact steps for DeepSeek, MiMo, OpenCode, Aider, and an optional local server. Keys live
in the harness at the user level — never in a project repo. Confirm model IDs against
`/models` or the provider API before spending credits.

## DeepSeek

- OpenAI-compatible base URL: `https://api.deepseek.com` (SDKs often want `/v1` appended)
- Anthropic-compatible base URL: `https://api.deepseek.com/anthropic`
- Models (confirmed live via `/models`, 2026-05-29): `deepseek-v4-flash`, `deepseek-v4-pro`.
  Both are **reasoning models** — they return `reasoning_content` before `content`, so set a
  generous `max_tokens` and read `content`.
- **Thinking toggle** (defaults to on):
  - OpenAI body: `{"thinking": {"type": "disabled"}}` to turn off; `"enabled"` to force on.
    With the OpenAI SDK, pass it via `extra_body` (raw body field).
  - Effort (thinking on only): `{"reasoning_effort": "high"|"max"}` — valid values
    `low|medium|high|max|xhigh` (low/medium→high, xhigh→max). There is **no "none"** — to
    save tokens you *disable* thinking, not lower effort.
  - Thinking mode silently ignores `temperature`/`top_p`. On **tool-call** turns you must
    echo `reasoning_content` back or the API 400s (swarm JSON-envelope workers don't use
    tool calls, so they're unaffected).
- Get a key from the DeepSeek platform console.

OpenCode recognizes DeepSeek natively. The cleanest path:

```
opencode auth login        # choose DeepSeek, paste key (stored user-level, outside repos)
opencode --model deepseek/deepseek-v4-flash
```

For Aider, DeepSeek is reached through the OpenAI-compatible endpoint (the run-aider-*
scripts set `OPENAI_API_BASE` + `OPENAI_API_KEY` for you).

## MiMo

- Models (as supplied — **verify live** via MiMo's `/models`): `mimo-v2.5`, `mimo-v2.5-pro`
- **Base URL (operator-supplied):** `https://token-plan-sgp.xiaomimimo.com/anthropic` — note
  the `/anthropic` suffix: this is the **Anthropic Messages API** shape, not OpenAI.
  - **Anthropic-shaped clients** (OpenCode via `@ai-sdk/anthropic`, a Claude-style SDK,
    DeepSeek's own `/anthropic` surface): use that URL as-is.
  - **OpenAI-compatible clients** (Aider's `openai/` prefix, decalyst's OpenAI SDK worker):
    need MiMo's OpenAI-compatible base URL instead — get it from MiMo's docs.
- **Base URL is not hardcoded in scripts.** Set it from your value:

```
# PowerShell (current session)
$env:MIMO_API_KEY  = '...'      # do not commit, do not echo
$env:MIMO_BASE_URL = 'https://<mimo-openai-compatible-endpoint>/v1'

# bash
export MIMO_API_KEY='...'
export MIMO_BASE_URL='https://<mimo-openai-compatible-endpoint>/v1'
```

MiMo is wired into OpenCode as a custom OpenAI-compatible provider — see
`templates/opencode.example.json` (it reads `MIMO_BASE_URL` / `MIMO_API_KEY` via `{env:...}`).

## OpenCode (primary harness)

- Already installed here. Confirm: `opencode --version`.
- Config lives at `~/.config/opencode/opencode.json` (or `.jsonc`).
- Wire providers: run `scripts/setup-opencode.{ps1,sh}` — it prints the example block and
  backs up any existing config before you touch it.
- Verify and drive:
  - `opencode` — open the TUI
  - `/connect` — authenticate a provider
  - `/models` — list available models, pick one
  - tiny test prompt: `> write a hello-world TypeScript function` then check the diff.

## Aider (controlled edit / bakeoff harness)

- Not installed yet. Install (ask before running):
  ```
  winget install Python.Python.3.12       # real Python is missing on this machine
  python -m pip install --user pipx
  pipx install aider-chat
  ```
- Per-model settings: copy `templates/aider.model-settings.example.yml` to
  `~/.aider.model.settings.yml`.
- Run via the scripts, e.g.:
  ```
  # DeepSeek Flash
  scripts\run-aider-deepseek-flash.ps1  path\to\file.ts
  # MiMo Pro
  scripts\run-aider-mimo-pro.ps1        path\to\file.ts
  ```
  Equivalent raw form:
  ```
  $env:OPENAI_API_BASE = $env:DEEPSEEK_BASE_URL
  $env:OPENAI_API_KEY  = $env:DEEPSEEK_API_KEY
  aider --model openai/deepseek-v4-flash
  ```

## Optional: local OpenAI-compatible server

Any of llama.cpp `server`, Ollama (`/v1`), vLLM, or LM Studio exposes an OpenAI-compatible
API. Point a provider at it:

- OpenCode: see the `local` block in `templates/opencode.example.json` (set `baseURL` and the
  model id your server reports; most local servers ignore the API key — use a dummy).
- Aider: `OPENAI_API_BASE=http://localhost:11434/v1 OPENAI_API_KEY=local aider --model openai/<local-model>`

Use local models for offline / private / ultra-low-latency scaffold work. Wire this later;
don't block initial setup on it.

## Optional: mini-SWE-agent / SWE-agent

Documented only, not set up. If you later want autonomous multi-step runs, mini-SWE-agent
is the lighter option and also speaks the OpenAI-compatible API, so the same DeepSeek/MiMo
base URLs and keys apply. Don't over-engineer this until there's a concrete need.
