# Run Aider with MiMo V2.5 via the OpenAI-compatible endpoint.
if (-not (Get-Command aider -ErrorAction SilentlyContinue)) { Write-Host "X aider not installed. See docs/provider-setup.md"; exit 1 }
if (-not $env:MIMO_API_KEY)  { Write-Host "X Set MIMO_API_KEY (value not printed)"; exit 1 }
if (-not $env:MIMO_BASE_URL) { Write-Host "X Set MIMO_BASE_URL from official MiMo docs or your value"; exit 1 }
Write-Host "> aider --model openai/mimo-v2.5  (base: $env:MIMO_BASE_URL)"
$env:OPENAI_API_BASE = $env:MIMO_BASE_URL
$env:OPENAI_API_KEY  = $env:MIMO_API_KEY
& aider --model openai/mimo-v2.5 @args
