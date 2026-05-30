---
name: ai-coding-router
description: Use this skill at the start of ANY implementation, scaffolding, refactor, or multi-file build to route the work to the right worker — and when setting up or using the command-line coding harness that routes tasks between Claude, DeepSeek V4 Flash/Pro, MiMo V2.5/Pro, the decalyst multi-backend swarm, Aider, OpenCode, and optional local OpenAI-compatible models. A UserPromptSubmit hook nudges you here on implementation prompts; risky code (security/crypto/auth/payments/migrations) never goes to the cheap swarm.
---

# AI Coding Router

A CLI-first harness for routing coding work across Claude and cheaper open-weight
coders (DeepSeek, MiMo) plus optional local models. Claude is the boss; the cheap
models are workers; OpenCode and Aider are the two harnesses that drive them.

## Auto-routing implementation work (start here)

A `UserPromptSubmit` hook (`hooks/route-implementation.mjs`) injects a short routing
reminder whenever a prompt looks like implementation work. When you see it — or any
time you're about to write code — route before you build:

1. **Classify** the task, then route up the tier ladder — cheapest tier that fits, no higher.
2. **Tier ladder:**
   - **Bulk / greenfield / many independent files / scaffolding** → invoke the
     **[swarm-build](../swarm-build/SKILL.md)** skill. It runs the **bulk swarm — DeepSeek V4
     Flash + MiMo V2.5** in parallel (~80–90% of the file volume). See [docs/swarm.md](docs/swarm.md).
   - **Harder / important files** → upgrade the swarm to the **Pros — DeepSeek V4 Pro + MiMo
     V2.5-Pro** (also where bulk-tier failures escalate; long-context too).
   - **Serious / architectural single change** → Claude Sonnet.
   - **Trivial single edit** → just do it inline. Don't over-orchestrate.
   - **Risky** (security, crypto/E2EE, auth, payments, migrations, data-loss) → **never the
     cheap swarm.** Sonnet does it, Opus reviews. No fake security, no plaintext fallback.
3. **Final review (every job): 3-model panel — Opus 4.8 + DeepSeek V4 Pro + MiMo V2.5-Pro.**
   Run the two Pro reviews alongside your own Opus pass; a finding ≥2 of 3 agree on is real.
   You (Opus) reconcile and make the call before it ships.

The bulk swarm is live and verified: DeepSeek V4 Flash (cap ~24) + MiMo V2.5 (cap ~16) run
together, thinking disabled. The hook only nudges — you still own the routing, and risky
code stays off the swarm by your decision.

## Mental model

You (Claude) are not just one more model in the pool. You are the **router**. Your
job is to read the task, decide which worker should do it, hand it off through the
right harness, and review what comes back. Cheap models do bulk work; you keep the
taste and the final say.

```
            ┌─────────────── you: plan / route / review ───────────────┐
            │                                                            │
   task ──► classify ──► pick model ──► run via OpenCode|Aider ──► review ──► ship
            (router.md)   (router.md)     (scripts/)              (you)
```

## Roles

| Role | Model | When |
|---|---|---|
| Boss / planner / router / final reviewer | **Claude Opus** | Always — you own the plan and the last look |
| High-trust serious implementation | **Claude Sonnet** | Security-sensitive, architectural, or "this must be right" code |
| Cheap bulk coder / scaffold / medium edits | **DeepSeek V4 Flash** | The default worker for volume |
| Hard cheap coder / long-context repo worker / second opinion | **DeepSeek V4 Pro** | Big context, harder logic, cheap second opinions |
| Challenger to Flash | **MiMo V2.5** | Bakeoff against Flash on the same task |
| Challenger to Pro | **MiMo V2.5-Pro** | Bakeoff against Pro on hard/long tasks |
| Optional local model | OpenAI-compatible local server | Offline / private / ultra-low-latency scaffold — wired later |

Full routing rules: [docs/router.md](docs/router.md).

## Harnesses

- **OpenCode** is the primary day-to-day CLI harness. Use it for interactive
  sessions, agentic edits, and quick model switching (`/models`).
- **Aider** is the controlled edit / bakeoff harness. Use it when you want tight,
  reviewable diffs or want to run the same task through two models and compare.
- **decalyst-swarm** is the swarm lane — for running many tasks at once (5–20+).
  Claude Code is the orchestrator; decalyst runs a pool of cheap parallel workers with
  file locks, snapshots, and a verify loop. See [docs/swarm.md](docs/swarm.md). Reach for
  this, not OpenCode/Aider, when the job is "build a whole feature / many files in
  parallel."

## How to use this skill

### First-time setup
1. Read [docs/provider-setup.md](docs/provider-setup.md).
2. Run `scripts/check-env.{sh,ps1}` — confirms tools are installed and reports
   which credentials are present **without printing any secret**.
3. Store keys in the harness's own credential store (see Secrets below). Do **not**
   create a project `.env`. Keys live at the user level, with the tool.
4. Wire providers: `scripts/setup-opencode.{sh,ps1}` and
   `scripts/setup-aider.{sh,ps1}` print the exact config to add (they never
   overwrite an existing config without a backup).

### Running a task
1. Classify the task (easy scaffold / medium / hard / long-context / risky) using
   [docs/router.md](docs/router.md).
2. Pick the model from the table.
3. Launch the matching script:
   - OpenCode: `run-opencode-deepseek-flash`, `-pro`, `run-opencode-mimo`, `-pro`
   - Aider: `run-aider-deepseek-flash`, `-pro`, `run-aider-mimo`, `-pro`
4. Review the output yourself (Opus) before it ships. Cheap models are workers,
   not the final reviewer.

### Bakeoffs
Use [bench/](bench/) to compare models on real tasks. See
[docs/benchmark-plan.md](docs/benchmark-plan.md) and fill in
[bench/scorecard.md](bench/scorecard.md). Do not spend API credits on a bakeoff
without the operator's explicit go-ahead.

## Secrets — non-negotiable

1. **Never expose, print, echo, or log API keys.** Not even prefixes.
2. **Never commit secrets.** No keys in any file that could land in a repo.
3. **Prefer the tool's native credential storage.** OpenCode: `opencode auth login`
   (stored at user level, outside any repo). Aider: user-level environment variables.
4. **`.env` is local-only and last-resort.** If one is ever used, it lives at the
   user level (not in a project), is gitignored, and is `chmod 600`. The harness
   CLI holds the key — the working repo holds nothing.
5. `templates/env.example` documents the variable names only. It contains no values.

## Guardrails (ask before doing)

- **Ask before installing global packages** (aider, pipx, local model servers).
- **Ask before modifying shell startup files** (`.bashrc`, `$PROFILE`, etc.).
- **Verify provider model names** against `/models` before spending credits.
  DeepSeek IDs **`deepseek-v4-flash`** and **`deepseek-v4-pro`** are confirmed live
  (`/models`, 2026-05-29) — both are reasoning models (emit `reasoning_content`; give them
  generous `max_tokens`). MiMo IDs (`mimo-v2.5`, `mimo-v2.5-pro`) are still unconfirmed —
  check MiMo's `/models` first.
- **Never overwrite an existing config** without making a backup and asking.
- **Do not call a provider or run a benchmark** without explicit approval — it costs
  money.

## File map

```
ai-coding-router/
  SKILL.md                  ← you are here
  README.md                 ← human quickstart
  templates/                ← copy-and-fill config (no secrets)
  scripts/                  ← check / setup / run launchers (.sh + .ps1)
  docs/                     ← router, provider-setup, security, benchmark-plan
  bench/                    ← 10 real tasks + scorecard
```
