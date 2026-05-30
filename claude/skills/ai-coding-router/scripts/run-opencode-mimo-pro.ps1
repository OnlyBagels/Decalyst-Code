# Launch OpenCode pinned to MiMo V2.5-Pro - challenger to DeepSeek Pro.
$model = 'mimo/mimo-v2.5-pro'
if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) { Write-Host "X opencode not installed. See docs/provider-setup.md"; exit 1 }
if (-not [Environment]::GetEnvironmentVariable('MIMO_BASE_URL')) { Write-Host "X MIMO_BASE_URL not set (required for MiMo). See docs/provider-setup.md"; exit 1 }
Write-Host "> opencode --model $model"
& opencode --model $model @args
