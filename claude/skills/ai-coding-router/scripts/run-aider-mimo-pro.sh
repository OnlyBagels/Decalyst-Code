#!/usr/bin/env bash
# Run Aider with MiMo V2.5-Pro via the OpenAI-compatible endpoint.
set -uo pipefail
command -v aider >/dev/null 2>&1 || { echo "❌ aider not installed. See docs/provider-setup.md"; exit 1; }
: "${MIMO_API_KEY:?Set MIMO_API_KEY (key value, not printed)}"
: "${MIMO_BASE_URL:?Set MIMO_BASE_URL from official MiMo docs or your value}"
echo "▶ aider --model openai/mimo-v2.5-pro  (base: $MIMO_BASE_URL)"
OPENAI_API_BASE="$MIMO_BASE_URL" OPENAI_API_KEY="$MIMO_API_KEY" \
  exec aider --model openai/mimo-v2.5-pro "$@"
