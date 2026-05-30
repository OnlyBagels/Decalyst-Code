# Decalyst-Code

Open-source code-generation harness. A frontier model plans and reviews. A swarm of cheap models writes files in parallel. Works across any language and any OpenAI-compatible backend.

> **Status:** active development. The harness runs two ways: a self-contained run where an in-repo frontier model plans and reviews, and `swarm-exec`, where an external orchestrator (Claude Code or any agent) owns planning and review and uses the swarm as the engine. The `swarm-exec` path adds multi-backend tiers, contract-first plans, file grouping, an automated fix-loop, and per-run telemetry. 500+ tests pass.

## Why

Frontier models are smart and expensive. Cheap models — local or remote — are narrow but plentiful. Pair them: the frontier model plans and reviews, the cheap models do the bulk writing in parallel. The harness owns the filesystem, runs verification commands, and keeps both honest with path policy, snapshots, file locks, and a real test loop.

## What it generates

Any language. File type is inferred from the path extension. Verification commands adapt to the project kind detected at the workspace root. Supported project kinds today: TypeScript / JavaScript (Node, tsc, vitest), Python (mypy, pytest, ruff), Rust (cargo check / test / clippy / fmt), Go (go vet, go test, gofmt), Ruby (bundle, rake), and generic — any file the orchestrator can name, the swarm can write.

## How the pair works

```
You type a request
       |
       v
+----------------------------------+
| Orchestrator (frontier model)    |
|  - plans the file list           |
|  - dispatches the swarm          |
|  - reviews errors                |
|  - schedules fixers              |
+----------------------------------+
       | dispatch up to N workers
       v
+----------------------------------+
| Swarm (cheap models, parallel)   |
|  - one task per worker           |
|  - writes one file or one edit   |
|  - returns JSON                  |
|  - no plan, no shell, no browse  |
+----------------------------------+
       |
       v
  Harness validates JSON,
  applies edits with snapshots
  + file locks, runs verification
  commands, feeds errors back
  to the orchestrator.
```

The user sets a hard cap on swarm size. The orchestrator decides how many workers to spawn within that cap.

## Driving it from an external orchestrator (`swarm-exec`)

The orchestrator does not have to be a model this repo spawns. `swarm-exec` lets an
external agent (Claude Code, or any tool that can write a file and run a command) own the
planning and review, and use the swarm purely as the engine:

```bash
# the agent writes plan.json, then:
npm run dev -- swarm-exec --plan plan.json --workspace ./out --verify
# -> writes ./out, runs verify, prints result.json: applied/failed/blocked/verify/usage
```

The plan is a JSON contract the agent authors. Three things keep a multi-file build from
drifting:

- **A `contract`** — the canonical types and exact module signatures, broadcast to every
  worker (and cached as a shared prompt prefix). Workers import these names; they never
  redefine them.
- **`group`** — coupled files (a type plus its store plus its test) are written by one
  worker in a single shot, so their shared seam agrees by construction.
- **`dependsOn`** — the real dependency DAG. Independent groups run in parallel; the rest
  wait. Workers receive their dependency files as read-only context.

Workers run across one or more **tiers** of backends at once. `--tier bulk` (the default)
uses the cheap models for volume; `--tier pro` uses stronger models for the hard files.
After the swarm, `--verify` runs typecheck and tests, and an automated fix-loop feeds the
errors back and retries failed or blocked groups until the project is clean or the round
budget runs out. Every run reports tokens, cache-hit rate, cost, and time.

The `claude/` folder ships a portable copy of the routing skill and a `swarm-build` skill
that drive this flow from Claude Code. See `claude/README.md` and `.env.example` for the
tiered backend setup.

## Quickstart

Requires Node 20+ and at least one OpenAI-compatible model endpoint.

```bash
git clone https://github.com/OnlyBagels/Decalyst-Code
cd Decalyst-Code
npm install
cp .env.example .env       # add API keys and base URLs
npm run dev -- run "build a Python CLI that sorts CSVs by column" --workspace ./out
```

Local swarm via mistral.rs:

```bash
mistralrs-server --port 1234 plain -m /path/to/your/model
```

Or point `SWARM_BASE_URL` at any remote endpoint (OpenRouter, DeepSeek, OpenAI, Together AI) using a cheap model.

Inspect a finished run:

```bash
npm run dev -- inspect 2026-05-16T22-30-14Z
```

## Backends

Any OpenAI-compatible endpoint works for both the orchestrator and the swarm. For local models: mistral.rs, llama.cpp server, ollama, vLLM. For remote: OpenRouter, DeepSeek, OpenAI, Anthropic via OpenAI-compatible adapter, Together AI.

The orchestrator uses tool-use (function calling). The swarm uses an envelope JSON protocol so smaller models without native tool-use can participate.

## Permission gates

Every tool call passes through the registry's permission layer. Defaults:

