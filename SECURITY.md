# Security Policy

## Reporting a vulnerability

Do not open a public issue for a security problem.

Report it privately through GitHub's [security advisory form](https://github.com/OnlyBagels/Decalyst-Code/security/advisories/new). Include what you found, how to reproduce it, and the impact you see. You will get an acknowledgement, and a fix or a clear decision before any public disclosure.

## What counts

This is a code-generation harness that runs models against your filesystem and your API keys. The security-relevant surfaces:

- **Path policy** (`src/files/`). A bug that lets a worker write outside the workspace, or write a denied path (`.env`, `.git/`, ssh/aws credentials), is a vulnerability. Report it.
- **Key handling.** Keys live in `.env` and are sent only to the backend you configured. A path where a key leaks into a trace, a log, a worker prompt, or stdout is a vulnerability.
- **Command execution.** The verify step runs project commands. A plan or worker output that can inject an arbitrary command into that step is a vulnerability.

## What does not count

- A model writing low-quality or incorrect code. That is the orchestrator's review job, not a security issue.
- You pointing a backend at a malicious endpoint you control. You own your `.env`.

## For contributors

Never commit a real key. `.env` is gitignored; keep keys there. Before you push, check the diff for tokens. Changes that widen the path policy or touch key handling get extra review.
