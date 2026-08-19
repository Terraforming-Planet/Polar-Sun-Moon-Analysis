param(
    [int]$TargetImages = 200000,
    [int]$Grid = 6,
    [int]$Workers = 6,
    [double]$MaxDownloadGB = 30,
    [int]$ExtraPerAdapter = 2000,
    [int]$Resolution = 512
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

Write-Host '=== TP-26 MULTI-ADAPTER DATASET / CPU + NETWORK ===' -ForegroundColor Cyan
Write-Host 'This stage does not require the paid NVIDIA L4.' -ForegroundColor Green
Write-Host "Target unique imagery windows: $TargetImages" -ForegroundColor Cyan

python -m terra_research_node.adapter_preflight --workers ([Math]::Min($Workers, 6))
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
Write-Host 'When the current L4 test is finished, start the next GPU run with:' -ForegroundColor Yellow
Write-Host '.\scripts\train_global_public_l4.ps1 -TrainingMinutes 60' -ForegroundColor Yellow
