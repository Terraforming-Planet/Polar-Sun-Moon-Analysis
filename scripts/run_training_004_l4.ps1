param(
    [int]$SmokeWindows = 20000,
    [int]$TargetWindows = 500000,
    [double]$SmokeMinutes = 10,
    [int]$Workers = 32,
    [int]$Resolution = 512,
    [int]$BatchSize = 24,
    [double]$SafetyFactor = 1.25,
    [double]$MaxFullMinutes = 360,
    [switch]$Publish
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

$expectedBranch = 'agent/eve-terra-l4-comparative-benchmark'
$currentBranch = (git branch --show-current).Trim()
if ($currentBranch -ne $expectedBranch) {
    throw "Training #4A must run from $expectedBranch, current branch is $currentBranch."
}
if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
    throw 'nvidia-smi was not found. NVIDIA L4 is not visible.'
}

$python = Join-Path $repoRoot '.venv-l4\Scripts\python.exe'
if (-not (Test-Path $python)) {
    throw "CUDA Python environment not found: $python"
}

$gpuName = (nvidia-smi --query-gpu=name --format=csv,noheader | Select-Object -First 1).Trim()
if ($gpuName -notmatch 'NVIDIA L4|\bL4\b') {
    throw "Expected NVIDIA L4, detected: $gpuName"
}

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$controlDir = Join-Path $repoRoot "research_runs\training004_control_$stamp"
New-Item -ItemType Directory -Force -Path $controlDir | Out-Null
$consoleLog = Join-Path $controlDir 'console.log'
$gpuLog = Join-Path $controlDir 'gpu_telemetry.csv'
$statusPath = Join-Path $controlDir 'agentic_status.json'
$manifestPath = Join-Path $controlDir 'orchestrator_manifest.json'

