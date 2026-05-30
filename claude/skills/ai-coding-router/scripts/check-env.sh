#!/usr/bin/env bash
# check-env.sh — verify tools + report credential PRESENCE. Never prints a secret value.
set -uo pipefail

ok="✅"; no="❌"; warn="⚠️"
problems=0

echo "=== tools ==="
for t in opencode aider; do
  if command -v "$t" >/dev/null 2>&1; then
    echo "$ok $t  ($(command -v "$t"))"
  else
    echo "$no $t  not installed"
    [ "$t" = "opencode" ] && problems=$((problems+1))
  fi
done

# report-only: prints whether a var is set, never its value
report() {
  local name="$1"
  if [ -n "${!name:-}" ]; then echo "$ok $name is set (value hidden)"; else echo "$warn $name not set"; fi
}

echo
echo "=== DeepSeek credentials ==="
report DEEPSEEK_API_KEY
report DEEPSEEK_BASE_URL
echo "   (DeepSeek can also be authed via 'opencode auth login' — env var not required for OpenCode)"

echo
echo "=== MiMo credentials ==="
report MIMO_API_KEY
report MIMO_BASE_URL
if [ -z "${MIMO_BASE_URL:-}" ]; then
  echo "   $warn MIMO_BASE_URL is required for MiMo. Set it from official MiMo docs or your value."
fi

echo
echo "=== Generic OpenAI-compatible (Aider / local) ==="
report OPENAI_API_KEY
report OPENAI_API_BASE

echo
if [ "$problems" -gt 0 ]; then
  echo "$no missing required tooling — see docs/provider-setup.md"
  exit 1
fi
echo "$ok environment check complete (no secrets printed)"
