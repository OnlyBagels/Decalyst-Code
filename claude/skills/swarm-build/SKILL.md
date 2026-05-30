---
name: swarm-build
description: Use when implementing a greenfield project or a feature that spans many files (a new API server, a module set, a batch of components, scaffolding). Drives the decalyst multi-backend swarm end to end - plan the file list, run swarm-exec across DeepSeek + MiMo in parallel, review every result, loop fixes. Risky code (crypto, auth, payments, migrations) stays OFF the swarm and is done directly. Pairs with the ai-coding-router skill (which decides WHEN to come here).
---

# swarm-build

The operational driver for the bulk path. `ai-coding-router` decides *whether* a task
goes to the swarm; this skill is *how* you run it. You (Opus) stay the orchestrator and
the reviewer the whole way — the swarm writes files, it does not get the last word.

## When to use

- New project from scratch, or a feature that creates/edits many files at once.
- The files are mostly independent (high parallelism) or have a shallow dependency tree.

Do NOT use for: a single tricky change (→ Sonnet), a trivial edit (→ inline), or anything
risky (→ do it yourself; see the risk gate below).

## Tier ladder (cheap to expensive)

Escalate per task; never spend a higher tier than the task needs.

1. **Bulk swarm — DeepSeek V4 Flash + MiMo V2.5.** The workhorse. ~80-90% of the files:
   scaffolding, CRUD, types, tests, glue, docs. Run them in parallel (the pool).
2. **Pro swarm — DeepSeek V4 Pro + MiMo V2.5-Pro.** Upgrade here for the harder/important
   files: tricky logic, long-context work, and any bulk-tier task that failed twice.
3. **Sonnet.** Serious, architectural, or high-trust implementation.
4. **Opus.** Planner / router, plus the hardest and the risky (see the risk gate).

The cheap tier writes most of the volume; the expensive tiers own the decisions and the
hard parts. Don't push a hard file down to flash to save pennies, and don't pull boilerplate
up to Opus.

## Final review (every job): 3-model panel

After the swarm and your fixes, the work gets a final review by **three independent models**:
**Opus 4.8 + DeepSeek V4 Pro + MiMo V2.5-Pro.** Run the two Pro reviews with the script,
then add your own Opus pass and reconcile: a finding two of three flag is real; you make the
final call and fix or re-route. One cheap reviewer can miss; a panel rarely does. (This is the
sc-review pattern, widened with MiMo Pro.)

Pass the **original plan** so the reviewers check the code against the agreed contract,
not just for intrinsic bugs. They get the full diff (1M-token windows — no truncation):

```
git -C <target-dir> diff | node "<this-skill>/scripts/review-panel.mjs" --plan plan.json
```

It prints each Pro model's findings. You read both, do your own review, and reconcile.
For a fresh project that isn't in git yet, feed the files instead:
`cat src/*.ts | node "<this-skill>/scripts/review-panel.mjs" --plan plan.json`.

## The loop

### 1. Scope and split
List every file the work needs. Separate them into two buckets:

- **Swarm bucket** — scaffolding, CRUD, types, tests, glue, docs. Safe, mechanical.
- **Hands-on bucket** — anything touching crypto, auth/sessions, tokens/secrets, payments,
  migrations, permissions, or data-loss paths. **These never go in the plan.** You write
  them yourself (Sonnet/Opus), after the swarm scaffolds around them.

### 2. Write the plan — contract-first, grouped by coupling

This is where you prevent drift. Three rules:

1. **Pin a `contract`.** Name the canonical types, the exact module signatures, and the
   import/export names. Every worker gets this and is told to import these names and never
   redefine them. The contract is the one thing you (Opus) must author, not delegate.
2. **Group coupled files** with `group`. Files sharing a `group` are written by ONE worker
   in one shot, so their shared seam (type shape, method names) agrees by construction. The
   data layer is one group, the http layer another. Keep a group ≤4 files.
3. **`dependsOn` = the TRUE DAG.** Set a dep only where one unit genuinely needs another's
   output. False deps serialize work that could run in parallel; missing deps cause drift.
   Numbering is for reading — the scheduler only honors `dependsOn`.

