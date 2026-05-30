# 008 — Validation logic

**Goal:** Implement input validation for a signup form using the project's existing schema
library (e.g. Zod), with clear field-level error messages.

**Input files needed:**
- `src/signupSchema.ts` (empty) and a note of which validator the project uses.

**Expected behavior:**
- Schema for `{ email, password, confirmPassword, age }`.
- Rules: valid email; password ≥ 8 with a number and a letter; `confirmPassword` matches;
  `age ≥ 13`.
- Cross-field rule (password match) implemented correctly, with a message on the right field.

**Constraints:**
- Use the existing validator only. No regex soup where the library has a helper. Export a
  typed parse result.

**Scoring notes:** Discriminator is the cross-field match rule and message placement.
Penalize a hand-rolled validator when the library is available, or a password rule that
accepts an 8-char all-letters string.
