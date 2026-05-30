# 001 — React component from a spec

**Goal:** Create a `Pagination` component (React + TypeScript) that renders page numbers
with prev/next, an active state, and ellipsis for long ranges.

**Input files needed:**
- A throwaway React + TS project (Vite default is fine), or an empty `src/Pagination.tsx`.

**Expected behavior:**
- Props: `page: number`, `pageCount: number`, `onChange(page: number): void`.
- Renders prev / next buttons (disabled at the ends) and numbered buttons.
- Collapses long ranges with `…` (e.g. `1 … 4 5 6 … 20`).
- Active page is visually marked and `aria-current="page"`.

**Constraints:**
- One file. No new dependencies. Function component + hooks only.
- Accessible: buttons are real `<button>`s with labels.

**Scoring notes:** Correct ellipsis logic at boundaries (page 1, page = pageCount) is the
discriminator. Penalize unrelated files, inline styles sprawl, or extra deps.
