# 007 — CSS to Tailwind

**Goal:** Convert a component's hand-written CSS (a `.css` file + `className` usage) to
Tailwind utility classes, preserving the visual result.

**Input files needed:**
- `src/Card.tsx` and `src/Card.css` (flexbox layout, spacing, hover, a media query).

**Expected behavior:**
- Equivalent Tailwind utilities applied inline on the elements.
- Hover and responsive behavior preserved (`hover:`, `md:` etc.).
- The now-unused `.css` file removed and its import dropped.

**Constraints:**
- Don't change markup structure or behavior. No arbitrary-value classes where a standard
  utility exists. No new deps (assume Tailwind is configured).

**Scoring notes:** Discriminator is faithful spacing/breakpoint translation and removing the
dead CSS + import. Penalize leftover `.css` import, changed layout, or arbitrary values used
lazily.
