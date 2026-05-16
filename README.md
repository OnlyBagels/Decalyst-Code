# Decalyst-Code

An orchestrator + swarm harness for generating code from a single prompt. A frontier model plans, dispatches, and reviews. A swarm of cheap workers writes files in parallel. The harness owns the filesystem, runs verification commands, and feeds errors back.

> **Status:** v0.1 — v1 harness works (20/20 unit tests passing). v2 rewrite in progress on `dev`: tool registry, multi-turn orchestrator loop, envelope-based worker tool use, Ink TUI, CodeGraph + Headroom integration. See the roadmap below.

## Why

Frontier models are smart and expensive. Cheap models — local or remote — are narrow but plentiful. Pair them: the frontier model plans and reviews, the cheap models do the bulk writing in parallel. The harness keeps both honest with snapshots, path policy, and a real verification loop.

Works with any OpenAI-compatible backend: mistral.rs, llama.cpp server, ollama, vLLM, OpenRouter, DeepSeek, OpenAI, Together AI, and others. Any language — file type is inferred from the path extension.

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
  applies edits with snapshots,
  runs verification commands,
  feeds errors back to the
  orchestrator for the next round.
```

The user sets a hard cap on swarm size. The orchestrator decides how many workers to spawn within that cap.

## Quickstart

Requires Node 20+ and at least one OpenAI-compatible model endpoint.

```bash
git clone https://github.com/OnlyBagels/Decalyst-Code
cd Decalyst-Code
npm install
cp .env.example .env       # add API keys and base URLs
npm run dev -- run "Build a Fastify TypeScript todo API with Zod and vitest" --workspace ./out
```

Example local swarm using mistral.rs:

```bash
mistralrs-server --port 1234 plain -m /path/to/your/model
```

Or point `SWARM_BASE_URL` at any remote endpoint (OpenRouter, DeepSeek, OpenAI, etc.) using a cheap model.

Inspect a finished run:

```bash
npm run dev -- inspect 2026-05-16T22-30-14Z
```

## What gets written

Path policy uses a denylist. Blocked: `.env`, `.git/`, `node_modules/`, `dist/`, `build/`, `coverage/`, lockfiles, `.ssh/`, `.aws/`, `id_rsa*`, absolute paths, path traversal. Anything else is allowed.

Every run lands in `runs/<run-id>/`:

- `request.md`, `plan.json`, `tasks.json`
- `model-calls/<task>.system.txt`, `.user.txt`, `.response.txt`, `.parsed.json`
- `patches/<task>.json`
- `command-results/*.json`
- `final-report.md`

## Constraints

- Swarm size hard-capped by `SWARM_CONCURRENCY` (orchestrator dispatches up to this many in parallel)
- `MAX_FIX_ROUNDS` review-and-fix passes before bailing (default 5)
- 12k chars of context per worker call
- Patches snapshot before write and roll back on validation failure

## Roadmap

v2 rewrite phases (active on `dev`):

1. Tool registry and schemas
2. Worker rewrite (envelope-based tool use, `edit_file` semantics)
3. Orchestrator rewrite (multi-turn tool-use loop, Opus-4.7-level tool surface)
4. Mode controller (plan / execute / review)
5. Rich tools (web_search, npm_view, read_dts, scratchpad, dry_compile) + CodeGraph integration for indexing
6. Event bus and headless printer
7. Ink TUI (token meters, phase bar, ask-user modal, log/diff/tool views)
8. Headroom integration for context compression
9. End-to-end integration tests

`main` only receives merges after a phase verifies end-to-end.

## Project layout

- `src/orchestrator/`, `src/workers/` — agent loops (v1, replaced in Phase 2–3)
- `src/tools/` — tool registry and handlers (added in Phase 1)
- `src/files/` — path policy, snapshots, hashing
- `src/patches/` — patch validation and application
- `src/context/` — repo summary, import graph, token budget
- `src/runners/` — verification command runner and parsers
- `src/tui/` — Ink TUI components (added in Phase 7)
- `src/traces/` — per-run artifact writer
- `tests/` — vitest suites

## Contributing

Read `CLAUDE.md` first. Two rules matter:

- Writing style follows `github.com/conorbronsdon/avoid-ai-writing`. No marketing voice in comments, commits, or docs.
- Commits land on `dev`. `main` only receives merges after `npm run typecheck` and `npm test` pass.

Open issues and PRs at `github.com/OnlyBagels/Decalyst-Code`.

## License

MIT. See `LICENSE`.
