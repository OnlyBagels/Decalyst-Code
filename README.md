# Decalyst-Code

A code-generation harness built around one idea: a smart, expensive model plans and reviews; a swarm of cheap models writes the files in parallel. The harness owns the filesystem, runs the verification commands, and keeps both sides honest with path policy, snapshots, file locks, and a real test loop.

It works across any language and any OpenAI-compatible backend (DeepSeek, MiMo, OpenRouter, OpenAI, Together, Groq, or a local ollama / llama.cpp / vLLM / LM Studio server).

> **Status:** active development. Two run modes ship today. See [Roadmap](#roadmap).

---

## Contents

- [Why pair a frontier model with cheap ones](#why)
- [How it works](#how-it-works)
- [Two ways to run it](#two-ways-to-run-it)
- [Quickstart](#quickstart)
- [Backends and tiers (`.env`)](#backends-and-tiers)
- [The plan contract (`swarm-exec`)](#the-plan-contract)
- [Drive it from your own LLM (paste-in prompt)](#drive-it-from-your-own-llm)
- [The result file](#the-result-file)
- [The `claude/` skill pack](#the-claude-skill-pack)
- [Safety: permission gates and path policy](#safety)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [Credits](#credits)
- [License](#license)

---

## Why

Frontier models are smart and expensive. Cheap models, local or remote, are narrow but plentiful. Pair them and you get most of the quality at a fraction of the cost:

- the frontier model **plans** the file list and the contract, then **reviews** the output and **schedules fixes**;
- the cheap models do the **bulk writing** in parallel, one task each, no planning and no shell access.

The harness sits in the middle. It validates every worker's output, applies edits under file locks with rollback snapshots, runs the project's own typecheck and tests, and feeds errors back. The expensive model makes the decisions; the cheap swarm produces the volume.

On a clean greenfield build the bulk tier writes 80–90% of the files. The expensive tiers own the hard files and the final review.

---

## How it works

```
You describe what to build
            │
            ▼
┌─────────────────────────────────┐
│ Orchestrator (frontier model)   │
│  • plans the file list          │
│  • writes the shared contract   │
│  • dispatches the swarm         │
│  • reads errors, schedules fixes│
│  • reviews the finished work    │
└─────────────────────────────────┘
            │ dispatch up to N workers (the cap is yours)
            ▼
┌─────────────────────────────────┐
│ Swarm (cheap models, parallel)  │
│  • one task per worker          │
│  • writes one file or one group │
│  • returns a JSON envelope      │
│  • no plan, no shell, no browse │
└─────────────────────────────────┘
            │
            ▼
  Harness validates the JSON, applies edits with
  snapshots + file locks, runs typecheck/tests,
  and feeds any errors back to the orchestrator.
```

Three mechanics keep a multi-file build from drifting apart:

- **Contract.** The orchestrator writes the canonical types and the exact module signatures once. That text is broadcast to every worker as a shared, cached prompt prefix. Workers import those names; they never redefine them. Seams agree because everyone read the same contract.
- **Grouping.** Coupled files (a type plus its store plus its test) are assigned to one worker and written in a single shot, so their shared seam agrees by construction instead of by luck.
- **Dependency DAG.** `dependsOn` declares the real order. Independent groups run in parallel; dependents wait and receive their dependency files as read-only context.

After the swarm finishes, `--verify` runs the project's typecheck and tests. An automated fix-loop feeds the errors back, resets failed or blocked groups to pending, and re-runs until the project is clean or the round budget runs out.

---

## Two ways to run it

### 1. `run` — self-contained

An in-repo frontier model (via OpenRouter) plans and reviews; the local worker pool writes. One command, one TypeScript project:

```bash
npm run dev -- run "Build a Fastify todo API with SQLite" --workspace ./out
```

### 2. `swarm-exec` — external orchestrator

The orchestrator does not have to be a model this repo spawns. Any agent that can write a file and run a command (Claude Code, Cursor, your own script) owns the planning and review, and uses the swarm purely as the engine:

```bash
# the agent writes plan.json, then:
npm run dev -- swarm-exec --plan plan.json --workspace ./out --verify --json
# → writes ./out, runs verify, prints result.json:
#   { backends, applied[], failed[], blocked[], verify, usage, fixRounds }
```

This is the path the [`claude/` skill pack](#the-claude-skill-pack) and the [paste-in prompt](#drive-it-from-your-own-llm) drive. It adds multi-backend tiers, contract-first plans, file grouping, the automated fix-loop, and per-run telemetry.

Two more commands: `inspect <runId>` prints the final report for a past run under `./runs`, and `chat` opens an interactive REPL.

---

## Quickstart

Requires Node 20+ and at least one OpenAI-compatible model endpoint.

```bash
git clone https://github.com/OnlyBagels/Decalyst-Code
cd Decalyst-Code
npm install
cp .env.example .env        # add API keys + base URLs (see below)
npm run dev -- run "build a Python CLI that sorts CSVs by column" --workspace ./out
```

Local-only swarm (no API keys, no network):

```bash
# start any OpenAI-compatible local server, e.g. ollama on :11434, then in .env:
#   SWARM_BACKEND_1_BASE_URL=http://localhost:11434/v1
#   SWARM_BACKEND_1_API_KEY=local
#   SWARM_BACKEND_1_MODEL=qwen2.5-coder:32b
npm run dev -- run "build a small REST API for notes" --workspace ./out
```

Inspect a finished run:

```bash
npm run dev -- inspect 2026-05-30T22-30-14Z
```

---

## Backends and tiers

Every backend is one OpenAI-compatible endpoint. You define them as numbered groups in `.env`. Their concurrency caps **stack**, so the effective swarm width is the sum of the per-backend caps. Backends are sorted into **tiers**; `swarm-exec --tier <name>` runs one tier at a time.

```ini
# ---------- TIER: bulk (default) — cheap workhorses, ~80-90% of the volume ----------
SWARM_BACKEND_1_ENABLED=true
SWARM_BACKEND_1_NAME=deepseek
SWARM_BACKEND_1_BASE_URL=https://api.deepseek.com
SWARM_BACKEND_1_API_KEY=          # lives in .env only — never commit this
SWARM_BACKEND_1_MODEL=deepseek-v4-flash
SWARM_BACKEND_1_CONCURRENCY=24
SWARM_BACKEND_1_THINKING=disabled
SWARM_BACKEND_1_TIER=bulk

SWARM_BACKEND_2_NAME=mimo
SWARM_BACKEND_2_BASE_URL=https://token-plan-sgp.xiaomimimo.com/v1
SWARM_BACKEND_2_MODEL=mimo-v2.5
SWARM_BACKEND_2_CONCURRENCY=16
SWARM_BACKEND_2_TIER=bulk

# ---------- TIER: pro (--tier pro) — stronger models for hard / important files ----------
SWARM_BACKEND_3_NAME=deepseek-pro
SWARM_BACKEND_3_BASE_URL=https://api.deepseek.com
SWARM_BACKEND_3_MODEL=deepseek-v4-pro
SWARM_BACKEND_3_CONCURRENCY=12
SWARM_BACKEND_3_THINKING=enabled
SWARM_BACKEND_3_REASONING_EFFORT=high
SWARM_BACKEND_3_TIER=pro
SWARM_BACKEND_3_REVIEW=true        # put this backend on the final-review panel
```

What each control does:

| Setting | Effect |
|---|---|
| `_BASE_URL`, `_API_KEY`, `_MODEL` | point a backend at any OpenAI-compatible endpoint |
| `_CONCURRENCY` | per-backend parallel cap; the pool routes each task to the least-busy backend |
| `_TIER` | `bulk` or `pro`. `swarm-exec --tier` picks the set |
| `_THINKING` | `disabled` / `enabled` for models with a reasoning toggle |
| `_REASONING_EFFORT` | `high` / `max` where supported |
| `_ENABLED=false` | keep a backend configured but skip it. Numbering gaps are fine |
| `_REVIEW=true` | add this backend to the final-review committee (any tier, as many as you like) |

Anything that speaks the OpenAI chat-completions API works: OpenRouter (one key, hundreds of models), OpenAI, Together, Groq, or a local server. See [`.env.example`](.env.example) for the full annotated template, including commented examples for OpenRouter, OpenAI, and a local endpoint.

---

## The plan contract

`swarm-exec` consumes a `ProjectPlan` JSON. The orchestrator authors it. The shape:

```jsonc
{
  "projectName": "notes-api",
  "projectKind": "typescript",          // optional — inferred from the workspace if omitted
  "framework": "fastify",               // optional
  "packageManager": "npm",              // optional
  "dependencies":    { "fastify": "^4" },   // optional
  "devDependencies": { "vitest": "^2" },    // optional

  // The contract: canonical types + exact signatures, broadcast to every worker
  // as a cached prefix. Workers import these names and never redefine them.
  "contract": "export interface Note { id: string; body: string; createdAt: number }\nNoteStore.create(body: string): Note\nNoteStore.list(): Note[]",

  "constraints": [
    "match existing project conventions",
    "no new dependencies beyond those listed"
  ],

  "files": [
    { "path": "src/types.ts",      "role": "schema-writer",  "purpose": "Note type + zod schema", "group": "core" },
    { "path": "src/store.ts",      "role": "service-writer", "purpose": "in-memory NoteStore",     "group": "core" },
    { "path": "src/routes.ts",     "role": "route-writer",   "purpose": "Fastify CRUD routes",     "dependsOn": ["src/store.ts"] },
    { "path": "src/routes.test.ts","role": "test-writer",    "purpose": "route tests",             "dependsOn": ["src/routes.ts"] }
  ],

  // Existing files workers should READ for context but never rewrite (e.g. on a fix pass).
  "contextFiles": []
}
```

Field reference:

- **`files[].path`** — where the file lands. Extension drives the file type.
- **`files[].role`** — one of `scaffold-writer`, `route-writer`, `schema-writer`, `service-writer`, `test-writer`, `fixer`, `refactor-worker`, `docs-worker`. Pick the closest; it shapes the worker's system prompt.
- **`files[].purpose`** — one line telling the worker exactly what this file is. On a fix pass, put the error text here.
- **`files[].dependsOn`** — paths this file needs first. Sets the DAG. Fewer deps = wider parallelism.
- **`files[].group`** — files sharing a group string are written by **one** worker in a single shot. Group tightly-coupled files so their seam can't drift.
- **`contract`** — the single most important field for multi-file correctness. Canonical types and exact signatures. Skip it and workers will each invent their own version of the shared types.
- **`constraints`** — global rules every worker must honor.

Project kinds with verification wired up: TypeScript/JavaScript (tsc, vitest), Python (mypy, pytest, ruff), Rust (cargo check/test/clippy/fmt), Go (go vet, go test, gofmt), Ruby (bundle, rake), and a generic fallback for any other file.

---

## Drive it from your own LLM

Paste this into your orchestrator (Claude Code, Cursor, or any capable model) at the start of a build. It tells the model its job, the command, the plan shape, and the rules that keep the swarm from drifting. Fill in the one bracketed path.

````text
You are the ORCHESTRATOR for the Decalyst-Code swarm. You plan and review; a swarm
of cheap models writes the files. You never write bulk files yourself.

The harness lives at: [ABSOLUTE PATH TO Decalyst-Code]
Its backends are already configured in that repo's .env. You drive it with:

  cd [PATH] && npm run dev -- swarm-exec --plan <plan.json> --workspace <target-dir> --verify --json

Your loop:

1. SCOPE. List every file the task needs. Split them into two buckets:
   - swarm bucket: scaffolding, types, CRUD, glue, tests, docs (safe, mechanical).
   - hands-on bucket: anything touching crypto, auth/sessions, tokens/secrets,
     payments, DB migrations, or permissions. These NEVER go in the plan. You write
     them yourself after the swarm scaffolds around them.

2. WRITE THE CONTRACT. Before the file list, write the canonical types and the exact
   module signatures the files share. This is the `contract` field. Workers import
   these names and never redefine them. A weak contract is the #1 cause of drift.

3. WRITE THE PLAN as ProjectPlan JSON:
   { projectName, constraints[], contract, files[] } where each file is
   { path, role, purpose, dependsOn?, group? }.
   - role ∈ scaffold-writer | route-writer | schema-writer | service-writer |
     test-writer | fixer | refactor-worker | docs-worker
   - GROUP tightly-coupled files (a type + its store + its test) under one group
     string so one worker writes them together and the seam can't drift.
   - Set dependsOn only where a file truly needs another first. Fewer deps = more
     parallelism.

4. RUN the bulk tier first:
     npm run dev -- swarm-exec --plan plan.json --workspace <dir> --verify --json
   For the hard/important files, run a second pass with --tier pro.

5. READ result.json: { applied[], failed[], blocked[], verify, usage, fixRounds }.
   For anything failed/blocked or any verify error, write a small fix-plan.json that
   targets just those files (put the error text in `purpose`) and re-run. Cap at ~3
   rounds; if a file keeps failing, write it yourself.

6. REVIEW every applied file yourself: correctness, project conventions, no invented
   APIs, no scope creep. Run the project's own typecheck/lint/tests on the output.

7. INTEGRATE: wire in the hands-on bucket you wrote directly, then run full
   verification before calling it done.

Tier ladder, cheapest first: bulk swarm (most files) → pro swarm (hard files / repeat
failures) → you (architecture, decisions, anything risky). Never push a hard file down
to save pennies; never pull boilerplate up to yourself.
````

If you use Claude Code, the [`claude/` skill pack](#the-claude-skill-pack) wires this same flow up as a skill with a router hook, so you do not have to paste the prompt each time.

---

## The result file

`swarm-exec --json` (or `--out result.json`) prints:

```jsonc
{
  "backends": ["deepseek", "mimo"],     // which backends ran
  "applied":  ["src/types.ts", "..."],  // files written and validated
  "failed":   [],                       // workers that errored or returned bad JSON
  "blocked":  [],                       // tasks whose dependencies never landed
  "verify":   { "passed": true, "typecheck": "...", "test": "..." },
  "fixRounds": 0,                       // automated fix-loop rounds spent
  "usage": {
    "calls": 6, "promptTokens": 18234, "completionTokens": 9120,
    "cacheHitTokens": 14000,            // contract prefix served from provider cache
    "costUsd": 0.0088, "elapsedMs": 52310
  }
}
```

Every run also lands in `runs/<run-id>/` with the request, plan, per-task model calls (system + user + response + parsed JSON), patches, command results, an audit log, and a final report.

---

## The `claude/` skill pack

The repo ships a portable copy of the Claude Code tooling that drives `swarm-exec`:

- **`claude/skills/ai-coding-router/`** — routes implementation work cheap-to-expensive (bulk swarm → pro swarm → Sonnet → Opus), with a `UserPromptSubmit` hook that flags implementation tasks.
- **`claude/skills/swarm-build/`** — the operational driver: scope, plan, run, review, fix. Includes `scripts/run-swarm.mjs` and `scripts/review-panel.mjs` (the multi-model final-review panel).
- **`claude/settings.snippet.json`** — the hook wiring to merge into your `settings.json`.

Copy `claude/` into your own `~/.claude/` (or a project `.claude/`) to use it. See [`claude/README.md`](claude/README.md). The folder is named `claude/` (not `.claude/`) on purpose, so it does not collide with this repo's own agent config.

---

## Safety

Every tool call passes through a permission layer. Defaults:

- read-only tools (glob, grep, outline, find_symbol, package lookups) — auto-approve;
- file writes (create_file, edit_file) — ask once per file, then remembered for the session;
- network (web_search, fetch_url) — ask each time;
- command execution — ask once per kind; idempotent commands (typecheck, test, lint, format) auto-approve.

A CLI flag, the `/permissions` slash command, or per-project config can override any default.

**Path policy** uses a denylist. Blocked: `.env`, `.git/`, `node_modules/`, `dist/`, `build/`, `coverage/`, lockfiles, `.ssh/`, `.aws/`, `id_rsa*`, absolute paths, and path traversal. Everything else is allowed. The swarm cannot write your secrets, and your API keys stay in `.env`, which is gitignored and never sent to a worker.

Patches snapshot before writing and roll back on validation failure. File-level locks serialize same-file edits across the swarm, and an optimistic SHA256 check catches edits that race the lock.

---

## Project layout

```
src/
  agents/            orchestrator + swarm worker agents
  cli/               run / swarm-exec / inspect / chat commands
  core/              execution loop, plan→tasks, run session, verify
  models/            OpenAI-compatible clients; multi-backend loader (swarm-backends.ts)
  workers/           worker pool + worker runner (system prompt, contract, retries)
  context/           token budget + context selection for each worker
  patches/           plan schema, patch validation and application
  files/             path policy, snapshots, hashing
  runners/           multi-language command runner + output parsers
  traces/            per-run artifact writer
tests/               vitest suites (gitignored; run locally)
claude/              portable Claude Code skill pack (router + swarm-build)
```

---

## Roadmap

| Area | Status |
|---|---|
| Multi-backend swarm, tiers, least-busy routing | done |
| Contract-first plans + file grouping | done |
| Automated fix-loop (failed groups + typecheck errors) | done |
| Per-run telemetry (tokens, cache hits, cost, time) | done |
| `swarm-exec` external-orchestrator path | done |
| Self-contained `run` orchestrator (OpenRouter) | done |
| Permission gates, path policy, file locks, snapshots | done |
| Code intelligence (tree-sitter + SQLite FTS5) | done |
| Context compression | done |
| Interactive REPL / TUI | in progress |
| Headless CI printer | planned |
| Vendor agent adapters (.claude / .cursor) | planned |

---

## Contributing

Issues and PRs welcome at [github.com/OnlyBagels/Decalyst-Code](https://github.com/OnlyBagels/Decalyst-Code). Read [CONTRIBUTING.md](CONTRIBUTING.md) first: it covers the branch flow (work lands on `dev`, `main` merges after verify), the commit and writing style, the test gates, and how to open a PR. Security reports go through [SECURITY.md](SECURITY.md).

---

## Credits

Two open-source projects shaped the design. Both were studied, not copied; the implementations here are original.

- **CodeGraph** by colbymchenry (MIT) — semantic code indexing, reimplemented natively in TypeScript.
- **Headroom** by chopratejas (Apache 2.0) — context-compression strategies, reimplemented as deterministic native code with no ML inference.

This harness is built with significant AI assistance, and it dogfoods its own pattern: the bulk of its files are written by a swarm under human planning, review, and final approval. Writing style across code, commits, and docs follows [github.com/conorbronsdon/avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing).

---

## License

MIT. See [LICENSE](LICENSE).