- Read-only (glob, grep, outline, find_symbol, npm_view, pkg_view, peek_signature) — auto-approve
- File writes (create_file, edit_file) — ask once per file, then remembered for the session
- Network (web_search, fetch_url, prior_runs_search) — ask each time
- Command execution (install, build) — ask once per kind; idempotent commands (typecheck, test, lint, format) auto-approve

CLI flag, slash command (`/permissions`), and per-project config can override any default.

## What gets written

Path policy uses a denylist. Blocked: `.env`, `.git/`, `node_modules/`, `dist/`, `build/`, `coverage/`, lockfiles, `.ssh/`, `.aws/`, `id_rsa*`, absolute paths, path traversal. Anything else is allowed.

Every run lands in `runs/<run-id>/`:

- `request.md`, `plan.json`, `tasks.json`
- `model-calls/<task>.system.txt`, `.user.txt`, `.response.txt`, `.parsed.json`
- `patches/<task>.json`
- `command-results/*.json`
- `tool-calls/<seq>.json` (audit log)
- `scratchpad.md` (orchestrator's persistent notes across fixer rounds)
- `final-report.md`

## Constraints

- Swarm size hard-capped by `SWARM_CONCURRENCY`
- `MAX_FIX_ROUNDS` review-and-fix passes before bailing
- File-level locks serialize same-file edits across the swarm
- Optimistic concurrency via SHA256 catches edits that race the lock
- Patches snapshot before write and roll back on validation failure

## Roadmap

v2 rewrite, active on `dev`:

| Phase | Status |
|---|---|
| Tool registry, permission gates, file locks | done |
| Typed event bus | done |
| Code intelligence (tree-sitter + SQLite + FTS5; CodeGraph-inspired) | done |
| Context compression (text/JSON/code/cache-align; Headroom-inspired) | done |
| Mode controller (plan/execute/review state machine + budgets) | done |
| Swarm worker envelope loop with 5 tools and edit_file semantics | done |
| Research tools (web_search, fetch_url, npm/pip/cargo/go view) | done |
| Inspect tools (glob, grep, read_file, outline, find_symbol, import_graph, read_dts) | done |
| Verify tools + multi-language command runner | done |
| Orchestrator multi-turn tool-use loop | in progress |
| Coordinate, memory, meta tools | in progress |
| Interactive shell (REPL, intent classifier, slash commands) | planned |
| Streaming + cancellation | planned |
| Ink TUI (token meters, phase bar, ask-user modal, log/diff/tool views) | planned |
| Headless printer (CI mode) | planned |
| Vendor agent adapters (.claude/, .cursor/, .kiro/ for skills, memory, conventions) | planned |
| End-to-end integration tests | planned |

`main` only receives merges after a phase verifies end-to-end. Active work on `dev`.

## Project layout

- `src/agents/` — orchestrator + swarm worker agents
- `src/tools/` — tool registry, permission gates, file locks, handler modules
- `src/modes/` — plan / execute / review state machine and budgets
- `src/services/code-index/` — tree-sitter parsers + SQLite + FTS5 source indexer
- `src/services/compress/` — deterministic context compression
- `src/services/{web-client,pkg-client,sandbox-eval}.ts` — research and sandbox utilities
- `src/events/` — typed event bus
- `src/runners/` — multi-language command runner, output parsers
- `src/files/` — path policy, snapshots, hashing
- `src/patches/` — patch validation and application
- `src/models/` — OpenAI-compatible orchestrator + swarm model clients
- `src/traces/` — per-run artifact writer
- `tests/` — vitest suites (269 at HEAD)

The v1 modules under `src/core/`, `src/planner/`, `src/reviewer/`, and `src/workers/worker-runner.ts` stay functional alongside the v2 work until the migration completes.

## Contributing

Two rules matter:

- Writing style follows `github.com/conorbronsdon/avoid-ai-writing`. No marketing voice in comments, commits, or docs.
- Commits land on `dev`. `main` only receives merges after `npm run typecheck` and `npm test` pass.

Open issues and PRs at `github.com/OnlyBagels/Decalyst-Code`.

## Credits

This project draws design inspiration from two other open-source projects:

- CodeGraph by colbymchenry (MIT) — semantic code indexing, reimplemented natively in TypeScript
- Headroom by chopratejas (Apache 2.0) — context compression strategies, reimplemented as deterministic native code (no ML inference)

Both were studied for design; no source was copied. Implementations are original.

## Development

Built with significant AI assistance. The v2 rewrite landing on `dev` is produced by a swarm of Claude agents — the same architectural pattern the harness itself implements — coordinated under human review. Design decisions, integration, writing-style enforcement (per `github.com/conorbronsdon/avoid-ai-writing`), and the final approval on every commit are human-driven; bulk file production is automated.

The harness is, in effect, dogfooding the pattern it ships.

## License

MIT. See `LICENSE`.
