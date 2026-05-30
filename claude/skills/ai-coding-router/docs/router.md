# Router — which model does what

Claude is the boss. It classifies the task, picks a worker, runs it through OpenCode or
Aider, and reviews the result. Cheap models do volume; Claude keeps the taste and the
final say.

## Classify first

| Class | Signal |
|---|---|
| **Easy scaffold** | New file from a clear spec, boilerplate, glue, a config, a stub component |
| **Medium coding** | A feature in one or two files, a CRUD route, a refactor with a clear target |
| **Hard coding** | Tricky logic, concurrency, crypto-adjacent, anything where being wrong is expensive |
| **Long-context repo** | Needs to read a lot of the repo to answer or edit correctly |
| **Risky code** | Security, auth, money, data-loss, migrations, anything user-facing and irreversible |

## Routing table

### Easy scaffold
1. **DeepSeek V4 Flash** (default)
2. **MiMo V2.5** (challenger / if Flash stalls)
3. **Optional local model** (offline / private / latency)

### Medium coding
1. **DeepSeek V4 Flash** first
2. **MiMo V2.5** challenger (run the same task, compare diffs)
3. **Claude Sonnet** fallback when both cheap models miss

### Hard coding
1. **Claude Sonnet** (lead)
2. **DeepSeek V4 Pro** (cheap heavy lifter / second opinion)
3. **MiMo V2.5-Pro** (challenger to Pro)

### Long-context repo analysis
1. **DeepSeek V4 Pro**
2. **MiMo V2.5-Pro**

### Risky code
1. **Claude Sonnet** first (does the work)
2. **Claude Opus** final review (you — last look before it ships)
3. **DeepSeek / MiMo** only as a second opinion, never as the final reviewer

## Default

**Default worker: DeepSeek V4 Flash** through OpenCode. **Default boss/reviewer: Claude
Opus.** Escalate to Sonnet when the class is hard or risky; escalate to Pro/Pro-challenger
for long context. Reach for a bakeoff (Flash vs MiMo, or Pro vs MiMo-Pro) when you are not
sure which cheap model handles the task better — that's what [../bench/](../bench/) is for.

## Harness choice

- **OpenCode** for interactive, agentic, day-to-day work and fast model switching.
- **Aider** when you want tight reviewable diffs or a controlled two-model bakeoff on the
  exact same files.
- **decalyst-swarm** when you need many tasks running at once (5–20+). Claude Code is the
  orchestrator; decalyst runs the cheap-worker pool safely. See [swarm.md](swarm.md).

## Operating rules

- Cheap models are workers, not reviewers. Opus reads their output before it lands.
- One model owns a task at a time. Bakeoffs are deliberate, not accidental.
- If a cheap model loops or produces unrelated edits twice, stop and escalate a tier.
- Verify model IDs against `/models` before the first paid run of a session.
