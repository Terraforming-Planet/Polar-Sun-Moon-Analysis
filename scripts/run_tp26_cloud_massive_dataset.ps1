param(
    [int]$TargetImages = 500000,
    [int]$CatalogScenes = 500000,
    [int]$Grid = 8,
    [int]$Workers = 16,
    [double]$MaxDownloadGB = 0,
    [int]$ExtraPerAdapter = 10000,
    [int]$Resolution = 512
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$runRoot = Join-Path $repoRoot "research_runs\cloud_massive_$stamp"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$transcriptPath = Join-Path $runRoot 'console.log'
$manifestPath = Join-Path $runRoot 'run_manifest.json'
$catalogDir = Join-Path $runRoot 'landsat_catalog'

$effectiveMaxDownloadGB = $MaxDownloadGB
if ($effectiveMaxDownloadGB -le 0) {
    $rootPath = [System.IO.Path]::GetPathRoot($repoRoot)
    $drive = [System.IO.DriveInfo]::new($rootPath)
    $freeGB = $drive.AvailableFreeSpace / 1GB
    $effectiveMaxDownloadGB = [Math]::Max(10, [Math]::Floor($freeGB * 0.70))
}

$runManifest = [ordered]@{
    schema = 'tp26-cloud-massive-dataset-v1'
    started_utc = (Get-Date).ToUniversalTime().ToString('o')
    target_downloaded_images = $TargetImages
    target_catalog_scenes = $CatalogScenes
    grid = $Grid
    workers = $Workers
    resolution = $Resolution
    extra_per_adapter = $ExtraPerAdapter
    max_download_gb = $effectiveMaxDownloadGB
    note = 'Catalog scene counts are metadata screening. Downloaded imagery counts are SHA-256 deduplicated pixel files/windows. They must never be conflated.'
}
$runManifest | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $manifestPath

Start-Transcript -Path $transcriptPath -Force | Out-Null
try {
    Write-Host '=== TP-26 CLOUD MASSIVE DATASET / CPU + NETWORK ===' -ForegroundColor Cyan
    Write-Host "Catalog screening target: $CatalogScenes unique Landsat scene IDs" -ForegroundColor Cyan
    Write-Host "Downloaded pixel target: $TargetImages unique SHA-256 imagery files/windows" -ForegroundColor Cyan
    Write-Host "Grid: ${Grid}x${Grid}; workers: $Workers; resolution: ${Resolution}px" -ForegroundColor Cyan
    Write-Host "Download budget: $effectiveMaxDownloadGB GB (70% of free disk when -MaxDownloadGB is 0)" -ForegroundColor Cyan
    Write-Host 'The paid NVIDIA L4 is not required for this stage. It can keep training in parallel.' -ForegroundColor Green
    Write-Host "Full console transcript: $transcriptPath" -ForegroundColor Green

    $probeWorkers = [Math]::Min([Math]::Max($Workers, 1), 6)
    python -m terra_research_node.adapter_preflight --workers $probeWorkers
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'Adapter preflight reported a transport problem; continuing with resilient sources.'
    }

    python -m terra_research_node.global_scene_scan `
        --target-scenes $CatalogScenes `
        --start-year 1990 `
        --end-year 2026 `
        --page-size 1000 `
        --output-dir $catalogDir
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'Large Landsat metadata screening failed or was interrupted; image harvesting will continue.'
    }

    python -m terra_research_node.public_adapter_harvest --max-per-adapter $ExtraPerAdapter
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'One or more additional public adapters failed; continuing with the global core harvest.'
    }

    & "$PSScriptRoot\build_global_public_dataset.ps1" `
        -TargetImages $TargetImages `
        -Grid $Grid `
        -Workers $Workers `
        -MaxDownloadGB $effectiveMaxDownloadGB `
        -Resolution $Resolution

    if ($LASTEXITCODE -ne 0) {
        throw "TP-26 global dataset build failed with exit code $LASTEXITCODE."
    }

    $runManifest.completed_utc = (Get-Date).ToUniversalTime().ToString('o')
    $runManifest.status = 'completed'
    $runManifest | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $manifestPath

    Write-Host 'TP-26 MASSIVE DATASET STAGE COMPLETE.' -ForegroundColor Green
    Write-Host 'Keep this run directory. It contains the transcript and Landsat catalog screening logs.' -ForegroundColor Green
    Write-Host 'The canonical downloaded-image manifest is research_cache\global_public_dataset\records.jsonl.' -ForegroundColor Green
} catch {
    $runManifest.completed_utc = (Get-Date).ToUniversalTime().ToString('o')
    $runManifest.status = 'failed'
    $runManifest.error = $_.Exception.Message
    $runManifest | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $manifestPath
    throw
} finally {
    Stop-Transcript | Out-Null
}