```json
{
  "projectName": "notes-api",
  "contract": "src/types.ts exports interface Note { id:string; title:string; content:string; createdAt:string; updatedAt:string }, CreateNoteInput, UpdateNotePatch. src/store.ts exports class InMemoryNotesStore with list():Note[], get(id):Note|undefined, create(input):Note, update(id,patch):Note|undefined, remove(id):boolean. src/routes.ts exports createNotesRouter(store:InMemoryNotesStore):Router. Import these with a .js extension; never redefine a type that lives in another file.",
  "constraints": ["Node+Express+TypeScript, ESM, strict, no validation library"],
  "files": [
    { "path": "src/types.ts", "group": "data", "purpose": "the Note/CreateNoteInput/UpdateNotePatch interfaces from the contract" },
    { "path": "src/store.ts", "group": "data", "purpose": "InMemoryNotesStore per the contract; import types from ./types.js" },
    { "path": "src/store.test.ts", "group": "data", "purpose": "vitest tests for the store" },
    { "path": "src/routes.ts", "group": "http", "purpose": "createNotesRouter(store) using store.list/get/create/update/remove; validate inline", "dependsOn": ["src/store.ts"] },
    { "path": "src/app.ts", "group": "http", "purpose": "createApp(): new the store, mount createNotesRouter(store) at /notes" },
    { "path": "src/server.ts", "group": "http", "purpose": "import createApp from ./app.js and listen" }
  ]
}
```

Here the data layer (3 files, one agent) and http layer (3 files, one agent) each write
their own seams coherently; the only cross-agent seam is `routes → store`, covered by the
contract. 9 single-file agents became 2 grouped agents with near-zero drift surface.

### 3. Run the swarm
From the decalyst repo (so its `.env` / backends load), pointed at the target project:

```
# bulk tier (default): DeepSeek V4 Flash + MiMo V2.5
node "<this-skill>/scripts/run-swarm.mjs" --plan plan.json --workspace <target-dir> --out result.json

# pro tier: DeepSeek V4 Pro + MiMo V2.5-Pro (for the harder/important plan)
node "<this-skill>/scripts/run-swarm.mjs" --plan hard-plan.json --workspace <target-dir> --tier pro --out result.json
```

Run the bulk plan first; route the harder files (or bulk failures) into a second
`--tier pro` pass. **`--verify` runs by default** (install + typecheck + test — the
mechanical drift detector); pass `--no-verify` for a non-buildable scratch run.

Or the raw form (run from the decalyst dir, use absolute Windows paths — git-bash mangles
`/tmp`-style args):

```
npx tsx src/cli/index.ts swarm-exec --plan <abs>/plan.json --workspace <abs>/target --out <abs>/result.json --json
```

DeepSeek v4-flash (cap ~24) and MiMo v2.5 (cap ~16) run in parallel; the pool routes each
task to the least-busy backend. File locks + snapshots keep them from colliding.

### 4. Read the result
`result.json`: `{ backends, applied[], failed[], blocked[], verify }`. Note which files
landed and which failed.

### 5. Review — this is the point
Read **every** generated file yourself. The swarm is cheap labor, not a reviewer. Check:
correctness, project conventions, no invented APIs, no scope creep. Run the project's own
`typecheck` / `lint` / tests on the output.

### 6. Fix loop
For `failed` / `blocked` tasks or verify errors, write a smaller `fix-plan.json` targeting
just those files (with the error text in `purpose`), re-run, repeat. Cap it at ~3 rounds;
if a file keeps failing, take it yourself instead of looping the swarm on it.

### 7. Integrate
Move the reviewed files into place, wire the hands-on bucket you wrote directly, and run
the full project verification before calling it done.

## Large, multi-phase work: phases are a DAG, not a chain

For a big build you'll plan in phases (contracts → data → services → routes → tests). But
the phase *numbers* are for reading, not running — the scheduler only honors `dependsOn`.
A "phase 7" unit that only needs the contract is ready the moment the contract lands and
runs alongside phase 2. So:

- Express the **true** dependency edges and let it run as wide as they allow (cap ~40).
  Independent branches fire together; convergence points wait.
- Put the **review gates on the joins, not the numbers**. Review the **contract first**
  (before anything imports it), then review each unit before its dependents consume it.
  Independent branches don't wait on each other's reviews.
- Run phases as separate `swarm-exec` passes when you want a hard review barrier between
  them; the contract carries forward so later passes stay consistent.

The point of phasing isn't agent count — it's catching drift while it's small, before it
compounds across the build.

## Risk gate (do not skip)

Before running the swarm, confirm the plan has **zero** files that:
encrypt/decrypt, handle keys/secrets/tokens, do auth/sessions/login, touch payments/billing,
run DB migrations, or enforce permissions. If one slipped in, pull it out and write it
yourself. No fake security, no plaintext fallback, no cheap-model crypto.

## Contract reference

Full plan/result shapes and the backend setup live in the ai-coding-router skill
(`docs/swarm.md`) and the decalyst repo's `.env.example`.
