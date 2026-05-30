# Run Aider with DeepSeek V4 Flash via the OpenAI-compatible endpoint.
if (-not (Get-Command aider -ErrorAction SilentlyContinue)) { Write-Host "X aider not installed. See docs/provider-setup.md"; exit 1 }
if (-not $env:DEEPSEEK_API_KEY) { Write-Host "X Set DEEPSEEK_API_KEY (value not printed)"; exit 1 }
$base = if ($env:DEEPSEEK_BASE_URL) { $env:DEEPSEEK_BASE_URL } else { 'https://api.deepseek.com' }
Write-Host "> aider --model openai/deepseek-v4-flash  (base: $base)"
$env:OPENAI_API_BASE = $base
$env:OPENAI_API_KEY  = $env:DEEPSEEK_API_KEY
& aider --model openai/deepseek-v4-flash @args
