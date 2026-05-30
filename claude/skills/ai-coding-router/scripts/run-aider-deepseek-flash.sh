#!/usr/bin/env bash
# Run Aider with DeepSeek V4 Flash via the OpenAI-compatible endpoint.
set -uo pipefail
command -v aider >/dev/null 2>&1 || { echo "❌ aider not installed. See docs/provider-setup.md"; exit 1; }
: "${DEEPSEEK_API_KEY:?Set DEEPSEEK_API_KEY (key value, not printed)}"
BASE="${DEEPSEEK_BASE_URL:-https://api.deepseek.com}"
echo "▶ aider --model openai/deepseek-v4-flash  (base: $BASE)"
OPENAI_API_BASE="$BASE" OPENAI_API_KEY="$DEEPSEEK_API_KEY" \
  exec aider --model openai/deepseek-v4-flash "$@"
