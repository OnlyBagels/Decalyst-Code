# 002 — TypeScript types for an API payload

**Goal:** Given a sample JSON response, write precise TypeScript types and a type guard.

**Input files needed:**
- `sample.json` (paste a nested API response: user, nested address, array of orders).
- `src/types.ts` (empty).

**Expected behavior:**
- Exported `interface`/`type` definitions matching the JSON exactly (optional vs required
  inferred from the sample; unions where a field has a small fixed set).
- A `isUser(x: unknown): x is User` runtime type guard.
- No `any`. Arrays and nested objects fully typed.

**Constraints:**
- `tsc --noEmit` clean under `strict`. No new deps. One file plus the guard.

**Scoring notes:** Discriminator is correct optionality and union literals, and a guard that
actually narrows. Penalize `any`, `as` casts, or over-broad `Record<string, unknown>`.
