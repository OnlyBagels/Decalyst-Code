# Decalyst-Code

A two-agent harness for generating TypeScript projects from a single prompt. A frontier model plans and reviews. A 428M-parameter local model writes files. The harness owns the filesystem, runs the tests, and feeds errors back.

> **Status:** v0.1 — v1 harness works (19/19 unit tests passing). v2 rewrite in progress on `dev`: tool registry, multi-turn orchestrator loop, envelope-based worker tool use, Ink TUI. See the roadmap below.

## Why

Frontier models are smart and expensive. A 428M local TypeScript model is cheap and narrow. Pair them: one plans, the other writes. The harness keeps both honest with snapshots, path policy, and a real test loop.

## How the pair works

```
You type a TS request
        |
        v
+----------------------------------+
| Orchestrator (frontier, via      |
| OpenRouter)                      |
|  - plans 3-8 files               |
|  - calls tools: web search,      |
|    npm view, read .d.ts, etc.    |
|  - reviews tsc and vitest errors |
+----------------------------------+
        | dispatch_worker(task)
        v
+----------------------------------+
| Worker (local Decalyst-TS via    |
| mistral.rs)                      |
|  - five tools: peek_signature,   |
|    edit_file, create_file,       |
|    submit, report_blocker        |
|  - one file or one edit per task |
+----------------------------------+
        |
        v
  Harness validates JSON,
  applies edits, runs tsc and
  vitest, captures errors,
  loops back to orchestrator.
```

## Quickstart

Requires Node 20+ and a running local Decalyst-TS server (mistral.rs).

```bash
git clone https://github.com/OnlyBagels/Decalyst-Code
cd Decalyst-Code
npm install
cp .env.example .env       # add your OpenRouter key
mistralrs-server --port 1234 plain -m /path/to/decalyst-ts-final
npm run dev -- run "Build a Fastify TypeScript todo API with Zod and vitest" --workspace ./out
```

After it finishes:

```bash
npm run dev -- inspect 2026-05-16T22-30-14Z
```

## What gets written

Allowed paths: `src/**`, `tests/**`, `README.md`, `package.json`, `tsconfig.json`, `eslint.config.*`, `vitest.config.*`, `.env.example`. Anything else is denied by `src/files/path-policy.ts`.

Every run lands in `runs/<run-id>/`:

- `request.md`, `plan.json`, `tasks.json`
- `model-calls/<task>.system.txt`, `.user.txt`, `.response.txt`, `.parsed.json`
- `patches/<task>.json`
- `command-results/*.json`
- `final-report.md`

## Constraints

- 3-8 files per project, 1-3 files per fixer task
- 5 fixer rounds max
- 2 worker tasks in parallel by default
- 12k chars of context per worker call
- Path policy denies `.env`, `node_modules`, lockfiles, `.git`, `Dockerfile`, `.github/**`
- Patches snapshot before write and roll back on TypeScript parse failure

## Roadmap

The v2 rewrite adds tools, an Ink TUI, and a mode controller. Phases:

1. Tool registry and schemas
2. Worker rewrite (envelope-based tool use, `edit_file` semantics)
3. Orchestrator rewrite (multi-turn tool-use loop)
4. Mode controller (plan / execute / review)
5. Rich tools (web_search, npm_view, read_dts, scratchpad, dry_compile)
6. Event bus and headless printer
7. Ink TUI (token meters, phase bar, ask-user modal, log/diff/tool views)
8. End-to-end integration tests

Active work happens on the `dev` branch. `main` only receives merges after a phase verifies end-to-end.

## Project layout

- `src/orchestrator/`, `src/workers/` — agent loops (v1, replaced in Phase 3)
- `src/tools/` — tool registry and handlers (added in Phase 1)
- `src/files/` — path policy, snapshots, hashing
- `src/patches/` — patch validation and application
- `src/context/` — repo summary, import graph, token budget
- `src/runners/` — tsc, vitest, eslint command runner and parsers
- `src/traces/` — per-run artifact writer
- `tests/` — vitest suites

## Contributing

Read `CLAUDE.md` first. Two things matter:

- Writing style follows `github.com/conorbronsdon/avoid-ai-writing`. No marketing voice in comments, commits, or docs.
- Commits land on `dev`. `main` only receives merges after `npm run typecheck` and `npm test` pass.

Open issues and PRs at `github.com/OnlyBagels/Decalyst-Code`.

## License

MIT. See `LICENSE`.
