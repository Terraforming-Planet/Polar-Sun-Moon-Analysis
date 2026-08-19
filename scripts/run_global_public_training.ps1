param(
    [int]$TargetImages = 20000,
    [double]$TrainingMinutes = 60,
    [int]$Grid = 4,
    [int]$Workers = 8,
    [double]$MaxDownloadGB = 20,
    [int]$Resolution = 512,
    [int]$BatchSize = 24
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'python was not found in the active environment.'
}

Write-Host '=== STAGE 1 / GLOBAL PUBLIC SATELLITE DATASET / CPU + NETWORK ===' -ForegroundColor Cyan
Write-Host "Target unique downloaded images/windows: $TargetImages" -ForegroundColor Cyan
Write-Host 'Official/public sources: NASA GIBS, USGS Landsat, ESA/Copernicus CDSE' -ForegroundColor Cyan
Write-Host 'Existing cached files are reused; failed requests are logged and do not erase prior progress.' -ForegroundColor DarkCyan

python -m terra_research_node.global_public_dataset `
    --target-images $TargetImages `
    --start-year 1990 `
    --end-year 2026 `
    --grid $Grid `
    --workers $Workers `
    --size $Resolution `
    --max-download-gb $MaxDownloadGB

if ($LASTEXITCODE -ne 0) {
    throw "Global public dataset harvest failed with exit code $LASTEXITCODE."
}

Write-Host '=== STAGE 2 / NVIDIA CUDA TRAINING ===' -ForegroundColor Cyan
if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
    throw 'Dataset is saved, but nvidia-smi was not found. Start/attach the L4 and rerun training only.'
}

nvidia-smi --query-gpu=name,driver_version,memory.total,power.limit --format=csv,noheader
python -c "import torch; assert torch.cuda.is_available(); print(torch.__version__); print(torch.version.cuda); print(torch.cuda.get_device_name(0))"
if ($LASTEXITCODE -ne 0) {
    throw 'Dataset is saved, but PyTorch CUDA preflight failed.'
}

$env:PYTORCH_CUDA_ALLOC_CONF = 'expandable_segments:True'
$trainingWorkers = [Math]::Max(0, [Math]::Min($Workers, 8))
python -m terra_research_node.global_public_training `
    --duration-minutes $TrainingMinutes `
    --resolution $Resolution `
    --batch-size $BatchSize `
    --workers $trainingWorkers

if ($LASTEXITCODE -ne 0) {
    throw "Global public CUDA training failed with exit code $LASTEXITCODE."
}

Write-Host 'DONE. Exact unique-image, source-scene, source/region and training counts are in the newest research_runs folders.' -ForegroundColor Green
