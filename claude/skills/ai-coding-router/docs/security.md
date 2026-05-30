# Security — key handling

The harness CLI holds the key. The working repo holds nothing. That is the whole rule;
everything below enforces it.

## Never

- Never commit a key. Not in `.env`, config, a script, a test fixture, or a comment.
- Never paste a key into a model prompt (the model logs / providers may retain it).
- Never echo, print, or log a key — not even a prefix. The check/run scripts only ever
  report "set / not set", never the value.
- Never put a key in a file that lives inside a project repo.

## Where keys go instead

1. **OpenCode native auth** — `opencode auth login`. Stored at the user level, outside any
   repo. This is the preferred path for DeepSeek.
2. **User-level environment variables** — for Aider and the MiMo provider
   (`MIMO_API_KEY`, `MIMO_BASE_URL`, `DEEPSEEK_API_KEY`). Set them in your session or, if
   you want persistence, your user environment (ask before editing a shell profile).
3. **Last resort `.env`** — only if a tool truly needs a file. Keep it outside your repos,
   gitignore it, and lock it down:
   ```
   chmod 600 .env            # bash / WSL
   icacls .env /inheritance:r /grant:r "$env:USERNAME:R"   # Windows, optional hardening
   ```

`templates/env.example` lists variable NAMES only and contains no values. Never rename a
filled copy into a repo.

## Rotating a key

1. Issue a new key in the provider console.
2. Update it where it lives: re-run `opencode auth login`, or update the env var / `.env`.
3. Revoke the old key in the console.
4. Confirm with `scripts/check-env.*` (reports "set", not the value).
5. If the old key ever touched a command line, scrub history (below).

## Verify .gitignore before you ever write a local .env

```
git check-ignore -v .env        # should print a matching .gitignore rule
```
If it prints nothing, the file is NOT ignored — add `.env` to `.gitignore` first, or
better, don't create the file. This skill's design keeps `.env` out of repos entirely.

## Shell history hygiene

A key passed as `KEY=sk-... aider ...` lands in shell history.

- PowerShell history file: `(Get-PSReadlineOption).HistorySavePath` — inspect/clear it.
  ```
  Clear-History
  Remove-Item (Get-PSReadlineOption).HistorySavePath -ErrorAction SilentlyContinue
  ```
- bash/zsh: `history -c` and remove the line from `~/.bash_history` / `~/.zsh_history`.
- Prefer setting the env var once (no inline key on the command) so the value never appears
  in a command line. The run-* scripts read from env exactly so the key isn't typed inline.

## Avoid logging secrets

- Don't pipe tool output that may contain a key into a committed log file.
- Don't enable verbose/debug logging that echoes request headers (the `Authorization`
  header carries the key).
- CI: store keys as masked secrets, never as plaintext env in a committed workflow.
