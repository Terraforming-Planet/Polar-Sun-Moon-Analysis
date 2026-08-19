param(
    [double]$DurationMinutes = 60,
    [int]$Resolution = 512,
    [int]$BatchSize = 24
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

Write-Host '=== Terra / ALL SITE RESEARCH IMAGES / NVIDIA L4 ===' -ForegroundColor Cyan
nvidia-smi --query-gpu=name,driver_version,memory.total,power.limit --format=csv,noheader
python -c "import torch; assert torch.cuda.is_available(); print(torch.__version__); print(torch.version.cuda); print(torch.cuda.get_device_name(0))"
if ($LASTEXITCODE -ne 0) { throw 'PyTorch CUDA preflight failed.' }

$env:PYTORCH_CUDA_ALLOC_CONF = 'expandable_segments:True'
python -m terra_research_node.site_gpu_runner --duration-minutes $DurationMinutes --resolution $Resolution --batch-size $BatchSize
if ($LASTEXITCODE -ne 0) { throw "Full site CUDA run failed with exit code $LASTEXITCODE." }

Write-Host 'Done. See newest research_runs/site_*/metrics.json.' -ForegroundColor Green
