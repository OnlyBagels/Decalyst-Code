# 003 — CRUD route (long-context aware)

**Goal:** Add a full CRUD set of HTTP routes for a `notes` resource, matching the existing
project's framework, error style, and folder layout.

**Input files needed:**
- A small existing API repo (Express or Hono) with at least one existing resource to mirror.
- The existing router/registration file and one existing resource module for reference.

**Expected behavior:**
- `POST /notes`, `GET /notes`, `GET /notes/:id`, `PATCH /notes/:id`, `DELETE /notes/:id`.
- Mirrors the existing project's validation, error handling, and response shape.
- Registered the same way existing routes are registered.

**Constraints:**
- Match existing conventions exactly — do not introduce a new framework, error pattern, or
  folder shape. In-memory store is fine if the repo has no DB layer to mirror.

**Scoring notes:** This is a long-context task — the model must read the existing resource
and copy its patterns. Penalize a route file that ignores project conventions even if it
"works". Pro-tier models should win here.
