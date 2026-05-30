# 005 — Refactor a component

**Goal:** Refactor a 200-line "god" component into a container + presentational split with
extracted hooks, preserving behavior exactly.

**Input files needed:**
- `src/Dashboard.tsx` (a bloated component mixing data fetching, state, and rendering).

**Expected behavior:**
- Data/state logic extracted into a `useDashboard` hook.
- Presentational component takes props only, no side effects.
- Public behavior and rendered output unchanged.

**Constraints:**
- No behavior change. No new deps. Keep the same file's public export working (or update
  imports it owns). Diff should be a clean move, not a rewrite.

**Scoring notes:** Discriminator is a behavior-preserving split with a minimal diff.
Penalize gratuitous renames, changed prop names that break callers, or "while I'm here"
edits unrelated to the split.
