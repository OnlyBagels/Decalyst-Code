# 004 — Test generation

**Goal:** Write unit tests for an existing pure function (e.g. a `parseDuration("1h30m")`
util) covering happy path, edge cases, and invalid input.

**Input files needed:**
- `src/parseDuration.ts` (provide a small, slightly-buggy-on-edge implementation).
- Test runner configured (vitest or jest).

**Expected behavior:**
- A test file with: valid inputs, zero, missing units, mixed order, invalid strings
  (throws or returns null per the function's contract).
- Tests are independent and named clearly.

**Constraints:**
- Use the project's existing test runner and assertion style. No new deps.
- Don't modify the implementation (this task tests test-writing, not fixing).

**Scoring notes:** Discriminator is whether it finds the real edge cases (empty string,
unit-only, overflow). Penalize tests that only re-assert the happy path, or that change the
source to make tests pass.
