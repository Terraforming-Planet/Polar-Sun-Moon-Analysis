param(
    [int]$TargetImages = 100000,
    [int]$Grid = 4,
    [int]$Workers = 8,
    [double]$MaxDownloadGB = 30,
    [int]$Resolution = 512
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

Write-Host '=== GLOBAL PUBLIC SATELLITE DATASET / CPU + NETWORK ONLY ===' -ForegroundColor Cyan
Write-Host "Target unique downloaded images/windows: $TargetImages" -ForegroundColor Cyan
Write-Host 'The paid NVIDIA L4 is NOT required for this stage.' -ForegroundColor Green

python -m terra_research_node.historical_public_seed --start-year 1990 --end-year 1999 --max-images 2500
if ($LASTEXITCODE -ne 0) {
    Write-Warning 'Historical USGS seed failed; continuing with other official public sources.'
}

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

Write-Host 'DATASET READY. Turn on/attach the L4 only for the training stage.' -ForegroundColor Green
