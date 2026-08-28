param(
    [int]$Workers = 16,
    [int]$BatchSize = 24,
    [int]$Seed = 4004,
    [switch]$SkipEve
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot
$python = Join-Path $repoRoot '.venv-l4\Scripts\python.exe'
if (-not (Test-Path $python)) { throw 'Missing .venv-l4 Python environment.' }

$streamRunner = Join-Path $repoRoot 'scripts\run_training004_streaming_l4.py'
$parityRunner = Join-Path $repoRoot 'scripts\run_eve_terra_parity.py'
$reportRunner = Join-Path $repoRoot 'scripts\build_esa_readiness_report.py'
$manifest = Join-Path $repoRoot 'research_runs\training004_water_cycle_manifest.jsonl'
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$runRoot = Join-Path $repoRoot "research_runs\training004_esa_readiness_$stamp"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

function Invoke-Checked {
    param([string]$Label, [scriptblock]$Command)
    Write-Host "`n=== $Label ===" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}

function Assert-File([string]$Path, [string]$Label) {
    if (-not (Test-Path $Path)) { throw "$Label missing: $Path" }
}

Write-Host 'TERRA OBSERVATION — TRAINING #4 ESA READINESS EXECUTION' -ForegroundColor Green
Write-Host "Run root: $runRoot" -ForegroundColor DarkCyan

Assert-File $streamRunner 'Real streaming runner'
Assert-File $parityRunner 'Terra/EVE parity runner'
Assert-File $reportRunner 'ESA readiness report builder'

if (-not (Test-Path $manifest)) {
    Invoke-Checked 'BUILD 500K RECIPE MANIFEST' {
        & $python scripts/build_training_004_water_cycle_manifest.py --output $manifest --count 500000 --seed $Seed
    }
}

$stages = @(
    @{ Name = 'stream-1k'; Target = 1000 },
    @{ Name = 'stream-10k'; Target = 10000 },
    @{ Name = 'stream-50k'; Target = 50000 }
)

foreach ($stage in $stages) {
    $stageDir = Join-Path $runRoot $stage.Name
    New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
    Invoke-Checked ("REAL STREAMING " + $stage.Name) {
        & $python $streamRunner `
            --manifest $manifest `
            --output-dir $stageDir `
            --target-real-windows $stage.Target `
            --workers $Workers `
            --batch-size $BatchSize `
            --seed $Seed `
            --device cuda `
            --resume
    }

    $summary = Join-Path $stageDir 'summary.json'
    Assert-File $summary ($stage.Name + ' summary')
    $json = Get-Content $summary -Raw | ConvertFrom-Json
    if ($json.status -ne 'PASS') {
        throw "$($stage.Name) did not PASS; status=$($json.status)"
    }
    if ([int64]$json.real_scientific_windows_trained -ne [int64]$stage.Target) {
        throw "$($stage.Name) count mismatch: expected $($stage.Target), got $($json.real_scientific_windows_trained)"
    }
    if ($json.test001_leakage -eq $true -or $json.benchmark_leakage -eq $true -or $json.mission_leakage -eq $true) {
        throw "$($stage.Name) leakage gate failed"
    }
}

$parityDir = Join-Path $runRoot 'agentic-parity'
New-Item -ItemType Directory -Force -Path $parityDir | Out-Null
$parityArgs = @(
    '--output-dir', $parityDir,
    '--benchmark', 'config/agentic-eo-benchmark-v1.json',
    '--missions', 'config/training-004-esa-agentic-missions-v1.json',
    '--repetitions', '1',
    '--seed', "$Seed"
)
if ($SkipEve) { $parityArgs += '--skip-eve' }

Invoke-Checked 'TERRA / EVE PARITY — B01-B10 + M001-M006' {
    & $python $parityRunner @parityArgs
}

$paritySummary = Join-Path $parityDir 'summary.json'
Assert-File $paritySummary 'Parity summary'

$reportDir = Join-Path $runRoot 'report'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
Invoke-Checked 'BUILD ESA READINESS REPORT' {
    & $python $reportRunner --run-root $runRoot --output-dir $reportDir
}

Assert-File (Join-Path $reportDir 'esa_readiness.json') 'ESA JSON report'
Assert-File (Join-Path $reportDir 'ESA_READINESS.md') 'ESA Markdown report'

Write-Host ''
Write-Host 'TRAINING #4 ESA READINESS: PASS' -ForegroundColor Green
Write-Host 'Completed real stages: 1k -> 10k -> 50k' -ForegroundColor Green
Write-Host 'Completed frozen parity: B01-B10 + M001-M006' -ForegroundColor Green
Write-Host "Evidence: $runRoot" -ForegroundColor Cyan
Write-Host 'No run artifacts, model weights, caches, or secrets were committed by this runner.' -ForegroundColor Yellow
