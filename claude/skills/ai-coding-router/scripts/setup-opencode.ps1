# setup-opencode.ps1 - wire DeepSeek + MiMo (+ optional local) into OpenCode.
# Prints guidance and the example config. NEVER overwrites an existing config without
# a backup + explicit confirmation (re-run with -Apply).
param([switch]$Apply)
$ErrorActionPreference = 'SilentlyContinue'

$here    = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$example = Join-Path $here 'templates\opencode.example.json'
$cfgDir  = Join-Path $env:USERPROFILE '.config\opencode'
$json    = Join-Path $cfgDir 'opencode.json'
$jsonc   = Join-Path $cfgDir 'opencode.jsonc'

Write-Host "=== OpenCode provider setup ===`n"
Write-Host "1) Store your key in OpenCode's own credential store (user-level, not in any repo):"
Write-Host "     opencode auth login        # choose DeepSeek, paste key when prompted"
Write-Host "   For MiMo (custom provider) set env vars instead: MIMO_API_KEY, MIMO_BASE_URL`n"
Write-Host "2) Merge the provider block from:"
Write-Host "     $example"

$target = $json
if (Test-Path $jsonc) { $target = $jsonc }

if (Test-Path $target) {
  Write-Host "`n$target already exists - NOT overwriting."
  Write-Host "Current contents:`n----"
  Get-Content $target | Write-Host
  Write-Host "----"
  if ($Apply) {
    $bak = "$target.bak"
    Copy-Item $target $bak -Force
    Write-Host "backup written: $bak"
    Write-Host "Merge the `"provider`" block by hand - automatic JSON merge is intentionally not done."
    Write-Host "Example: $example"
  } else {
    Write-Host "To back up and proceed, re-run with -Apply (merge is still manual, by design)."
  }
} else {
  Write-Host "`nNo config at $target. Start from the example:"
  Write-Host "     Copy-Item `"$example`" `"$json`""
}

Write-Host "`n3) Verify:"
Write-Host "     opencode --version"
Write-Host "     opencode            # then type /models to list, /connect for auth"
