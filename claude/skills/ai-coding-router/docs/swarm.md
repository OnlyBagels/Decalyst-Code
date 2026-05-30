# Swarm lane — decalyst-swarm

For running **many tasks at once** (5/10/15/20), OpenCode and Aider are the wrong
tool — they're single-session. The swarm lane is **decalyst-swarm**
(`github.com/OnlyBagels/Decalyst-Code`, local at `~/Desktop/decalyst-swarm`): an
orchestrator + a pool of cheap parallel workers, with file locks, snapshots, SHA256
optimistic concurrency, dependency ordering, and a multi-language verify loop.

## The key modification: Claude Code is the orchestrator

decalyst ships with its *own* frontier model as the orchestrator (plans + reviews). The
`swarm-exec` command (added on the `swarm-exec` branch) removes that brain: **Claude Code
(Opus) is the orchestrator.** Opus writes the plan, decalyst runs only the mechanism, Opus
reads the errors and writes the next plan.

```
Opus plans file list ──► plan.json
        │
        ▼
  decalyst swarm-exec  ── no orchestrator model loaded ──┐
   • planToTasks → topo-sort                              │
   • ExecutionLoop: N workers, file locks, snapshots,     │  workers never overlap
     rollback, SHA256 OCC                                 │  or apply half-writes
   • optional verify (tsc / vitest / cargo / pytest …)    │
        │                                                 │
        ▼                                                 │
  result.json  ◀──────────────────────────────────────────┘
   { applied[], failed[], blocked[], verify:{passed, errors[]} }
        │
        ▼
  Opus reads failures → writes fix-plan.json → swarm-exec again → until clean
```

## CLI contract

```
node dist/cli/index.js swarm-exec \
  --plan plan.json \        # ProjectPlan JSON (or - for stdin)
  --workspace ./out \
  --out result.json \       # also write the structured result here
  --concurrency 12 \        # parallel workers
  --verify                  # run install/typecheck/test after, include errors
```

Exit code: `0` clean, `2` had failures/blocked/verify-failed, `1` bad plan input.

**Plan in** (role is optional — inferred from the path when omitted):
```json
{ "projectName": "x",
  "files": [
    { "path": "src/a.ts", "purpose": "module a" },
    { "path": "src/b.ts", "purpose": "module b", "dependsOn": ["src/a.ts"] }
  ],
  "constraints": [] }
```
Roles (when set explicitly): `scaffold-writer`, `route-writer`, `schema-writer`,
`service-writer`, `test-writer`, `fixer`, `refactor-worker`, `docs-worker`.

**Result out** (read `<traceDir>/result.json` or the `--out` file — guaranteed clean even
if stdout has noise):
```json
{ "runId":"…","traceDir":"runs/…","totalTasks":2,
  "applied":["src/a.ts","src/b.ts"],
  "failed":[{"id":"src/c.ts","targetFiles":["src/c.ts"],"error":"…"}],
  "blocked":[], "verify":{"passed":false,"errors":[…],"commands":[…]} }
```

## Worker models

decalyst workers use any OpenAI-compatible endpoint via `SWARM_BASE_URL` / `SWARM_MODEL` /
`SWARM_API_KEY` (DeepSeek, MiMo, or a local mistral.rs/llama.cpp/ollama/vLLM server). The
router defaults apply: DeepSeek V4 Flash / MiMo V2.5 are the cheap swarm workers; the Pro
tiers for harder files.

DeepSeek model IDs confirmed live via `/models` on 2026-05-29: **`deepseek-v4-flash`** and
**`deepseek-v4-pro`** — both are **reasoning models** (they emit `reasoning_content` before
the answer in `content`). Give workers a generous `max_tokens` so reasoning doesn't starve
the output, and read `content`, not `reasoning_content`. MiMo IDs (`mimo-v2.5`,
`mimo-v2.5-pro`) are still unconfirmed — check MiMo's `/models` before a paid run.

## The one safety rule

**One `swarm-exec` owns a workspace at a time.** decalyst's locks make N workers safe
*within* one tree. For more parallelism, fan out across **separate worktrees** — one
`swarm-exec` per tree — never two against the same tree.

| Tier | Who | Parallelism |
|---|---|---|
| Within a feature | decalyst `swarm-exec` | N workers, locks prevent overlap |
| Across features | Claude Code worktree-agents | one `swarm-exec` per isolated tree |

## When to use which lane

| Need | Lane |
|---|---|
| One interactive task | OpenCode |
| Two-model bakeoff | Aider (optional) |
| Many files / a whole feature in parallel | **decalyst-swarm `swarm-exec`** |
