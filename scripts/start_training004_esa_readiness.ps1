param(
    [switch]$SkipImplementation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot
$branch = 'agent/eve-terra-l4-comparative-benchmark'
$brief = Join-Path $repoRoot 'CODEX_TRAINING004_STREAMING_EVE_ESA_READINESS.md'
$runner = Join-Path $repoRoot 'scripts\run_training004_esa_readiness_l4.ps1'

function Invoke-Checked {
    param([string]$Label, [scriptblock]$Command)
    Write-Host "`n=== $Label ===" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

Write-Host 'TERRA OBSERVATION — TRAINING #4 ESA READINESS LAUNCHER' -ForegroundColor Green

Invoke-Checked 'FETCH PR #248 BRANCH' {
    git fetch origin $branch main --prune
}

$current = (git branch --show-current).Trim()
if ($current -ne $branch) {
    Invoke-Checked 'SWITCH TO PR #248 BRANCH' {
        git switch $branch
    }
}

Invoke-Checked 'FAST-FORWARD PR #248' {
    git pull --ff-only origin $branch
}

if (-not (Test-Path $brief)) {
    throw "Missing ESA-readiness brief: $brief"
}

$python = Join-Path $repoRoot '.venv-l4\Scripts\python.exe'
if (-not (Test-Path $python)) {
    throw 'Missing .venv-l4 Python environment.'
}

if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
    throw 'nvidia-smi is unavailable. Start this launcher on the NVIDIA L4 host.'
}

$gpuName = (nvidia-smi --query-gpu=name --format=csv,noheader | Select-Object -First 1).Trim()
Write-Host "GPU=$gpuName" -ForegroundColor DarkCyan
if ($gpuName -notmatch 'NVIDIA L4|\bL4\b') {
    throw "Expected NVIDIA L4, detected: $gpuName"
}

& $python -c "import torch; assert torch.cuda.is_available(); print('CUDA_OK', torch.__version__, torch.version.cuda, torch.cuda.get_device_name(0))"
if ($LASTEXITCODE -ne 0) {
    throw 'CUDA/PyTorch preflight failed.'
}

if (-not $SkipImplementation) {
    if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
        throw 'Codex CLI is unavailable on this host.'
    }
    Invoke-Checked 'CODEX LOGIN STATUS' {
        codex login status
    }
    $task = Get-Content $brief -Raw
    Write-Host 'Implementing real streaming, EVE parity and ESA-readiness evidence...' -ForegroundColor Green
    & codex exec --sandbox danger-full-access $task
    if ($LASTEXITCODE -ne 0) {
        throw "Codex implementation failed with exit code $LASTEXITCODE"
    }
}

Invoke-Checked 'TRACKED SECRET SCAN' {
    & $python scripts/ci/scan_tracked_secrets.py
}
Invoke-Checked 'RUFF' {
    & $python -m ruff check .
}
Invoke-Checked 'PYTEST' {
    & $python -m pytest -q
}
Invoke-Checked 'COMPILEALL' {
    & $python -m compileall terra_research_node scripts tests
}

if (-not (Test-Path $runner)) {
    throw "Implementation did not produce required runner: $runner"
}

Write-Host 'Starting staged 1k -> 10k -> 50k streaming + Terra/EVE parity + ESA report...' -ForegroundColor Green
& $runner
if ($LASTEXITCODE -ne 0) {
    throw "ESA-readiness runner failed with exit code $LASTEXITCODE"
}
