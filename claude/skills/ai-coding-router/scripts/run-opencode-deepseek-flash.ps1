# Launch OpenCode pinned to DeepSeek V4 Flash - the default cheap bulk worker.
$model = 'deepseek/deepseek-v4-flash'
if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) { Write-Host "X opencode not installed. See docs/provider-setup.md"; exit 1 }
Write-Host "> opencode --model $model  (auth via 'opencode auth login' if not already)"
& opencode --model $model @args
