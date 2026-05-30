# 009 — Config loader (long-context, conventions matter)

**Goal:** Add a typed config loader that reads a single JSON file, validates it against a
schema, and exposes a parsed object — matching how the project already loads config.

**Input files needed:**
- An existing repo that already loads config one way (e.g. a `loadConfig`/schema pattern).
- The existing config schema + loader for reference.

**Expected behavior:**
- New loader reuses the existing pattern (same validator, same error behavior on a bad
  config, same "only the loader reads the environment" discipline if present).
- Returns a fully typed config object.

**Constraints:**
- Do not invent a second config mechanism. Do not read environment variables outside the
  loader if the project forbids it. No new deps.

**Scoring notes:** This is a conventions + long-context task. Discriminator is whether the
model discovered and reused the existing pattern instead of inventing a parallel one.
Penalize `process.env` reads scattered outside the loader, or a new validator library.
