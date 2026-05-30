# setup-aider.ps1 - show how to install + configure Aider. Installs nothing (needs approval).
$ErrorActionPreference = 'SilentlyContinue'
$here    = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$example = Join-Path $here 'templates\aider.model-settings.example.yml'

Write-Host "=== Aider setup ===`n"
$aider = Get-Command aider -ErrorAction SilentlyContinue
if ($aider) {
  Write-Host "OK  aider installed ($($aider.Source))"
} else {
  Write-Host "X   aider not installed. Recommended (ask before running):"
  Write-Host "     winget install Python.Python.3.12"
  Write-Host "     python -m pip install --user pipx"
  Write-Host "     pipx install aider-chat"
}
Write-Host "`nPer-model settings template:"
Write-Host "     Copy-Item `"$example`" `"$env:USERPROFILE\.aider.model.settings.yml`""
Write-Host "`nKeys are supplied per-launch by the run-aider-* scripts. Nothing stored in the settings file."
Write-Host "Smoke test (after keys are set):"
Write-Host '     $env:OPENAI_API_BASE=$env:DEEPSEEK_BASE_URL; $env:OPENAI_API_KEY=$env:DEEPSEEK_API_KEY'
Write-Host '     aider --model openai/deepseek-v4-flash --no-auto-commits'
