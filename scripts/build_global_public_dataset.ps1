param(
    [int]$TargetImages = 500000,
    [int]$Grid = 8,
    [int]$Workers = 16,
    [double]$MaxDownloadGB = 120,
    [int]$Resolution = 512
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

$venvPython = Join-Path $repoRoot '.venv-l4\Scripts\python.exe'
if (Test-Path $venvPython) {
    $pythonExe = $venvPython
} else {
    $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
    if (-not $pythonCommand -or $pythonCommand.Source -like '*WindowsApps*') {
        throw 'A real Python interpreter was not found. Expected .venv-l4\Scripts\python.exe or python.exe outside WindowsApps.'
    }
    $pythonExe = $pythonCommand.Source
}

Write-Host '=== GLOBAL PUBLIC SATELLITE DATASET / CPU + NETWORK ONLY ===' -ForegroundColor Cyan
Write-Host "Python: $pythonExe" -ForegroundColor Green
& $pythonExe -V
Write-Host "Target unique downloaded images/windows: $TargetImages" -ForegroundColor Cyan
Write-Host "Download budget: $MaxDownloadGB GB" -ForegroundColor Cyan
Write-Host "Grid: ${Grid}x${Grid}; workers: $Workers; resolution: ${Resolution}px" -ForegroundColor Cyan
Write-Host 'Sources: NASA GIBS, USGS Landsat Collection 2, ESA/Copernicus CDSE.' -ForegroundColor Cyan
Write-Host 'The paid NVIDIA L4 is NOT required for this stage.' -ForegroundColor Green

& $pythonExe -m terra_research_node.historical_public_seed --start-year 1990 --end-year 1999 --max-images 5000
if ($LASTEXITCODE -ne 0) {
    Write-Warning 'Historical USGS seed failed; continuing with other official public sources.'
}

& $pythonExe -m terra_research_node.global_public_dataset `
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
