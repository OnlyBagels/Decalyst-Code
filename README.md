# Decalyst-Code

A code-generation harness. A smart, expensive model plans and reviews; a swarm of cheap models writes the files in parallel. Works across any language and any OpenAI-compatible backend.

---

## What it is

Frontier models are smart and expensive. Cheap models, local or remote, are narrow but plentiful. Decalyst pairs them: the frontier model plans the file list and reviews the output, the cheap models do the bulk writing. The harness sits in the middle and owns the filesystem, the file locks, the rollback snapshots, and the verify loop.

```
You describe what to build
        │
        ▼
  Orchestrator (frontier model)
  plans files · writes the contract · dispatches · reviews · schedules fixes
        │  up to N workers in parallel
        ▼
  Swarm (cheap models)
  one task each · writes a file or a group · returns JSON · no shell, no browse
        │
        ▼
  Harness validates JSON, applies edits with snapshots + locks,
  runs typecheck/tests, feeds errors back to the orchestrator.
```

Three things keep a multi-file build from drifting:

- **Contract** — the canonical types and exact signatures, written once and broadcast to every worker as a cached prompt prefix. Workers import those names; they never redefine them.
- **Grouping** — coupled files (a type, its store, its test) go to one worker and are written in a single shot, so their seam agrees by construction.
- **Dependency DAG** — `dependsOn` sets the real order. Independent groups run in parallel; dependents wait and get their dependency files as read-only context.

After the swarm, `--verify` runs the project's typecheck and tests, and an automated fix-loop feeds errors back and retries failed groups until it is clean or the round budget runs out.

It writes any language (type inferred from the path). Verify commands are wired for TypeScript/JavaScript, Python, Rust, Go, and Ruby, with a generic fallback for anything else.

---

## Setup

Node 20+ and at least one OpenAI-compatible endpoint.

```bash
git clone https://github.com/OnlyBagels/Decalyst-Code
cd Decalyst-Code
npm install
cp .env.example .env        # add API keys + base URLs
```

### Backends (`.env`)

Each backend is one OpenAI-compatible endpoint, defined as a numbered group. Concurrency caps stack, so swarm width is the sum of the per-backend caps. Backends sort into **tiers**; `swarm-exec --tier <name>` runs one tier.

```ini
SWARM_BACKEND_1_NAME=deepseek
SWARM_BACKEND_1_BASE_URL=https://api.deepseek.com
SWARM_BACKEND_1_API_KEY=          # .env only — never commit this
SWARM_BACKEND_1_MODEL=deepseek-v4-flash
SWARM_BACKEND_1_CONCURRENCY=24
SWARM_BACKEND_1_TIER=bulk

SWARM_BACKEND_2_NAME=deepseek-pro
SWARM_BACKEND_2_BASE_URL=https://api.deepseek.com
SWARM_BACKEND_2_MODEL=deepseek-v4-pro
SWARM_BACKEND_2_TIER=pro
SWARM_BACKEND_2_REVIEW=true        # put this backend on the final-review panel
```

| Setting | Effect |
|---|---|
| `_BASE_URL` `_API_KEY` `_MODEL` | point at any OpenAI-compatible endpoint |
| `_CONCURRENCY` | per-backend parallel cap; the pool routes to the least-busy backend |
| `_TIER` | `bulk` or `pro` |
| `_THINKING` / `_REASONING_EFFORT` | reasoning toggle where the model supports it |
| `_ENABLED=false` | keep a backend configured but skip it (numbering gaps are fine) |
| `_REVIEW=true` | add this backend to the final-review panel (any tier, as many as you like) |

Anything that speaks the OpenAI chat-completions API works: DeepSeek, OpenRouter, OpenAI, Together, Groq, or a local server (ollama, llama.cpp, vLLM, LM Studio). See [`.env.example`](.env.example) for the full annotated template. Keys stay in `.env`, which is gitignored; the swarm can never write `.env`, `.git/`, credentials, or outside the workspace.

### Run it

```bash
# self-contained: an in-repo orchestrator plans and reviews
npm run dev -- run "build a Fastify todo API with SQLite" --workspace ./out

# external orchestrator: your agent writes plan.json and drives the swarm
npm run dev -- swarm-exec --plan plan.json --workspace ./out --verify --json
```

`swarm-exec` prints `result.json`: `{ backends, applied[], failed[], blocked[], verify, usage, fixRounds }`, where `usage` reports tokens, cache-hit rate, cost, and time. Every run is also saved under `runs/<id>/`; `npm run dev -- inspect <id>` prints its report.

