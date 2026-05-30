# 006 — Bugfix from a failing test

**Goal:** A test is failing because of an off-by-one in a date-range function. Find and fix
the bug so the test passes.

**Input files needed:**
- `src/dateRange.ts` (contains the bug — e.g. excludes the end date).
- `src/dateRange.test.ts` (one failing test asserting inclusive range).

**Expected behavior:**
- The minimal change that makes the failing test pass.
- No other tests broken.

**Constraints:**
- Touch only the buggy function. No reformatting the whole file. No new deps.
- Don't edit the test to match the bug.

**Scoring notes:** Discriminator is a one- or two-line targeted fix vs a rewrite. Penalize
editing the test, broad reformatting, or "fixes" that pass the test by coincidence.
