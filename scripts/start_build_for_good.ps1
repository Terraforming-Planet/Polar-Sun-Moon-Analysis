param(
    [int]$DurationMinutes = 60,
    [int]$StartYear = 1990,
    [int]$EndYear = 2026,
    [switch]$SkipResearchSprint,
    [switch]$SkipValidation,
    [switch]$AllowCpuFallback
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

Write-Host '=== Terraforming Planet / BUILD FOR GOOD v2 ===' -ForegroundColor Cyan
Write-Host 'Public language target: ENGLISH ONLY' -ForegroundColor Cyan
Write-Host 'Research stations: Arctic 90N / Sahara / Oceans / Earth-Space 512' -ForegroundColor Cyan
Write-Host "Repository: $repoRoot"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'git is required.'
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) is required.'
}
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    throw 'Codex CLI was not found. Install/update it first with: npm install -g @openai/codex'
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python is required.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'Node.js/npm is required for the web application.'
}

Write-Host 'Tool versions:' -ForegroundColor DarkCyan
git --version
gh --version | Select-Object -First 1
codex --version
python --version
npm --version

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

git pull --ff-only origin $expectedBranch
if ($LASTEXITCODE -ne 0) { throw 'git pull failed.' }

Write-Host 'Current git status:' -ForegroundColor DarkCyan
git status -sb

Write-Host 'GPU preflight:' -ForegroundColor DarkCyan
$detectedL4 = $false
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    $gpuLines = @(nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader)
    $gpuLines | ForEach-Object { Write-Host $_ }
    $detectedL4 = ($gpuLines -join "`n") -match 'NVIDIA L4|\bL4\b'
} else {
    Write-Host 'nvidia-smi not found.' -ForegroundColor Yellow
}

if (-not $detectedL4 -and -not $AllowCpuFallback) {
    throw 'NVIDIA L4 was not detected. Re-run only after L4 is visible, or explicitly pass -AllowCpuFallback if you intentionally want CUDA/CPU fallback.'
}
if ($detectedL4) {
    Write-Host 'NVIDIA L4 detected. The research node must select CUDA automatically and record the device in device.json.' -ForegroundColor Green
} else {
    Write-Host 'L4 not detected; explicit fallback was allowed by the user.' -ForegroundColor Yellow
}

$briefPath = Join-Path $repoRoot 'CODEX_BUILD_FOR_GOOD_UI_L4.md'
$spaceSpecPath = Join-Path $repoRoot 'docs/EARTH_SPACE_512_RESEARCH_STATION.md'
if (-not (Test-Path $briefPath)) { throw "Missing Codex brief: $briefPath" }
if (-not (Test-Path $spaceSpecPath)) { throw "Missing Earth-Space 512 specification: $spaceSpecPath" }

$brief = Get-Content -Raw -Encoding UTF8 $briefPath
$launcherContext = @"

LAUNCHER CONTEXT / REQUIRED OUTCOME
- Public website language after this task: English only, including every tab, subpage, TEST 001-016 page, public report and all four research stations.
- Preserve scientific identifiers/proper nouns/raw source records where translation would damage provenance.
- Implement the Earth-Space 512 Research Station from docs/EARTH_SPACE_512_RESEARCH_STATION.md.
- Verify exactly 8x8x8 = 512 unique top-level cells and test their addressing.
- Keep the existing working UI accessible as an English Legacy / Classic Interface.
- Build the language-audit script and make it pass on source and deployable output.
- Do not invent a discovery. The real one-hour L4 research sprint runs only after implementation/validation.
"@
$prompt = $brief + $launcherContext

Write-Host 'Starting Codex implementation from the v2 repository brief...' -ForegroundColor Green
Write-Host 'Using current non-interactive Codex exec mode with workspace-write sandbox.' -ForegroundColor Yellow

& codex exec --sandbox workspace-write $prompt
if ($LASTEXITCODE -ne 0) {
    throw "Codex exited with code $LASTEXITCODE. Review its last output before continuing."
}

Write-Host 'Codex implementation step finished.' -ForegroundColor Green
Write-Host 'Git status after Codex:' -ForegroundColor DarkCyan
git status -sb

$languageAudit = Join-Path $repoRoot 'scripts/audit_public_language.py'
if (-not (Test-Path $languageAudit)) {
    throw 'Codex did not create scripts/audit_public_language.py. Full-English public-site migration is not verified.'
}

Write-Host 'Running mandatory public-language audit...' -ForegroundColor Cyan
python $languageAudit
if ($LASTEXITCODE -ne 0) {
    throw 'Public-language audit failed. Fix remaining Polish user-facing strings before the L4 research sprint.'
}

if (-not $SkipValidation) {
    Write-Host 'Running Python quality gates...' -ForegroundColor Cyan
    python -m ruff check .
    if ($LASTEXITCODE -ne 0) { throw 'Ruff failed.' }

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

    Write-Host 'Re-running language audit after web build...' -ForegroundColor Cyan
    python $languageAudit
    if ($LASTEXITCODE -ne 0) { throw 'Post-build language audit failed.' }
} else {
    Write-Host 'Full validation was explicitly skipped; mandatory language audit still passed.' -ForegroundColor Yellow
}

if ($SkipResearchSprint) {
    Write-Host 'Research sprint skipped by request.' -ForegroundColor Yellow
    exit 0
}

$researchScript = Join-Path $repoRoot 'scripts/run_l4_research.ps1'
if (-not (Test-Path $researchScript)) {
    throw 'Codex did not create scripts/run_l4_research.ps1. Do not fake the one-hour result; review the implementation first.'
}

Write-Host "Starting REAL NVIDIA L4 research sprint: $StartYear-$EndYear, wall-clock budget $DurationMinutes minutes." -ForegroundColor Green
Write-Host 'The sprint must store device/config/source/scene manifests, continuous logs, metrics, candidates, findings, failures and report.' -ForegroundColor Yellow
Write-Host 'Earth-change findings remain candidates until the publication gate passes.' -ForegroundColor Yellow

& $researchScript -DurationMinutes $DurationMinutes -StartYear $StartYear -EndYear $EndYear
if ($LASTEXITCODE -ne 0) {
    throw "Research sprint exited with code $LASTEXITCODE. Keep its failure logs for diagnosis."
}

Write-Host 'Research sprint completed. Review research_runs/<run_id>/report.md, findings.json and publication-gate output.' -ForegroundColor Green
Write-Host 'Do NOT use git add -A if raw/cache files are present. Commit only source code, tests, docs and compact validated public findings.' -ForegroundColor Yellow
