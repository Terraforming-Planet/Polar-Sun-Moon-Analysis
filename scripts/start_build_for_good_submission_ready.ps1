param(
    [switch]$SkipValidation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

$expectedBranch = 'agent/build-for-good-submission-ready'
$currentBranch = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to read the current git branch.' }
if ($currentBranch -ne $expectedBranch) {
    throw "Run this launcher only on $expectedBranch. Current branch: $currentBranch"
}

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    throw 'Codex CLI was not found. Install/update it with: npm install -g @openai/codex'
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python 3 is required for validation.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'Node.js/npm is required for web validation.'
}

$briefPath = Join-Path $repoRoot 'CODEX_BUILD_FOR_GOOD_SUBMISSION_READY.md'
if (-not (Test-Path $briefPath)) {
    throw "Missing Codex brief: $briefPath"
}

Write-Host '=== Terra Observation System / BUILD FOR GOOD submission-ready Codex pass ===' -ForegroundColor Cyan
Write-Host "Branch: $currentBranch"
Write-Host 'Git status before Codex:' -ForegroundColor DarkCyan
git status -sb

$prompt = Get-Content -Raw -Encoding UTF8 $briefPath
& codex -c 'windows.sandbox="unelevated"' exec --sandbox workspace-write $prompt
if ($LASTEXITCODE -ne 0) {
    throw "Codex exited with code $LASTEXITCODE. Review its output before continuing."
}

Write-Host 'Git status after Codex:' -ForegroundColor DarkCyan
git status -sb

if ($SkipValidation) {
    Write-Host 'Validation was explicitly skipped.' -ForegroundColor Yellow
    exit 0
}

Write-Host 'Running Python quality gates...' -ForegroundColor Cyan
python -m ruff check .
if ($LASTEXITCODE -ne 0) { throw 'Ruff failed.' }

python -m mypy polar_equinox_analysis terra_hazards terra_research_node tests
if ($LASTEXITCODE -ne 0) { throw 'MyPy failed.' }

python -m pytest -q
if ($LASTEXITCODE -ne 0) { throw 'Pytest failed.' }

Write-Host 'Running web quality gates...' -ForegroundColor Cyan
Push-Location (Join-Path $repoRoot 'web')
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'web tests failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'web build failed.' }
}
finally {
    Pop-Location
}

Write-Host 'Submission-ready Codex pass and validation completed.' -ForegroundColor Green
Write-Host 'Review the diff before committing any Codex changes.' -ForegroundColor Yellow
