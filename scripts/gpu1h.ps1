param(
    [ValidateRange(1, 1440)][int]$Minutes = 60,
    [ValidateRange(8, 512)][int]$BatchSize = 128,
    [ValidateRange(2, 4096)][int]$MaxPairs = 256
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot
$python = Join-Path $repoRoot '.venv-l4\Scripts\python.exe'
if (-not (Test-Path $python)) {
    throw "Missing CUDA Python environment: $python"
}

$cacheDir = Join-Path $repoRoot 'research_runs\raster-block-cache'
$outputDir = Join-Path $repoRoot 'research_runs\training004_gpu_ssl_one_hour'
$runTag = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$evidenceDir = Join-Path $outputDir "evidence-$runTag"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

$rawLog = Join-Path $evidenceDir 'FULL-CONSOLE.log'
$transcriptLog = Join-Path $evidenceDir 'POWERSHELL-TRANSCRIPT.log'
$gitCommitFile = Join-Path $evidenceDir 'git-commit.txt'
$dependenciesFile = Join-Path $evidenceDir 'python-packages.txt'
$nvidiaBeforeFile = Join-Path $evidenceDir 'nvidia-smi-before.txt'
$nvidiaAfterFile = Join-Path $evidenceDir 'nvidia-smi-after.txt'
$cudaPreflightFile = Join-Path $evidenceDir 'cuda-preflight.txt'
$metricsExtractFile = Join-Path $evidenceDir 'training-metrics-extract.txt'
$exitCodeFile = Join-Path $evidenceDir 'exit-code.txt'
$manifestFile = Join-Path $evidenceDir 'evidence-manifest.json'
$hashesFile = Join-Path $evidenceDir 'SHA256SUMS.txt'

# Parameter-Golf-style evidence discipline: logging exists before any training starts.
Start-Transcript -Path $transcriptLog -Force | Out-Null
$runnerExit = 99
$startedUtc = (Get-Date).ToUniversalTime().ToString('o')

try {
    Write-Host "RUN_TAG=$runTag" -ForegroundColor Yellow
    Write-Host "STARTED_UTC=$startedUtc" -ForegroundColor Yellow
    Write-Host "EVIDENCE_DIR=$evidenceDir" -ForegroundColor Yellow
    Write-Host "FULL_CONSOLE_LOG=$rawLog" -ForegroundColor Yellow

    git rev-parse HEAD 2>&1 | Tee-Object -FilePath $gitCommitFile
    if ($LASTEXITCODE -ne 0) { throw 'git rev-parse HEAD failed.' }

    & nvidia-smi 2>&1 | Tee-Object -FilePath $nvidiaBeforeFile
    if ($LASTEXITCODE -ne 0) { throw 'nvidia-smi preflight failed.' }

    & $python -m pip freeze 2>&1 | Set-Content -Encoding UTF8 $dependenciesFile
    if ($LASTEXITCODE -ne 0) { throw 'pip freeze failed.' }

    & $python -c "import torch; print('CUDA_AVAILABLE=', torch.cuda.is_available()); print('GPU=', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE'); print('TORCH=', torch.__version__); print('CUDA_RUNTIME=', torch.version.cuda)" 2>&1 | Tee-Object -FilePath $cudaPreflightFile
    if ($LASTEXITCODE -ne 0) { throw 'CUDA preflight failed.' }

    $cudaText = Get-Content $cudaPreflightFile -Raw
    if ($cudaText -notmatch 'CUDA_AVAILABLE=\s*True') {
        throw 'CUDA preflight did not confirm CUDA_AVAILABLE=True.'
    }

    Write-Host 'TERRA TRAINING #4 - MASKED SPECTRAL-TEMPORAL CUDA' -ForegroundColor Green
    Write-Host "Minutes=$Minutes | requested batch=$BatchSize | real cache limit=$MaxPairs" -ForegroundColor Cyan
    Write-Host 'Mixed 256/512 caches normalize to one 256 px scientific AOI tensor.' -ForegroundColor Cyan

    & $python scripts\run_training004_cached_gpu_l4.py `
        --cache-dir $cacheDir `
        --output-dir $outputDir `
        --minutes $Minutes `
        --batch-size $BatchSize `
        --max-pairs $MaxPairs `
        --canvas-size 256 `
        --mask-ratio 0.40 `
        --device cuda 2>&1 | Tee-Object -FilePath $rawLog

    $runnerExit = $LASTEXITCODE
    Set-Content -Encoding ASCII $exitCodeFile ([string]$runnerExit)

    if (-not (Test-Path $rawLog) -or (Get-Item $rawLog).Length -eq 0) {
        throw 'Evidence failure: FULL-CONSOLE.log is missing or empty.'
    }

    $metricLines = Select-String -Path $rawLog -Pattern 'CACHED_SSL_CUDA_START|CUDA_BATCH_AUTOTUNE|GPU_SSL_TRAINING|"status"' | ForEach-Object { $_.Line }
    $metricLines | Set-Content -Encoding UTF8 $metricsExtractFile

    if ($runnerExit -eq 0 -and -not (Select-String -Path $rawLog -Pattern 'GPU_SSL_TRAINING step=' -Quiet)) {
        throw 'Evidence failure: successful run has no GPU_SSL_TRAINING records in FULL-CONSOLE.log.'
    }

    if ($runnerExit -ne 0) {
        throw "Masked CUDA training failed with exit code $runnerExit"
    }

    Write-Host "SUMMARY=$outputDir\summary.json" -ForegroundColor Green
    Write-Host "CHECKPOINT=$outputDir\checkpoints\latest.pt" -ForegroundColor Green
}
finally {
    try {
        & nvidia-smi 2>&1 | Set-Content -Encoding UTF8 $nvidiaAfterFile
    } catch {
        "nvidia-smi final capture failed: $($_.Exception.Message)" | Set-Content -Encoding UTF8 $nvidiaAfterFile
    }

    $endedUtc = (Get-Date).ToUniversalTime().ToString('o')
    $summaryPath = Join-Path $outputDir 'summary.json'
    $checkpointPath = Join-Path $outputDir 'checkpoints\latest.pt'

    $manifest = [ordered]@{
        schema = 'terra-training-evidence-package-v1'
        run_tag = $runTag
        started_utc = $startedUtc
        ended_utc = $endedUtc
        requested_minutes = $Minutes
        requested_batch_size = $BatchSize
        max_pairs = $MaxPairs
        runner_exit_code = $runnerExit
        git_commit = if (Test-Path $gitCommitFile) { (Get-Content $gitCommitFile -Raw).Trim() } else { $null }
        full_console_log = 'FULL-CONSOLE.log'
        powershell_transcript = 'POWERSHELL-TRANSCRIPT.log'
        cuda_preflight = 'cuda-preflight.txt'
        nvidia_before = 'nvidia-smi-before.txt'
        nvidia_after = 'nvidia-smi-after.txt'
        dependencies = 'python-packages.txt'
        metrics_extract = 'training-metrics-extract.txt'
        summary_present = Test-Path $summaryPath
        checkpoint_present = Test-Path $checkpointPath
        checkpoint_sha256 = if (Test-Path $checkpointPath) { (Get-FileHash $checkpointPath -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }
    }
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $manifestFile

    try { Stop-Transcript | Out-Null } catch { }

    $hashTargets = Get-ChildItem $evidenceDir -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' }
    $hashLines = foreach ($file in $hashTargets) {
        $hash = (Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $($file.Name)"
    }
    $hashLines | Set-Content -Encoding ASCII $hashesFile

    Write-Host "EVIDENCE_COMPLETE=$evidenceDir" -ForegroundColor Green
    Write-Host "FULL_LOG=$rawLog" -ForegroundColor Green
    Write-Host "HASHES=$hashesFile" -ForegroundColor Green
}

exit $runnerExit
