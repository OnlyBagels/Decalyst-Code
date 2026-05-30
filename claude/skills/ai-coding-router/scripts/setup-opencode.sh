#!/usr/bin/env bash
# setup-opencode.sh — wire DeepSeek + MiMo (+ optional local) into OpenCode.
# Prints guidance and the example config. NEVER overwrites an existing config without
# a backup + explicit confirmation.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
example="$here/templates/opencode.example.json"
cfg="${OPENCODE_CONFIG:-$HOME/.config/opencode/opencode.json}"
jsonc="$HOME/.config/opencode/opencode.jsonc"

echo "=== OpenCode provider setup ==="
echo
echo "1) Store your key in OpenCode's own credential store (user-level, not in any repo):"
echo "     opencode auth login        # choose DeepSeek, paste key when prompted"
echo "   For MiMo (custom provider) set env vars instead: MIMO_API_KEY, MIMO_BASE_URL"
echo
echo "2) Merge the provider block from:"
echo "     $example"

target="$cfg"; [ -f "$jsonc" ] && target="$jsonc"

if [ -f "$target" ]; then
  echo
  echo "$target already exists — NOT overwriting."
  echo "Current contents:"; echo "----"; cat "$target"; echo "----"
  echo "To merge automatically with a backup, re-run with APPLY=1:"
  echo "     APPLY=1 bash \"$0\""
  if [ "${APPLY:-0}" = "1" ]; then
    bak="$target.bak.$(date +%s 2>/dev/null || echo manual)"
    cp "$target" "$bak" && echo "backup written: $bak"
    echo "Open both files and merge the \"provider\" block by hand — automatic JSON merge is"
    echo "intentionally not done so nothing silently changes. Example is at: $example"
  fi
else
  echo
  echo "No config at $target. You can start from the example:"
  echo "     cp \"$example\" \"$cfg\""
fi

echo
echo "3) Verify:"
echo "     opencode --version"
echo "     opencode            # then type /models to list, /connect for auth"
