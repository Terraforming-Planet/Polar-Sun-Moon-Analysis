param(
    [string]$RunDir = 'research_runs\training004_gpu_ssl_one_hour',
    [switch]$NoPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot
$resolvedRun = (Resolve-Path (Join-Path $repoRoot $RunDir)).Path
$summaryPath = Join-Path $resolvedRun 'summary.json'
$checkpointPath = Join-Path $resolvedRun 'checkpoints\latest.pt'

if (-not (Test-Path $summaryPath)) { throw "Missing summary.json: $summaryPath" }
if (-not (Test-Path $checkpointPath)) { throw "Missing checkpoint: $checkpointPath" }

$summary = Get-Content $summaryPath -Raw | ConvertFrom-Json
if ($summary.status -ne 'COMPLETE') {
    throw "Refusing publication because status is '$($summary.status)', expected COMPLETE."
}
if ($null -ne $summary.blocker) {
    throw "Refusing publication because blocker is not null: $($summary.blocker)"
}

$checkpointHash = (Get-FileHash $checkpointPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($summary.checkpoint_sha256 -and $checkpointHash -ne ([string]$summary.checkpoint_sha256).ToLowerInvariant()) {
    throw 'Checkpoint SHA-256 does not match summary.json.'
}

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$archiveDir = Join-Path $repoRoot 'research_runs\archives'
New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null
$zipPath = Join-Path $archiveDir "training004-gpu-$stamp-FULL-ARTIFACTS.zip"
Compress-Archive -Path (Join-Path $resolvedRun '*') -DestinationPath $zipPath -Force
$zipHash = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
"$zipHash  $([IO.Path]::GetFileName($zipPath))" | Set-Content -Encoding ASCII "$zipPath.sha256.txt"

$publicationDirs = @(
    (Join-Path $repoRoot 'docs\research\training-004'),
    (Join-Path $repoRoot 'web\public\research\training-004')
)

$publicSummary = [ordered]@{
    schema = 'terra-training-004-public-evidence-v1'
    generated_utc = (Get-Date).ToUniversalTime().ToString('o')
    status = $summary.status
    blocker = $summary.blocker
    objective = $summary.objective
    scope = $summary.scope
    unique_real_scientific_pairs = $summary.unique_real_scientific_pairs
    source_shape_counts = $summary.source_shape_counts
    canvas_size = $summary.canvas_size
    mask_ratio = $summary.mask_ratio
    training_exposures = $summary.training_exposures
    equivalent_epochs = $summary.equivalent_epochs
    validation_pairs = $summary.validation_pairs
    steps = $summary.steps
    elapsed_seconds = $summary.elapsed_seconds
    device = $summary.device
    gpu_name = $summary.gpu_name
    gpu_peak_vram_mib = $summary.gpu_peak_vram_mib
    requested_batch_size = $summary.requested_batch_size
    effective_batch_size = $summary.effective_batch_size
    mixed_precision = $summary.mixed_precision
    loss_min = $summary.loss_min
    loss_last = $summary.loss_last
    reconstruction_loss_last = $summary.reconstruction_loss_last
    validation_loss_last = $summary.validation_loss_last
    checkpoint_sha256 = $checkpointHash
    generated_satellite_pixels = $summary.generated_satellite_pixels
    environmental_ground_truth = $summary.environmental_ground_truth
    test001_leakage = $summary.test001_leakage
    benchmark_leakage = $summary.benchmark_leakage
    mission_leakage = $summary.mission_leakage
    provenance_records = $summary.provenance_records
    note = 'Training exposures are repeated augmented optimization exposures over real scientific pairs; they are not independent satellite observations.'
}

$elapsedMinutes = [Math]::Round(([double]$summary.elapsed_seconds / 60.0), 1)
$peakVram = [Math]::Round([double]$summary.gpu_peak_vram_mib, 1)
$html = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="theme-color" content="#031019" />
<title>Training #4 — Terra Observation System</title>
<style>
:root{font-family:Inter,system-ui,sans-serif;color:#ecf8ff;background:#020812;--muted:#9eb4c7;--cyan:#45dcff;--green:#68f0ad;--line:rgba(132,203,235,.18)}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,rgba(26,112,150,.24),transparent 32%),#020812;line-height:1.6}.wrap{max-width:1120px;margin:auto;padding:42px 20px 80px}a{color:var(--cyan)}.eyebrow{color:var(--cyan);font-size:12px;font-weight:900;letter-spacing:.16em}.hero{padding:30px 0}.hero h1{font-size:clamp(38px,7vw,76px);line-height:1;margin:10px 0 18px}.hero p{max-width:920px;color:#c7dbe8;font-size:18px}.ok{color:var(--green)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:24px 0}.card{border:1px solid var(--line);background:#071522;border-radius:14px;padding:18px}.card b{display:block;color:#7bedbc;font-size:28px;line-height:1.2;margin-top:6px}.card span{color:var(--muted);font-size:12px}.panel{border:1px solid var(--line);background:#071522;border-radius:16px;padding:22px;margin-top:18px}.panel p,.panel li{color:var(--muted)}code{color:#a6ecff;word-break:break-all}.warn{border-left:4px solid #ffd166}.back{display:inline-block;margin-bottom:20px;text-decoration:none}</style>
</head>
<body><main class="wrap">
<a class="back" href="../">← Research / About</a>
<section class="hero">
<div class="eyebrow">TERRA OBSERVATION SYSTEM · TRAINING EVIDENCE</div>
<h1>Training #4 <span class="ok">COMPLETE</span></h1>
<p>Masked spectral-temporal Earth-observation training on real cached Landsat scientific pairs using an NVIDIA L4 GPU. The model receives eight channels: four surface-reflectance bands before and four after the observation period.</p>
</section>
<div class="grid">
<div class="card"><span>Real scientific pairs</span><b>$($summary.unique_real_scientific_pairs)</b></div>
<div class="card"><span>Training exposures</span><b>$($summary.training_exposures)</b></div>
<div class="card"><span>Optimization steps</span><b>$($summary.steps)</b></div>
<div class="card"><span>Runtime</span><b>$elapsedMinutes min</b></div>
<div class="card"><span>GPU</span><b>$($summary.gpu_name)</b></div>
<div class="card"><span>Peak VRAM</span><b>$peakVram MiB</b></div>
<div class="card"><span>Loss min</span><b>$($summary.loss_min)</b></div>
<div class="card"><span>Validation loss</span><b>$($summary.validation_loss_last)</b></div>
</div>
<section class="panel"><h2>Training objective</h2><p>$($summary.objective)</p><p>Source shapes are normalized to a common $($summary.canvas_size) px scientific AOI tensor. Mixed precision: <strong>$($summary.mixed_precision)</strong>. Effective batch: <strong>$($summary.effective_batch_size)</strong>.</p></section>
<section class="panel"><h2>Scientific provenance</h2><ul><li>Generated satellite pixels: <strong>$($summary.generated_satellite_pixels)</strong></li><li>Environmental ground-truth claim: <strong>$($summary.environmental_ground_truth)</strong></li><li>TEST001 leakage: <strong>$($summary.test001_leakage)</strong></li><li>Benchmark leakage: <strong>$($summary.benchmark_leakage)</strong></li><li>Mission leakage: <strong>$($summary.mission_leakage)</strong></li><li>Provenance records: <strong>$($summary.provenance_records)</strong></li></ul></section>
<section class="panel warn"><h2>Interpretation</h2><p><strong>$($summary.training_exposures)</strong> training exposures are optimization exposures over <strong>$($summary.unique_real_scientific_pairs)</strong> real scientific temporal pairs. They must not be presented as the same number of independent satellite observations. Training metrics demonstrate optimization behaviour; they do not by themselves establish a causal environmental finding.</p></section>
<section class="panel"><h2>Checkpoint integrity</h2><p>SHA-256:</p><code>$checkpointHash</code><p>The model checkpoint and full local artifact ZIP are intentionally not committed to GitHub Pages. The public report contains reproducible metadata and integrity hashes without bloating the repository.</p><p><a href="summary.json">Public machine-readable summary.json</a></p></section>
</main></body></html>
"@

foreach ($dir in $publicationDirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $publicSummary | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 (Join-Path $dir 'summary.json')
    "$checkpointHash  latest.pt" | Set-Content -Encoding ASCII (Join-Path $dir 'checkpoint.sha256.txt')
    $html | Set-Content -Encoding UTF8 (Join-Path $dir 'index.html')
}

$linkBlock = @"
<!-- TRAINING004_PUBLIC_LINK_START -->
<section class="section" id="training-004-evidence">
  <div class="eyebrow">RESEARCH EVIDENCE</div>
  <h2>Training #4 — real Landsat spectral-temporal GPU training</h2>
  <p class="section-intro">A reproducible public report from the completed NVIDIA L4 run, including optimization metrics, scientific provenance, validation metrics and checkpoint integrity hash.</p>
  <div class="links"><a class="btn primary" href="training-004/">Open Training #4 evidence →</a></div>
</section>
<!-- TRAINING004_PUBLIC_LINK_END -->
"@

foreach ($researchIndex in @(
    (Join-Path $repoRoot 'docs\research\index.html'),
    (Join-Path $repoRoot 'web\public\research\index.html')
)) {
    $text = Get-Content $researchIndex -Raw
    $pattern = '(?s)<!-- TRAINING004_PUBLIC_LINK_START -->.*?<!-- TRAINING004_PUBLIC_LINK_END -->'
    if ($text -match $pattern) {
        $text = [regex]::Replace($text, $pattern, $linkBlock)
    } elseif ($text.Contains('</main>')) {
        $text = $text.Replace('</main>', "$linkBlock`r`n</main>")
    } else {
        throw "Could not locate </main> in $researchIndex"
    }
    Set-Content -Encoding UTF8 $researchIndex $text
}

git add docs/research/index.html docs/research/training-004 web/public/research/index.html web/public/research/training-004
if (-not (git diff --cached --quiet)) {
    git commit -m 'research: publish Training 004 NVIDIA L4 evidence'
}

Write-Host 'TRAINING #4 EVIDENCE PREPARED.' -ForegroundColor Green
Write-Host "Local full artifact ZIP: $zipPath" -ForegroundColor Cyan
Write-Host "ZIP SHA-256: $zipHash" -ForegroundColor Cyan
Write-Host "Public page: docs\research\training-004\index.html" -ForegroundColor Cyan
Write-Host "Checkpoint SHA-256: $checkpointHash" -ForegroundColor Cyan

if (-not $NoPush) {
    git push origin HEAD
    if ($LASTEXITCODE -ne 0) { throw 'git push failed.' }
    Write-Host 'Branch pushed. Merge this branch to main to publish through GitHub Pages.' -ForegroundColor Green
}
