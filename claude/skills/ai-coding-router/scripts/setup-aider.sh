#!/usr/bin/env bash
# setup-aider.sh — show how to install + configure Aider for the same models.
# Does NOT install anything (installs require operator approval).
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
example="$here/templates/aider.model-settings.example.yml"

echo "=== Aider setup ==="
echo
if command -v aider >/dev/null 2>&1; then
  echo "✅ aider installed ($(command -v aider))"
else
  echo "❌ aider not installed. Recommended (ask before running):"
  echo "     python -m pip install --user pipx"
  echo "     pipx install aider-chat"
fi
echo
echo "Per-model settings template:"
echo "     cp \"$example\" \"\$HOME/.aider.model.settings.yml\""
echo
echo "Keys are supplied per-launch via the run-aider-* scripts (OPENAI_API_BASE / OPENAI_API_KEY)."
echo "Nothing is stored in the settings file. See docs/provider-setup.md."
echo
echo "Smoke test (after keys are set):"
echo "     OPENAI_API_BASE=\"\$DEEPSEEK_BASE_URL\" OPENAI_API_KEY=\"\$DEEPSEEK_API_KEY\" \\"
echo "       aider --model openai/deepseek-v4-flash --no-auto-commits"
