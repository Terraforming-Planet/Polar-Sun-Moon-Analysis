param(
    [double]$DurationMinutes = 60,
    [int]$StartYear = 1990,
    [int]$EndYear = 2026,
    [int]$Resolution = 512,
    [int]$BatchSize = 24,
    [int]$MaxImages = 768
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

Write-Host '=== Terra Research Node / REAL CUDA TRAINING ===' -ForegroundColor Cyan
Write-Host "Research window: $StartYear-$EndYear" -ForegroundColor Cyan
Write-Host "Training budget: $DurationMinutes minutes" -ForegroundColor Cyan

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'python was not found in the active environment.'
}
if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
    throw 'nvidia-smi was not found. The L4 is not visible to this Windows session.'
}

nvidia-smi --query-gpu=name,driver_version,memory.total,power.limit --format=csv,noheader
python -c "import torch; assert torch.cuda.is_available(); print(torch.__version__); print(torch.version.cuda); print(torch.cuda.get_device_name(0))"
if ($LASTEXITCODE -ne 0) {
    throw 'PyTorch CUDA preflight failed.'
}

$env:PYTORCH_CUDA_ALLOC_CONF = 'expandable_segments:True'
python -m terra_research_node.runner `
    --duration-minutes $DurationMinutes `
    --start-year $StartYear `
    --end-year $EndYear `
    --resolution $Resolution `
    --batch-size $BatchSize `
    --max-images $MaxImages

if ($LASTEXITCODE -ne 0) {
    throw "Terra L4 training failed with exit code $LASTEXITCODE."
}

Write-Host 'Training finished. Open the newest research_runs/<run_id>/metrics.json.' -ForegroundColor Green