$manifest = [ordered]@{
    schema = 'terra-training-004a-l4-orchestrator-v1'
    started_utc = (Get-Date).ToUniversalTime().ToString('o')
    git_sha = (git rev-parse HEAD).Trim()
    git_branch = $currentBranch
    execution_scope = 'Training #4A high-volume NASA GIBS streaming baseline with public evidence publication. This is not yet the complete multi-source MCP/EVE Training #4.'
    smoke_windows = $SmokeWindows
    target_windows = $TargetWindows
    workers = $Workers
    resolution = $Resolution
    batch_size = $BatchSize
    scientific_finding_claim = $false
    environmental_ground_truth_claim = $false
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $manifestPath

$telemetryJob = Start-Job -ArgumentList $gpuLog -ScriptBlock {
    param($Path)
    'timestamp,gpu_name,gpu_util_pct,mem_util_pct,mem_used_mb,mem_total_mb,power_w,temp_c' |
        Set-Content -Encoding UTF8 $Path
    while ($true) {
        $line = & nvidia-smi `
            --query-gpu=timestamp,name,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,temperature.gpu `
            --format=csv,noheader,nounits 2>$null | Select-Object -First 1
        if ($line) { Add-Content -Encoding UTF8 $Path $line }
        Start-Sleep -Seconds 2
    }
}

function Get-LatestStreamRun {
    Get-ChildItem (Join-Path $repoRoot 'research_runs') -Directory -Filter 'stream_gibs_*' |
        Where-Object { Test-Path (Join-Path $_.FullName 'metrics.json') } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
}

function Redact-Log {
    param([string]$InputPath, [string]$OutputPath)
    $text = Get-Content $InputPath -Raw -ErrorAction Stop
    $text = $text -replace '(?i)(Authorization\s*:\s*Bearer\s+)\S+', '$1[REDACTED]'
    $text = $text -replace '(?i)\b(OPENAI_API_KEY|HF_TOKEN|HUGGINGFACE_HUB_TOKEN|CDSE_CLIENT_SECRET)\b\s*[:=]\s*\S+', '$1=[REDACTED]'
    $text = $text -replace '(?i)([?&](?:token|api_key|access_token)=)[^&\s]+', '$1[REDACTED]'
    Set-Content -Encoding UTF8 $OutputPath $text
}

Start-Transcript -Path $consoleLog -Force | Out-Null
try {
    Write-Host '=== TERRA TRAINING #4A / NVIDIA L4 ===' -ForegroundColor Cyan
    Write-Host 'Purpose: calibrate and execute a real 500k-class high-volume streaming baseline.' -ForegroundColor Green
    Write-Host 'This launcher intentionally does NOT claim the full multi-source MCP/EVE Training #4 is complete.' -ForegroundColor Yellow

    nvidia-smi --query-gpu=name,driver_version,memory.total,power.limit --format=csv,noheader
    & $python -c "import torch; assert torch.cuda.is_available(); print(torch.__version__); print(torch.version.cuda); print(torch.cuda.get_device_name(0))"
    if ($LASTEXITCODE -ne 0) { throw 'PyTorch CUDA preflight failed.' }

    Write-Host "SMOKE: $SmokeWindows windows / up to $SmokeMinutes minutes" -ForegroundColor Cyan
    & "$PSScriptRoot\run_streaming_gibs_l4.ps1" `
        -DurationMinutes $SmokeMinutes `
        -TargetRemoteWindows $SmokeWindows `
        -Workers $Workers `
        -Resolution $Resolution `
        -BatchSize $BatchSize
    if ($LASTEXITCODE -ne 0) { throw 'Training #4A smoke stage failed.' }

    $smokeRun = Get-LatestStreamRun
    if (-not $smokeRun) { throw 'Smoke run did not produce metrics.json.' }
    $smokeMetrics = Get-Content (Join-Path $smokeRun.FullName 'metrics.json') -Raw | ConvertFrom-Json
    $smokeTrained = [double]$smokeMetrics.remote_unique_windows_trained
    $smokeElapsed = [double]$smokeMetrics.elapsed_seconds
    if ($smokeTrained -lt 1 -or $smokeElapsed -le 0) {
        throw 'Smoke run produced no usable trained windows.'
    }
    $smokeRate = $smokeTrained / $smokeElapsed
    $smokeFailureRate = 100.0 * [double]$smokeMetrics.failures / [Math]::Max(1.0, $smokeTrained + [double]$smokeMetrics.failures)
    Write-Host ("Smoke throughput: {0:N2} windows/s; failure rate: {1:N4}%" -f $smokeRate, $smokeFailureRate) -ForegroundColor Green

    if ($smokeFailureRate -gt 0.5) {
        throw ("Smoke gate failed: transport failure rate {0:N4}% exceeds 0.5%." -f $smokeFailureRate)
    }

    $estimatedMinutes = [Math]::Ceiling(($TargetWindows / $smokeRate / 60.0) * $SafetyFactor)
    $fullMinutes = [Math]::Min($MaxFullMinutes, [Math]::Max(30.0, $estimatedMinutes))
    Write-Host ("FULL: target {0:N0} windows; adaptive wall-clock budget {1:N0} minutes" -f $TargetWindows, $fullMinutes) -ForegroundColor Cyan

    & "$PSScriptRoot\run_streaming_gibs_l4.ps1" `
        -DurationMinutes $fullMinutes `
        -TargetRemoteWindows $TargetWindows `
        -Workers $Workers `
        -Resolution $Resolution `
        -BatchSize $BatchSize
    if ($LASTEXITCODE -ne 0) { throw 'Training #4A full stage failed.' }

    $fullRun = Get-LatestStreamRun
    if (-not $fullRun) { throw 'Full run did not produce metrics.json.' }
    $fullMetricsPath = Join-Path $fullRun.FullName 'metrics.json'
    $fullMetrics = Get-Content $fullMetricsPath -Raw | ConvertFrom-Json

    $comparisonRunner = Join-Path $repoRoot 'scripts\run_eve_terra_comparison.py'
    $agenticStatus = if (Test-Path $comparisonRunner) {
        [ordered]@{
            status = 'NOT_RUN_BY_004A'
            reason = 'Comparator exists, but this baseline launcher does not silently execute or relabel an ESA/EVE comparison. Use the dedicated parity-harness runner after its own gates pass.'
        }
    } else {
        [ordered]@{
            status = 'BLOCKED_RUNNER_NOT_IMPLEMENTED'
            reason = 'The real EVE/Terra MCP parity runner is not present yet. No ESA/EVE result was fabricated.'
        }
    }
    $agenticStatus | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $statusPath

    & "$PSScriptRoot\archive_latest_training.ps1" -RunDir $fullRun.FullName -SkipCheckpoint
    if ($LASTEXITCODE -ne 0) { throw 'Training archive/publication step failed.' }

    $publicationDir = Join-Path $repoRoot "published\training-runs\$($fullRun.Name)"
    $publicWebDir = Join-Path $repoRoot "web\public\training-004\$($fullRun.Name)"
    $publicDocsDir = Join-Path $repoRoot "docs\training-004\$($fullRun.Name)"
    New-Item -ItemType Directory -Force -Path $publicWebDir, $publicDocsDir | Out-Null

    $sanitizedLog = Join-Path $publicationDir 'observable-log.txt'
    Redact-Log -InputPath $consoleLog -OutputPath $sanitizedLog
    Copy-Item $gpuLog (Join-Path $publicationDir 'gpu-telemetry.csv') -Force
    Copy-Item $statusPath (Join-Path $publicationDir 'agentic-status.json') -Force
    Copy-Item $manifestPath (Join-Path $publicationDir 'orchestrator-manifest.json') -Force
    Copy-Item $fullMetricsPath (Join-Path $publicationDir 'metrics-full.json') -Force
    Copy-Item (Join-Path $smokeRun.FullName 'metrics.json') (Join-Path $publicationDir 'metrics-smoke.json') -Force

    $trained = [double]$fullMetrics.remote_unique_windows_trained
    $elapsed = [double]$fullMetrics.elapsed_seconds
    $rate = if ($elapsed -gt 0) { $trained / $elapsed } else { 0.0 }
    $downloadMBs = if ($elapsed -gt 0) { ([double]$fullMetrics.remote_download_bytes / 1MB) / $elapsed } else { 0.0 }
    $completion = 100.0 * $trained / [Math]::Max(1.0, [double]$fullMetrics.target_remote_windows)
    $lossReduction = if ([double]$fullMetrics.loss_first -ne 0) {
        100.0 * (1.0 - ([double]$fullMetrics.loss_last / [double]$fullMetrics.loss_first))
    } else { 0.0 }
    $throughputRatio = if ($smokeRate -gt 0) { $rate / $smokeRate } else { 0.0 }

    $lessons = @"
# Training #4A — measured lessons

Evidence class: **DERIVED_VALUE**. These are pipeline/training conclusions, not environmental ground truth.

- Full run used **$([Math]::Round($trained))** distinct requested geospatial/time windows for optimization; target completion: **$([Math]::Round($completion, 2))%**.
- Sustained throughput: **$([Math]::Round($rate, 2)) windows/s**; smoke throughput: **$([Math]::Round($smokeRate, 2)) windows/s**; sustained/smoke ratio: **$([Math]::Round($throughputRatio, 3))**.
- Average remote payload flow observed by the trainer: **$([Math]::Round($downloadMBs, 3)) MiB/s**.
- Recorded transport/decode failures: **$($fullMetrics.failures)**.
- Optimization loss first -> last changed by **$([Math]::Round($lossReduction, 2))%**. This does not prove environmental-detection accuracy.
- NVIDIA telemetry is saved in `gpu-telemetry.csv` for utilization/VRAM/power review.
- Full raw run artifacts remain local under `research_runs/`; a SHA-256 archive is created without checkpoint weights. The public page receives the sanitized observable console log, compact metrics and telemetry.
- The current runner still lacks the complete Training #4 v2 telemetry contract (queue depth, explicit GPU-wait-for-data, fetch/decode p50/p95 and provider-backoff counters). Those remain implementation gates before claiming the complete multi-source Training #4.
- EVE/Terra MCP parity status: **$($agenticStatus.status)**. No model or ESA comparison result is inferred from this vision-stream run.

## Scientific boundary
Training behavior alone cannot establish lake loss, flood cause, drought cause, a blocked river, paleochannel viability, earthquake prediction or a restoration recommendation. Those require separate reproducible observations and domain validation.
"@
    $lessonsPath = Join-Path $publicationDir 'lessons.md'
    Set-Content -Encoding UTF8 $lessonsPath $lessons

    foreach ($dest in @($publicWebDir, $publicDocsDir)) {
        Copy-Item (Join-Path $publicationDir '*') $dest -Recurse -Force
    }

    $latest = [ordered]@{
        run = $fullRun.Name
        generated_utc = (Get-Date).ToUniversalTime().ToString('o')
        scope = 'Training #4A high-volume streaming baseline'
        evidence_class = 'DERIVED_VALUE'
        target_completion_percent = [Math]::Round($completion, 4)
        windows_per_second = [Math]::Round($rate, 4)
        agentic_status = $agenticStatus.status
        full_training_004_complete = $false
        note = 'Complete Training #4 remains gated on multi-source pipeline-v2 telemetry and real MCP/EVE parity execution.'
    }
    foreach ($root in @((Join-Path $repoRoot 'web\public\training-004'), (Join-Path $repoRoot 'docs\training-004'))) {
        $latest | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 (Join-Path $root 'latest.json')
    }

    $manifest.completed_utc = (Get-Date).ToUniversalTime().ToString('o')
    $manifest.status = 'completed'
    $manifest.full_run = $fullRun.Name
    $manifest.full_training_004_complete = $false
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $manifestPath

    if ($Publish) {
        git add -- "published/training-runs/$($fullRun.Name)" "web/public/training-004" "docs/training-004"
        $staged = git diff --cached --name-only
        if ($staged -match '^research_runs/' -or $staged -match '\.(pt|pth|ckpt)$') {
            throw 'Safety gate: raw research run or checkpoint was staged unexpectedly.'
        }
        git commit -m "research: publish Training 004A L4 evidence $($fullRun.Name)"
        if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }
        git push origin HEAD:$expectedBranch
        if ($LASTEXITCODE -ne 0) { throw 'git push failed.' }
        Write-Host 'Compact sanitized evidence pushed to PR #248 branch. GitHub Pages becomes public only after an approved merge/deploy.' -ForegroundColor Green
    }

    Write-Host 'TRAINING #4A COMPLETE.' -ForegroundColor Green
    Write-Host "Full run: $($fullRun.FullName)" -ForegroundColor Cyan
    Write-Host "Public evidence: $publicationDir" -ForegroundColor Cyan
    Write-Host "Lessons: $lessonsPath" -ForegroundColor Cyan
} catch {
    $manifest.completed_utc = (Get-Date).ToUniversalTime().ToString('o')
    $manifest.status = 'failed'
    $manifest.error = $_.Exception.Message
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $manifestPath
    throw
} finally {
    try { Stop-Transcript | Out-Null } catch {}
    if ($telemetryJob) {
        Stop-Job $telemetryJob -ErrorAction SilentlyContinue | Out-Null
        Remove-Job $telemetryJob -Force -ErrorAction SilentlyContinue
    }
}
