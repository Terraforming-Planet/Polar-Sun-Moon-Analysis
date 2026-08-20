param(
    [switch]$SkipValidation
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$expectedBranch = 'agent/cloudflare-openai-evidence-explainer'
$currentBranch = (git branch --show-current).Trim()
if ($currentBranch -ne $expectedBranch) {
    throw "Run this script only on '$expectedBranch'. Current branch: '$currentBranch'."
}

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    throw 'Codex CLI was not found in PATH.'
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python was not found in PATH.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm was not found in PATH.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js was not found in PATH.'
}

$briefPath = Join-Path $repoRoot 'CODEX_CLOUDFLARE_OPENAI_EVIDENCE.md'
if (-not (Test-Path $briefPath)) {
    throw "Missing Codex brief: $briefPath"
}

$prompt = @"
Read CODEX_CLOUDFLARE_OPENAI_EVIDENCE.md completely and finish that task in this repository.
Inspect the existing implementation before changing it. Preserve scientific guardrails and never expose secrets.
Do not create a new repository. Work only on the current branch '$expectedBranch'.
Do not commit or push automatically. Run the requested validation and finish with a concise report of changes and remaining deployment requirements.
"@

Write-Host 'Running Codex submission pass for Cloudflare/OpenAI evidence integration...'
codex -c 'windows.sandbox="unelevated"' exec --sandbox workspace-write $prompt
if ($LASTEXITCODE -ne 0) {
    throw "Codex exited with code $LASTEXITCODE."
}

if ($SkipValidation) {
    Write-Host 'Validation skipped by request.'
    exit 0
}

Write-Host 'Running Cloudflare Worker guardrail tests...'
node --test cloudflare/evidence-worker/test/*.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Worker tests failed.' }

Write-Host 'Running Python quality gates...'
python -m ruff check .
if ($LASTEXITCODE -ne 0) { throw 'Ruff failed.' }
python -m mypy polar_equinox_analysis terra_hazards terra_integrity terra_water
if ($LASTEXITCODE -ne 0) { throw 'MyPy failed.' }
python -m pytest -q
if ($LASTEXITCODE -ne 0) { throw 'Pytest failed.' }

Write-Host 'Running web tests/build...'
Push-Location (Join-Path $repoRoot 'web')
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'Web tests failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
}
finally {
    Pop-Location
}

Write-Host 'Validation complete. Review git diff before committing any Codex-generated follow-up changes.'
