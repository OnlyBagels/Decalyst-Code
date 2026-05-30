# check-env.ps1 - verify tools + report credential PRESENCE. Never prints a secret value.
$ErrorActionPreference = 'SilentlyContinue'
$problems = 0

function Report-Var($name) {
  $val = [Environment]::GetEnvironmentVariable($name)
  if ($val) { Write-Host "OK  $name is set (value hidden)" }
  else { Write-Host "--  $name not set" }
}

Write-Host "=== tools ==="
foreach ($t in 'opencode','aider') {
  $cmd = Get-Command $t -ErrorAction SilentlyContinue
  if ($cmd) { Write-Host "OK  $t  ($($cmd.Source))" }
  else { Write-Host "X   $t  not installed"; if ($t -eq 'opencode') { $problems++ } }
}

Write-Host "`n=== DeepSeek credentials ==="
Report-Var DEEPSEEK_API_KEY
Report-Var DEEPSEEK_BASE_URL
Write-Host "    (DeepSeek can also be authed via 'opencode auth login' - env var not required for OpenCode)"

Write-Host "`n=== MiMo credentials ==="
Report-Var MIMO_API_KEY
Report-Var MIMO_BASE_URL
if (-not [Environment]::GetEnvironmentVariable('MIMO_BASE_URL')) {
  Write-Host "    !  MIMO_BASE_URL is required for MiMo. Set it from official MiMo docs or your value."
}

Write-Host "`n=== Generic OpenAI-compatible (Aider / local) ==="
Report-Var OPENAI_API_KEY
Report-Var OPENAI_API_BASE

Write-Host ""
if ($problems -gt 0) { Write-Host "X  missing required tooling - see docs/provider-setup.md"; exit 1 }
Write-Host "OK environment check complete (no secrets printed)"
