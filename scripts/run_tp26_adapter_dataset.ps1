param(
    [int]$TargetImages = 500000,
    [int]$Grid = 8,
    [int]$Workers = 16,
    [double]$MaxDownloadGB = 120,
    [int]$ExtraPerAdapter = 10000,
    [int]$Resolution = 512
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot
$probeWorkers = [Math]::Min($Workers, 6)

Write-Host '=== TP-26 MULTI-ADAPTER DATASET / CPU + NETWORK ===' -ForegroundColor Cyan
Write-Host 'This stage does not require the paid NVIDIA L4.' -ForegroundColor Green
Write-Host "Target unique imagery windows: $TargetImages" -ForegroundColor Cyan

python -m terra_research_node.adapter_preflight --workers $probeWorkers
if ($LASTEXITCODE -ne 0) {
    Write-Warning 'Adapter preflight returned an error; the harvest will still try resilient sources.'
}

python -m terra_research_node.public_adapter_harvest --max-per-adapter $ExtraPerAdapter
if ($LASTEXITCODE -ne 0) {
    Write-Warning 'One or more additional public adapters failed; continuing with the global core harvest.'
}

& "$PSScriptRoot\build_global_public_dataset.ps1" `
    -TargetImages $TargetImages `
    -Grid $Grid `
    -Workers $Workers `
    -MaxDownloadGB $MaxDownloadGB `
    -Resolution $Resolution

if ($LASTEXITCODE -ne 0) {
    throw "TP-26 global dataset build failed with exit code $LASTEXITCODE."
}

Write-Host 'TP-26 DATASET READY.' -ForegroundColor Green
Write-Host 'For cloud runs with automatic disk budgeting and full console logging use:' -ForegroundColor Yellow
Write-Host '.\scripts\run_tp26_cloud_massive_dataset.ps1' -ForegroundColor Yellow
Write-Host 'When the current L4 test is finished, start the next GPU run with:' -ForegroundColor Yellow
Write-Host '.\scripts\train_global_public_l4.ps1 -TrainingMinutes 60' -ForegroundColor Yellow
