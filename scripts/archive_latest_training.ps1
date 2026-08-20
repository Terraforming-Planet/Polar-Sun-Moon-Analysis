param(
    [string]$RunDir = '',
    [switch]$SkipCheckpoint
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

if (-not $RunDir) {
    $candidate = Get-ChildItem (Join-Path $repoRoot 'research_runs') -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName 'metrics.json') } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $candidate) {
        throw 'No training run containing metrics.json was found in research_runs.'
    }
    $RunDir = $candidate.FullName
}

$resolvedRun = (Resolve-Path $RunDir).Path
$runName = Split-Path $resolvedRun -Leaf
$metricsPath = Join-Path $resolvedRun 'metrics.json'
if (-not (Test-Path $metricsPath)) {
    throw "metrics.json is missing from $resolvedRun"
}

$metrics = Get-Content $metricsPath -Raw | ConvertFrom-Json
$training = if ($null -ne $metrics.PSObject.Properties['training']) { $metrics.training } else { $metrics }
$sourceManifestPath = Join-Path $resolvedRun 'source_manifest.json'
$sourceManifest = if (Test-Path $sourceManifestPath) {
    Get-Content $sourceManifestPath -Raw | ConvertFrom-Json
} else {
    $null
}

function Pick-Value {
    param(
        [object]$Primary,
        [string]$PrimaryName,
        [object]$Fallback,
        [string]$FallbackName
    )
    if ($null -ne $Primary -and $null -ne $Primary.PSObject.Properties[$PrimaryName]) {
        return $Primary.$PrimaryName
    }
    if ($null -ne $Fallback -and $null -ne $Fallback.PSObject.Properties[$FallbackName]) {
        return $Fallback.$FallbackName
    }
    return $null
}

$uniqueTrainingImages = Pick-Value $training 'unique_training_images' $sourceManifest 'train_image_count'
if ($null -eq $uniqueTrainingImages -and $null -ne $metrics.PSObject.Properties['dataset']) {
    $uniqueTrainingImages = $metrics.dataset.train_count
}
$uniqueValidationImages = Pick-Value $training 'unique_validation_images' $sourceManifest 'validation_count'
$uniqueTestImages = Pick-Value $training 'unique_test_images' $sourceManifest 'test_count'
$trainingMode = Pick-Value $training 'training_mode' $training 'mode'
$groundTruthClaim = Pick-Value $training 'ground_truth_claim' $metrics 'ground_truth_claim'
if ($null -eq $groundTruthClaim) {
    $groundTruthClaim = $false
}
$completed = Pick-Value $training 'completed' $metrics 'completed'
if ($null -eq $completed) {
    $completed = $true
}

$publicationDir = Join-Path $repoRoot "published\training-runs\$runName"
New-Item -ItemType Directory -Force -Path $publicationDir | Out-Null

$summary = [ordered]@{
    schema = 'tp26-training-publication-v2'
    run = $runName
    generated_utc = (Get-Date).ToUniversalTime().ToString('o')
    evidence_class = 'DERIVED_VALUE'
    scientific_finding_claim = $false
    ground_truth_claim = [bool]$groundTruthClaim
    completed = [bool]$completed
    training_mode = $trainingMode
    elapsed_seconds = $training.elapsed_seconds
    steps = $training.steps
    epochs = $training.epochs
    samples_seen = $training.samples_seen
    unique_training_images = $uniqueTrainingImages
    unique_validation_images = $uniqueValidationImages
    unique_test_images = $uniqueTestImages
    image_count = Pick-Value $training 'image_count' $sourceManifest 'train_image_count'
    loss_first = $training.loss_first
    loss_last = $training.loss_last
    loss_best = $training.loss_best
    validation_loss = Pick-Value $training 'validation_loss' $metrics 'validation_loss'
    note = 'Training metrics describe model optimization. They are not by themselves evidence of an environmental discovery or causal conclusion.'
}
$summaryPath = Join-Path $publicationDir 'summary.json'
$summary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $summaryPath

$validationLoss = Pick-Value $training 'validation_loss' $metrics 'validation_loss'
$elapsedSeconds = if ($null -ne $training.elapsed_seconds) {
    [Math]::Round([double]$training.elapsed_seconds, 2)
} else {
    ''
}
$summaryHtml = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>TP-26 training run $runName</title>
<style>
body{font-family:system-ui;background:#04101d;color:#dff7ff;margin:0;padding:32px;line-height:1.5}main{max-width:980px;margin:auto}.card{background:#081b2c;border:1px solid #1d526b;border-radius:16px;padding:20px;margin:16px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.metric{background:#061522;border-radius:12px;padding:14px}.metric b{display:block;font-size:1.35rem;color:#76e8ff}.warn{border-left:4px solid #ffd166;padding-left:14px}code{color:#9ef1ff}</style>
</head>
<body><main>
<h1>TP-26 training run: $runName</h1>
<p>Reproducible optimization report generated from the saved run metrics.</p>
<div class="grid">
<div class="metric"><span>Unique training images</span><b>$uniqueTrainingImages</b></div>
<div class="metric"><span>Validation images</span><b>$uniqueValidationImages</b></div>
<div class="metric"><span>Test images</span><b>$uniqueTestImages</b></div>
<div class="metric"><span>Steps</span><b>$($training.steps)</b></div>
<div class="metric"><span>Samples seen</span><b>$($training.samples_seen)</b></div>
<div class="metric"><span>Elapsed seconds</span><b>$elapsedSeconds</b></div>
</div>
<div class="card"><h2>Loss</h2><p>First: <code>$($training.loss_first)</code><br/>Last: <code>$($training.loss_last)</code><br/>Best: <code>$($training.loss_best)</code><br/>Validation: <code>$validationLoss</code></p></div>
<div class="card warn"><strong>Scientific integrity</strong><p>These values are DERIVED_VALUE training metrics. They show optimization behaviour only. They do not independently prove a water-loss cause, blocked river, hazard, or other environmental finding.</p></div>
</main></body></html>
"@
$summaryHtml | Set-Content -Encoding UTF8 (Join-Path $publicationDir 'index.html')

$archivePath = Join-Path (Split-Path $resolvedRun -Parent) "${runName}_FULL_LOGS.zip"
$items = Get-ChildItem $resolvedRun -File
if ($SkipCheckpoint) {
    $items = $items | Where-Object { $_.Extension -notin @('.pt', '.pth', '.ckpt') }
}
if (-not $items) {
    throw 'No files are available to archive.'
}
Compress-Archive -Path $items.FullName -DestinationPath $archivePath -Force
$hash = Get-FileHash $archivePath -Algorithm SHA256
$hashLine = "$($hash.Hash)  $([System.IO.Path]::GetFileName($archivePath))"
$hashPath = "$archivePath.sha256.txt"
$hashLine | Set-Content -Encoding ASCII $hashPath

Write-Host 'TRAINING RUN ARCHIVED.' -ForegroundColor Green
Write-Host "Run: $resolvedRun" -ForegroundColor Cyan
Write-Host "Archive: $archivePath" -ForegroundColor Cyan
Write-Host "SHA-256: $($hash.Hash)" -ForegroundColor Cyan
Write-Host "Publication files: $publicationDir" -ForegroundColor Cyan
Write-Host 'The ZIP stays local; publish the small HTML/JSON report, not a large checkpoint archive, unless a release asset is intentionally required.' -ForegroundColor Yellow
