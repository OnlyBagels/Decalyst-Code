# Launch OpenCode pinned to DeepSeek V4 Pro - hard/long-context cheap coder.
$model = 'deepseek/deepseek-v4-pro'
if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) { Write-Host "X opencode not installed. See docs/provider-setup.md"; exit 1 }
Write-Host "> opencode --model $model"
& opencode --model $model @args
