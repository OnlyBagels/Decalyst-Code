# Benchmark plan

How to compare DeepSeek V4 Flash, DeepSeek V4 Pro, MiMo V2.5, MiMo V2.5-Pro, and an
optional local model on real work — not algorithm puzzles. Goal: decide which cheap model
to make the default worker, and where each one earns its keep.

**Do not run any of this without explicit approval — it spends API credits.**

## Method

1. Pick a clean throwaway git checkout so edits are easy to diff and discard.
2. For each task in `bench/tasks/001..010`, run it through each model via the **same
   harness** (use Aider for diff-comparable runs; `--no-auto-commits` so you can inspect).
3. Capture the diff, whether tests/lint pass, and the wall-clock + token cost.
4. Score into `bench/scorecard.md` (one row per model per task).
5. Reset the checkout between models so each starts from the same state.

Keep the prompt identical across models. Same files in context. Same edit format where the
model supports it. Otherwise you're benchmarking your prompt, not the model.

## Metrics

| Metric | What you're measuring | How |
|---|---|---|
| **Task success** | Did it do what the task asked? | Pass/fail against the task's expected behavior |
| **Valid diff/edit** | Did it produce an applyable edit? | Did the harness apply it without manual fixup? |
| **No unrelated edits** | Did it stay in scope? | Diff touches only what the task names |
| **TypeScript correctness** | Types compile | `tsc --noEmit` (or project build) clean |
| **Lint/test pass** | Quality gates | `eslint` / `vitest` / project scripts green |
| **Tool-call reliability** | Agentic runs don't flail | Count failed/looping tool calls |
| **Latency** | Wall-clock to a usable result | Time the run |
| **Output token cost** | $ per task | Provider usage / token meter |
| **Retry quality** | Recovers when corrected | Give one correction; does it fix cleanly? |
| **Context handling** | Uses the repo it was given | Did it read the right files / avoid hallucinating APIs? |

## Reading the results

- A model that's cheap + fast + "no unrelated edits" wins the **default scaffold** slot
  even if it occasionally needs a retry.
- A model that needs Sonnet-level correctness but costs a fraction wins the **second
  opinion** slot.
- Long-context tasks (003, 009) separate the Pro tier from the Flash tier — weight them
  when choosing the long-context default.
- If a local model lands within one retry of Flash on tasks 001/007/010, it's viable for
  offline scaffold.

## Output

Fill `bench/scorecard.md`, then update `docs/router.md`'s "Default" line if the winner
differs from DeepSeek V4 Flash.
