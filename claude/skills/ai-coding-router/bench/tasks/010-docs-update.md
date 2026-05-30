# 010 — Docs update from a code change

**Goal:** A function's signature changed; update the README/usage docs to match, including
the example snippet, without touching unrelated docs.

**Input files needed:**
- `src/client.ts` (a function whose params changed, e.g. `connect(url)` → `connect({ url,
  timeout })`).
- `README.md` containing an outdated usage example.

**Expected behavior:**
- README example updated to the new signature.
- Any prose describing the old params updated.
- A short note in a changelog/usage section if the project keeps one.

**Constraints:**
- Edit only the sections that reference the changed function. No rewriting the whole README.
- Keep the existing doc voice and formatting. No new sections beyond what's asked.

**Scoring notes:** Discriminator is a surgical doc edit that matches the new signature and
leaves everything else alone. Penalize a full README rewrite, AI-flavored filler, or missed
references to the old signature.
