param(
    [string]$RunDir = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

$currentBranch = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or -not $currentBranch) {
    throw 'Unable to determine the current Git branch.'
}
if ($currentBranch -ne 'main') {
    throw "Publish from main. Current branch: $currentBranch"
}
if (-not (git diff --cached --quiet)) {
    throw 'There are already staged Git changes. Commit or unstage them before publishing a training run.'
}

git pull --ff-only
if ($LASTEXITCODE -ne 0) {
    throw 'git pull --ff-only failed.'
}

if (-not $RunDir) {
    $candidate = Get-ChildItem (Join-Path $repoRoot 'research_runs') -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName 'metrics.json') } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $candidate) {
        throw 'No completed training run containing metrics.json was found.'
    }
    $RunDir = $candidate.FullName
}

$resolvedRun = (Resolve-Path $RunDir).Path
$runName = Split-Path $resolvedRun -Leaf

& "$PSScriptRoot\archive_latest_training.ps1" -RunDir $resolvedRun -SkipCheckpoint
if ($LASTEXITCODE -ne 0) {
    throw "Training archive helper failed with exit code $LASTEXITCODE."
}

$sourceReport = Join-Path $repoRoot "published\training-runs\$runName"
$repoReport = $sourceReport
$docsReport = Join-Path $repoRoot "docs\published\training-runs\$runName"
$docsLatest = Join-Path $repoRoot 'docs\published\training-runs\latest'
New-Item -ItemType Directory -Force -Path $docsReport | Out-Null
New-Item -ItemType Directory -Force -Path $docsLatest | Out-Null

$publicLogExtensions = @('.json', '.jsonl', '.txt', '.log', '.csv', '.md')
$copiedFiles = New-Object System.Collections.Generic.List[object]
$omittedFiles = New-Object System.Collections.Generic.List[object]
$maxPublicFileBytes = 90MB

Get-ChildItem $resolvedRun -File | ForEach-Object {
    $file = $_
    if ($file.Extension.ToLowerInvariant() -notin $publicLogExtensions) {
        return
    }
    if ($file.Length -gt $maxPublicFileBytes) {
        $omittedFiles.Add([ordered]@{
            name = $file.Name
            bytes = $file.Length
            reason = 'File exceeds 90 MB GitHub-safe publication limit; retained in local FULL_LOGS ZIP.'
        })
        return
    }
    Copy-Item $file.FullName (Join-Path $repoReport $file.Name) -Force
    $copiedFiles.Add([ordered]@{
        name = $file.Name
        bytes = $file.Length
        sha256 = (Get-FileHash $file.FullName -Algorithm SHA256).Hash
    })
}

Copy-Item (Join-Path $repoReport '*') $docsReport -Force
Copy-Item (Join-Path $repoReport '*') $docsLatest -Force

$archivePath = Join-Path (Split-Path $resolvedRun -Parent) "${runName}_FULL_LOGS.zip"
$archiveHashPath = "$archivePath.sha256.txt"
$archiveSha256 = ''
$archiveBytes = 0
if (Test-Path $archivePath) {
    $archiveBytes = (Get-Item $archivePath).Length
    $archiveSha256 = (Get-FileHash $archivePath -Algorithm SHA256).Hash
}

$filesManifest = [ordered]@{
    schema = 'tp26-training-log-publication-v1'
    run = $runName
    generated_utc = (Get-Date).ToUniversalTime().ToString('o')
    published_text_logs = $copiedFiles
    omitted_from_git = $omittedFiles
    local_full_logs_zip = [ordered]@{
        path = $archivePath
        bytes = $archiveBytes
        sha256 = $archiveSha256
        hash_file = $archiveHashPath
        committed_to_git = $false
    }
    checkpoint_committed_to_git = $false
    scientific_finding_claim = $false
    note = 'Public text logs preserve reproducibility. Large checkpoints and the local ZIP are intentionally not committed to Git.'
}
$filesManifest | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 (Join-Path $repoReport 'files.json')
Copy-Item (Join-Path $repoReport 'files.json') (Join-Path $docsReport 'files.json') -Force
Copy-Item (Join-Path $repoReport 'files.json') (Join-Path $docsLatest 'files.json') -Force

$latestPointer = [ordered]@{
    run = $runName
    generated_utc = (Get-Date).ToUniversalTime().ToString('o')
    report = "../$runName/"
}
$latestPointer | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $docsLatest 'latest.json')

$pathsToAdd = @(
    "published/training-runs/$runName",
    "docs/published/training-runs/$runName",
    'docs/published/training-runs/latest'
)
git add -- $pathsToAdd
if ($LASTEXITCODE -ne 0) {
    throw 'git add failed.'
}

if (git diff --cached --quiet) {
    Write-Host 'Training run is already published; there are no new Git changes.' -ForegroundColor Yellow
} else {
    git commit -m "Publish TP-26 training run $runName"
    if ($LASTEXITCODE -ne 0) {
        throw 'git commit failed.'
    }
    git push origin main
    if ($LASTEXITCODE -ne 0) {
        throw 'git push failed.'
    }
}

Write-Host 'TRAINING RUN PUBLISHED TO GITHUB.' -ForegroundColor Green
Write-Host "Run: $runName" -ForegroundColor Cyan
Write-Host "Local full logs ZIP: $archivePath" -ForegroundColor Cyan
Write-Host "Site report: https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/published/training-runs/$runName/" -ForegroundColor Cyan
Write-Host 'Stable latest report: https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/published/training-runs/latest/' -ForegroundColor Cyan
