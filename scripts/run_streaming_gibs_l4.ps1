param(
    [double]$DurationMinutes = 60,
    [int]$TargetRemoteWindows = 200000,
    [int]$Grid = 8,
    [int]$Workers = 32,
    [int]$Resolution = 512,
    [int]$BatchSize = 24
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

$python = Join-Path $repoRoot '.venv-l4\Scripts\python.exe'
if (-not (Test-Path $python)) {
    throw "Project Python was not found at $python"
}

Write-Host '=== TP-26 STREAMING PUBLIC SATELLITE TRAINING / NVIDIA L4 ===' -ForegroundColor Cyan
Write-Host "Python: $python" -ForegroundColor Cyan
Write-Host "Duration: $DurationMinutes min" -ForegroundColor Cyan
Write-Host "Target distinct remote image windows: $TargetRemoteWindows" -ForegroundColor Cyan
Write-Host "Grid: ${Grid}x${Grid}; workers: $Workers; resolution: ${Resolution}px" -ForegroundColor Cyan
Write-Host 'Source: NASA GIBS public MODIS/VIIRS true-color WMS + local TP-26 research corpus.' -ForegroundColor Green
Write-Host 'The remote count is distinct geospatial/time windows actually trained, not source-scene count.' -ForegroundColor Yellow

nvidia-smi --query-gpu=name,driver_version,memory.total,power.limit --format=csv,noheader
& $python -c "import torch; assert torch.cuda.is_available(); print(torch.__version__); print(torch.version.cuda); print(torch.cuda.get_device_name(0))"
if ($LASTEXITCODE -ne 0) { throw 'PyTorch CUDA preflight failed.' }

$env:PYTORCH_CUDA_ALLOC_CONF = 'expandable_segments:True'
& $python -m terra_research_node.streaming_gibs_training `
    --duration-minutes $DurationMinutes `
    --target-remote-windows $TargetRemoteWindows `
    --start-year 2000 `
    --end-year 2026 `
    --grid $Grid `
    --workers $Workers `
    --resolution $Resolution `
    --batch-size $BatchSize
if ($LASTEXITCODE -ne 0) { throw "Streaming GIBS L4 run failed with exit code $LASTEXITCODE." }

Write-Host 'Done. See newest research_runs/stream_gibs_*/metrics.json.' -ForegroundColor Green
