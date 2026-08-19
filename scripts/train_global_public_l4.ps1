param(
    [double]$TrainingMinutes = 60,
    [int]$Resolution = 512,
    [int]$BatchSize = 24,
    [int]$Workers = 8
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

$manifest = Join-Path $repoRoot 'research_cache/global_public_dataset/records.jsonl'
if (-not (Test-Path $manifest)) {
    throw 'Global dataset is missing. Run scripts/build_global_public_dataset.ps1 first.'
}
if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
    throw 'nvidia-smi was not found. The NVIDIA L4 is not visible.'
}

Write-Host '=== GLOBAL PUBLIC SATELLITE TRAINING / NVIDIA L4 ===' -ForegroundColor Cyan
nvidia-smi --query-gpu=name,driver_version,memory.total,power.limit --format=csv,noheader
python -c "import torch; assert torch.cuda.is_available(); print(torch.__version__); print(torch.version.cuda); print(torch.cuda.get_device_name(0))"
if ($LASTEXITCODE -ne 0) {
    throw 'PyTorch CUDA preflight failed.'
}

$env:PYTORCH_CUDA_ALLOC_CONF = 'expandable_segments:True'
python -m terra_research_node.global_public_training `
    --duration-minutes $TrainingMinutes `
    --resolution $Resolution `
    --batch-size $BatchSize `
    --workers $Workers

if ($LASTEXITCODE -ne 0) {
    throw "Global public CUDA training failed with exit code $LASTEXITCODE."
}

Write-Host 'TRAINING COMPLETE. Check the newest research_runs/global_*/metrics.json.' -ForegroundColor Green
