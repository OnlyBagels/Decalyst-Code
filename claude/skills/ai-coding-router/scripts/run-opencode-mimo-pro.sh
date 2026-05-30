#!/usr/bin/env bash
# Launch OpenCode pinned to MiMo V2.5-Pro — challenger to DeepSeek Pro.
set -uo pipefail
MODEL="mimo/mimo-v2.5-pro"
command -v opencode >/dev/null 2>&1 || { echo "❌ opencode not installed. See docs/provider-setup.md"; exit 1; }
[ -n "${MIMO_BASE_URL:-}" ] || { echo "❌ MIMO_BASE_URL not set (required for MiMo). See docs/provider-setup.md"; exit 1; }
echo "▶ opencode --model $MODEL"
exec opencode --model "$MODEL" "$@"
