param(
    [ValidateRange(1, 1440)][int]$Minutes = 60,
    [ValidateRange(1, 128)][int]$BatchSize = 32,
    [ValidateRange(2, 1024)][int]$MaxPairs = 128
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
$outputDir = Join-Path $repoRoot 'research_runs\training004_cached_gpu_one_hour'
$streamingCheckpoint = Join-Path $repoRoot 'research_runs\training004_streaming_one_hour\checkpoints\latest.pt'

& $python scripts\run_training004_cached_gpu_l4.py `
    --cache-dir $cacheDir `
    --output-dir $outputDir `
    --minutes $Minutes `
    --batch-size $BatchSize `
    --max-pairs $MaxPairs `
    --device cuda `
    --resume-from $streamingCheckpoint

if ($LASTEXITCODE -ne 0) {
    throw "Cached CUDA training failed with exit code $LASTEXITCODE"
}