### The plan (`swarm-exec`)

The orchestrator authors a `ProjectPlan` JSON:

```jsonc
{
  "projectName": "notes-api",
  "constraints": ["match existing conventions", "no new dependencies"],
  // canonical types + exact signatures; workers import these, never redefine them
  "contract": "export interface Note { id: string; body: string; createdAt: number }\nNoteStore.create(body: string): Note\nNoteStore.list(): Note[]",
  "files": [
    { "path": "src/types.ts",      "role": "schema-writer",  "purpose": "Note type + zod schema", "group": "core" },
    { "path": "src/store.ts",      "role": "service-writer", "purpose": "in-memory NoteStore",     "group": "core" },
    { "path": "src/routes.ts",     "role": "route-writer",   "purpose": "Fastify CRUD routes",     "dependsOn": ["src/store.ts"] },
    { "path": "src/routes.test.ts","role": "test-writer",    "purpose": "route tests",             "dependsOn": ["src/routes.ts"] }
  ]
}
```

- `role` is one of `scaffold-writer`, `route-writer`, `schema-writer`, `service-writer`, `test-writer`, `fixer`, `refactor-worker`, `docs-worker`.
- `group` files sharing a string are written together by one worker. `dependsOn` sets the order. `contract` is the single most important field for multi-file correctness.

### Drive it from your own LLM

Paste this into your orchestrator (Claude Code, Cursor, or any capable model) at the start of a build. Fill in the one bracketed path.

````text
You are the ORCHESTRATOR for the Decalyst-Code swarm. You plan and review; a swarm
of cheap models writes the files. You never write bulk files yourself.

The harness is at: [ABSOLUTE PATH TO Decalyst-Code]. Its backends are configured in
that repo's .env. Drive it with:

  cd [PATH] && npm run dev -- swarm-exec --plan <plan.json> --workspace <dir> --verify --json

Loop:
1. SCOPE every file. Split into a swarm bucket (scaffolding, types, CRUD, glue, tests,
   docs) and a hands-on bucket (crypto, auth, tokens/secrets, payments, migrations,
   permissions). The hands-on bucket NEVER goes in the plan — you write it yourself.
2. WRITE THE CONTRACT: canonical types + exact module signatures the files share.
   A weak contract is the #1 cause of drift.
3. WRITE THE PLAN as ProjectPlan JSON — { projectName, constraints[], contract,
   files[{path, role, purpose, dependsOn?, group?}] }. GROUP tightly-coupled files
   under one group string. Set dependsOn only where truly needed (fewer deps = wider
   parallelism). role ∈ scaffold-writer | route-writer | schema-writer |
   service-writer | test-writer | fixer | refactor-worker | docs-worker.
4. RUN the bulk tier first; re-run the hard files (or failures) with --tier pro.
5. READ result.json. For failed/blocked or verify errors, write a small fix-plan.json
   targeting just those files (error text in `purpose`) and re-run. Cap ~3 rounds.
6. REVIEW every applied file yourself: correctness, conventions, no invented APIs, no
   scope creep. Run the project's own typecheck/lint/tests.
7. INTEGRATE: wire in the hands-on bucket you wrote, run full verification.

Tier ladder, cheapest first: bulk swarm (most files) -> pro swarm (hard files / repeat
failures) -> you (architecture, anything risky).
````

If you use Claude Code, the [`claude/`](claude/) folder ships this as a skill with a routing hook, so you do not paste the prompt each time. See [`claude/README.md`](claude/README.md).

---

## Issues and pull requests

**Issues.** Use the templates ([bug](.github/ISSUE_TEMPLATE/bug_report.yml), [feature](.github/ISSUE_TEMPLATE/feature_request.yml)). The `claude/` skill files harness bugs for you: when the orchestrator hits a real harness fault mid-run, it runs `claude/skills/swarm-build/scripts/report-issue.mjs`, which opens an issue (or prints a prefilled link), with any keys redacted first. Security reports go through [SECURITY.md](SECURITY.md), not public issues.

**Pull requests.** Open them against `dev`. Before you do:

- `npm run typecheck`, `npm test`, and `npm run lint` pass;
- the diff is focused — one concern per PR;
- new behavior has a test, a bug fix has a test that failed before it;
- no keys or secrets in the diff.

Fill in the [PR template](.github/PULL_REQUEST_TEMPLATE.md) and link any issue it closes. That's the whole bar.

---

## License

MIT. See [LICENSE](LICENSE).
