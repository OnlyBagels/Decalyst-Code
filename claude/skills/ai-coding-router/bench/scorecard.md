# Scorecard

Copy one table per model. Score each task 0–2 per metric (0 = fail, 1 = partial, 2 = clean).
Record latency in seconds and cost in output tokens (or $). Don't run without approval —
benchmarks spend credits.

## Model: __________________   Harness: __________   Date: __________

| Task | Success | Valid edit | In-scope | TS ok | Lint/test | Tool calls | Latency(s) | Tokens/$ | Retry | Context | Notes |
|------|:-------:|:----------:|:--------:|:-----:|:---------:|:----------:|:----------:|:--------:|:-----:|:-------:|-------|
| 001 react-component   |  |  |  |  |  |  |  |  |  |  |  |
| 002 typescript-types  |  |  |  |  |  |  |  |  |  |  |  |
| 003 crud-route        |  |  |  |  |  |  |  |  |  |  |  |
| 004 test-generation   |  |  |  |  |  |  |  |  |  |  |  |
| 005 refactor          |  |  |  |  |  |  |  |  |  |  |  |
| 006 bugfix            |  |  |  |  |  |  |  |  |  |  |  |
| 007 css-to-tailwind   |  |  |  |  |  |  |  |  |  |  |  |
| 008 validation        |  |  |  |  |  |  |  |  |  |  |  |
| 009 config-loader     |  |  |  |  |  |  |  |  |  |  |  |
| 010 docs-update       |  |  |  |  |  |  |  |  |  |  |  |
| **Total** |  |  |  |  |  |  |  |  |  |  |  |

## Summary (fill after all models run)

| Model | Total score | Avg latency | Avg cost | Best at | Avoid for |
|-------|:-----------:|:-----------:|:--------:|---------|-----------|
| DeepSeek V4 Flash |  |  |  |  |  |
| DeepSeek V4 Pro   |  |  |  |  |  |
| MiMo V2.5         |  |  |  |  |  |
| MiMo V2.5-Pro     |  |  |  |  |  |
| Local (optional)  |  |  |  |  |  |

**Decision:** default scaffold worker = ________ · long-context default = ________ ·
second-opinion model = ________. Update `docs/router.md` if these differ from the current
defaults (DeepSeek V4 Flash / DeepSeek V4 Pro).
