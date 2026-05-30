# Contributing to Decalyst-Code

Thanks for the interest. This guide covers local setup, the branch flow, the style we hold, and how to open a pull request.

---

## Quick start for contributors

```bash
git clone https://github.com/OnlyBagels/Decalyst-Code
cd Decalyst-Code
npm install
cp .env.example .env        # add at least one OpenAI-compatible backend
```

Node 20+ is required. The four commands you will use:

```bash
npm run typecheck     # tsc --noEmit, must pass
npm test              # vitest run, must pass
npm run lint          # eslint src tests
npm run format        # prettier --write .
```

The test suites live under `tests/` and are gitignored, so they run locally but do not ship in the published tree. They still gate every merge to `main` (see below).

---

## Branch flow

- **`dev`** is the integration branch. All work lands here first.
- **`main`** only receives merges after `npm run typecheck` and `npm test` pass end-to-end.

Branch off `dev`, not `main`:

```bash
git checkout dev && git pull
git checkout -b fix/short-description
```

When the work is ready, open a PR into `dev`. Do not push directly to `main`.

---

## What to work on

Good first contributions:

- a new project kind in `src/runners/` (a language whose verify commands are not wired yet);
- a new backend example in `.env.example` for a provider you use;
- bug fixes with a failing test that the fix turns green;
- docs corrections where the README and the code disagree (the code wins).

Before a large feature, open an issue first so we can agree on the shape. Big unannounced PRs are hard to merge.

---

## Code style

- **TypeScript, strict.** No `any` where a real type fits. `npm run typecheck` is the gate, not a suggestion.
- **Match the surrounding file.** Naming, structure, and import style should read like the code already there.
- **Errors are typed and surfaced**, not swallowed. A worker that fails should return a clear blocker, not a half-written file.
- **No new runtime dependency** without a reason in the PR description. The harness stays light.
- **Format with Prettier** before you push. CI will not reformat for you.

---

## Commit and writing style

The repo follows [github.com/conorbronsdon/avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing). It applies to commits, comments, and docs.

Commit subjects:

- imperative mood: `add`, `fix`, `drop`, `extract`, `wire`. Not `added`, `this commit adds`;
- aim for 50 characters, hard cap 72, no trailing period;
- a specific verb and a specific noun. `fix race in worker pool routing`, not `update code`.

Commit bodies explain **why**, not what. The diff already shows what. Wrap at 72.

Banned in commits, comments, and docs: marketing words (`comprehensive`, `robust`, `seamless`, `leverages`, `streamline`, `unlock`, `supercharge`), `this commit` openers, and chatbot framing (`Certainly!`, `a nice cleanup`). Numbers beat adjectives: `cuts cold-path latency from 340ms to 12ms`, not `massively faster`.

AI assistance is welcome and openly acknowledged in this project. The output still has to read like a person wrote it on purpose. A human plans, reviews, and approves every commit.

---

## Tests

- New behavior needs a test. A bug fix needs a test that fails before the fix and passes after.
- Put suites under `tests/`, mirroring the `src/` path.
- Run `npm test` locally before opening the PR. `main` will not take a red suite.

---

## Opening a pull request

1. Branch off `dev`.
2. Make the change. Keep the diff focused; one concern per PR.
3. Run `npm run typecheck`, `npm test`, `npm run lint`, `npm run format`.
4. Write a PR description that says what changed and why. Link any issue it closes.
5. Open the PR into `dev`. Fill in the template.

A maintainer reviews, and once `dev` is green the change rides the next `dev → main` merge.

---

## Security

Never commit a real key. `.env` is gitignored; keep your keys there. If you think you have found a vulnerability, do not open a public issue. Follow [SECURITY.md](SECURITY.md).

The path policy (`src/files/`) is a security boundary. Changes that widen what the swarm can write get extra scrutiny. The swarm must never be able to write `.env`, `.git/`, ssh or aws credentials, or escape the workspace.

---

## Code of conduct

Be straight, be kind, assume good faith. Harassment or bad-faith behavior gets you removed from the project. Disagreements about code are fine and expected; make them about the code.
