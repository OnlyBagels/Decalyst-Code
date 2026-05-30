#!/usr/bin/env bash
# Launch OpenCode pinned to DeepSeek V4 Flash — the default cheap bulk worker.
set -uo pipefail
MODEL="deepseek/deepseek-v4-flash"
command -v opencode >/dev/null 2>&1 || { echo "❌ opencode not installed. See docs/provider-setup.md"; exit 1; }
echo "▶ opencode --model $MODEL  (auth via 'opencode auth login' if not already)"
exec opencode --model "$MODEL" "$@"
