param(
    [int]$DurationMinutes = 60,
    [int]$StartYear = 1990,
    [int]$EndYear = 2026,
    [switch]$SkipResearchSprint
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

Write-Host '=== Terraforming Planet / BUILD FOR GOOD ===' -ForegroundColor Cyan
Write-Host "Repository: $repoRoot"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'git is required.'
}
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    throw 'Codex CLI was not found. Install/update it first with: npm install -g @openai/codex'
}

$expectedBranch = 'agent/build-for-good-ui-l4'
$currentBranch = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to read the current git branch.' }

if ($currentBranch -ne $expectedBranch) {
    Write-Host "Switching from $currentBranch to $expectedBranch..." -ForegroundColor Yellow
    git fetch origin $expectedBranch
    if ($LASTEXITCODE -ne 0) { throw 'git fetch failed.' }
    git switch $expectedBranch
    if ($LASTEXITCODE -ne 0) { throw 'git switch failed.' }
}

Write-Host 'Current git status:' -ForegroundColor DarkCyan
git status -sb

Write-Host 'GPU visibility before implementation:' -ForegroundColor DarkCyan
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
} else {
    Write-Host 'nvidia-smi not found; the research node must fall back to CPU when CUDA is unavailable.' -ForegroundColor Yellow
}

$briefPath = Join-Path $repoRoot 'CODEX_BUILD_FOR_GOOD_UI_L4.md'
if (-not (Test-Path $briefPath)) { throw "Missing Codex brief: $briefPath" }
$prompt = Get-Content -Raw -Encoding UTF8 $briefPath

Write-Host 'Starting Codex implementation from the repository brief...' -ForegroundColor Green
Write-Host 'Codex Auto Edit may ask you to approve shell commands/tests. Do not approve unrelated destructive commands.' -ForegroundColor Yellow

& codex --auto-edit $prompt
if ($LASTEXITCODE -ne 0) {
    throw "Codex exited with code $LASTEXITCODE. Review its last output before continuing."
}

Write-Host 'Codex implementation step finished.' -ForegroundColor Green
Write-Host 'Git status after Codex:' -ForegroundColor DarkCyan
git status -sb

if ($SkipResearchSprint) {
    Write-Host 'Research sprint skipped by request.' -ForegroundColor Yellow
    exit 0
}

$researchScript = Join-Path $repoRoot 'scripts/run_l4_research.ps1'
if (-not (Test-Path $researchScript)) {
    throw 'Codex did not create scripts/run_l4_research.ps1. Do not fake the one-hour result; review the implementation first.'
}

Write-Host "Starting real research sprint: $StartYear-$EndYear, wall-clock budget $DurationMinutes minutes." -ForegroundColor Green
Write-Host 'This step may access official public data sources. Findings are candidates until the publication gate passes.' -ForegroundColor Yellow

& $researchScript -DurationMinutes $DurationMinutes -StartYear $StartYear -EndYear $EndYear
if ($LASTEXITCODE -ne 0) {
    throw "Research sprint exited with code $LASTEXITCODE. Keep its failure logs for diagnosis."
}

Write-Host 'Research sprint completed. Review research_runs/<run_id>/report.md and validated public findings before committing.' -ForegroundColor Green
Write-Host 'Do NOT use git add -A if raw/cache files are present. Commit only source code, tests, docs and compact validated public findings.' -ForegroundColor Yellow
