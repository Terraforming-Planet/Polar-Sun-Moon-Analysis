param(
    [ValidateRange(1, 1440)][int]$Minutes = 60,
    [ValidateRange(8, 512)][int]$BatchSize = 128,
    [ValidateRange(2, 4096)][int]$MaxPairs = 256
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot
$python = Join-Path $repoRoot '.venv-l4\Scripts\python.exe'
if (-not (Test-Path $python)) {
    throw "Missing CUDA Python environment: $python"
}

$cacheDir = Join-Path $repoRoot 'research_runs\raster-block-cache'
$outputDir = Join-Path $repoRoot 'research_runs\training004_gpu_ssl_one_hour'

Write-Host 'TERRA TRAINING #4 - MASKED SPECTRAL-TEMPORAL CUDA' -ForegroundColor Green
Write-Host (
    "Minutes=$Minutes | requested batch=$BatchSize | real cache limit=$MaxPairs"
) -ForegroundColor Cyan
Write-Host (
    'Mixed 256/512 caches normalize to one 256 px scientific AOI tensor.'
) -ForegroundColor Cyan

& $python scripts\run_training004_cached_gpu_l4.py `
    --cache-dir $cacheDir `
    --output-dir $outputDir `
    --minutes $Minutes `
    --batch-size $BatchSize `
    --max-pairs $MaxPairs `
    --canvas-size 256 `
    --mask-ratio 0.40 `
    --device cuda

if ($LASTEXITCODE -ne 0) {
    throw "Masked CUDA training failed with exit code $LASTEXITCODE"
}

Write-Host "SUMMARY=$outputDir\summary.json" -ForegroundColor Green
Write-Host "CHECKPOINT=$outputDir\checkpoints\latest.pt" -ForegroundColor Green
