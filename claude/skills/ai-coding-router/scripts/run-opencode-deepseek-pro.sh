#!/usr/bin/env bash
# Launch OpenCode pinned to DeepSeek V4 Pro — hard/long-context cheap coder.
set -uo pipefail
MODEL="deepseek/deepseek-v4-pro"
command -v opencode >/dev/null 2>&1 || { echo "❌ opencode not installed. See docs/provider-setup.md"; exit 1; }
echo "▶ opencode --model $MODEL"
exec opencode --model "$MODEL" "$@"
