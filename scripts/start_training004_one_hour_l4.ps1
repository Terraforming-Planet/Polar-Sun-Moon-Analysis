param(
    [ValidateRange(1, 1440)][int]$Minutes = 60,
    [ValidateRange(1, 64)][int]$Workers = 4,
    [ValidateRange(1, 128)][int]$MaxInFlight = 8,
    [ValidateRange(1, 128)][int]$BatchSize = 24,
    [ValidateRange(64, 1024)][int]$WindowSize = 256,
    [ValidateRange(1, 500000)][int]$TargetWindows = 500000,
    [ValidateRange(30, 3600)][int]$FirstNewBatchTimeoutSeconds = 300,
    [ValidateRange(30, 3600)][int]$NoProgressTimeoutSeconds = 300,
    [int]$Seed = 4004
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot
$python = Join-Path $repoRoot '.venv-l4\Scripts\python.exe'
if (-not (Test-Path $python)) {
    throw "Missing CUDA Python environment: $python"
}

$credentialPath = Join-Path $env:LOCALAPPDATA 'TerraformingPlanet\usgs_m2m.credential.xml'
if (-not (Test-Path $credentialPath)) {
    throw 'Missing encrypted USGS credential. Run scripts\start_training004_usgs.ps1 once to save it.'
}
$credential = Import-Clixml -Path $credentialPath
$env:USGS_USERNAME = $credential.UserName
$env:USGS_M2M_TOKEN = $credential.GetNetworkCredential().Password
$env:PYTHONPATH = $repoRoot
$env:MPLBACKEND = 'Agg'
if ([string]::IsNullOrWhiteSpace($env:USGS_USERNAME) -or [string]::IsNullOrWhiteSpace($env:USGS_M2M_TOKEN)) {
    throw 'Encrypted USGS credential is empty.'
}

$manifest = Join-Path $repoRoot 'research_runs\training004_water_cycle_manifest.jsonl'
$runRoot = Join-Path $repoRoot 'research_runs\training004_streaming_one_hour'
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$consoleLog = Join-Path $runRoot "console-$stamp.log"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

try {
    & $python -c "import torch; assert torch.cuda.is_available(); print('CUDA_TRAINING', torch.cuda.get_device_name(0), torch.__version__, torch.version.cuda)"
    if ($LASTEXITCODE -ne 0) {
        throw 'CUDA is unavailable in .venv-l4.'
    }

    if (-not (Test-Path $manifest)) {
        Write-Host 'Building deterministic 500k recipe manifest...' -ForegroundColor Cyan
        & $python scripts\build_training_004_water_cycle_manifest.py --output $manifest --count 500000 --seed $Seed
        if ($LASTEXITCODE -ne 0) {
            throw '500k manifest generation failed.'
        }
    }

    $seconds = $Minutes * 60
    Write-Host 'TERRA TRAINING #4 — REAL USGS LANDSAT STREAMING' -ForegroundColor Green
    Write-Host "Runtime budget: $Minutes minutes | target ceiling: $TargetWindows real windows" -ForegroundColor Green
    Write-Host "Workers=$Workers | max-in-flight=$MaxInFlight | batch=$BatchSize | window=$WindowSize | CUDA" -ForegroundColor Cyan
    Write-Host "Checkpoint/resume directory: $runRoot" -ForegroundColor Cyan
    Write-Host "Hard watchdog: first new CUDA batch=$FirstNewBatchTimeoutSeconds s; later progress=$NoProgressTimeoutSeconds s" -ForegroundColor Yellow

    & $python scripts\run_training004_streaming_l4.py `
        --manifest $manifest `
        --output-dir $runRoot `
        --target-real-windows $TargetWindows `
        --workers $Workers `
        --max-in-flight $MaxInFlight `
        --batch-size $BatchSize `
        --bootstrap-batch-size 1 `
        --window-size $WindowSize `
        --seed $Seed `
        --device cuda `
        --resume `
        --first-batch-timeout-seconds $FirstNewBatchTimeoutSeconds `
        --no-progress-timeout-seconds $NoProgressTimeoutSeconds `
        --max-runtime-seconds $seconds 2>&1 | Tee-Object -FilePath $consoleLog

    $runnerExit = $LASTEXITCODE
    $summaryPath = Join-Path $runRoot 'summary.json'
    $failurePath = Join-Path $runRoot 'failure-summary.json'
    if (Test-Path $summaryPath) {
        $summary = Get-Content $summaryPath -Raw | ConvertFrom-Json
        Write-Host "STATUS=$($summary.status)" -ForegroundColor Cyan
        Write-Host "REAL_WINDOWS=$($summary.real_scientific_windows_trained)" -ForegroundColor Cyan
        Write-Host "TIME_BUDGET_REACHED=$($summary.time_budget_reached)" -ForegroundColor Cyan
        Write-Host "CHECKPOINT=$runRoot\checkpoints\latest.pt" -ForegroundColor Cyan
        Write-Host "TELEMETRY=$runRoot\telemetry.jsonl" -ForegroundColor Cyan
        if ($summary.time_budget_reached -eq $true -and [int64]$summary.new_windows_this_invocation -gt 0) {
            Write-Host 'TRAINING004 ONE-HOUR CUDA RUN: COMPLETE (checkpoint saved; resumable)' -ForegroundColor Green
            exit 0
        }
        if ($summary.status -eq 'PASS') {
            Write-Host 'TRAINING004 TARGET: PASS' -ForegroundColor Green
            exit 0
        }
    }
    if (Test-Path $failurePath) {
        Get-Content $failurePath -Raw
    }
    throw "Training stopped before a real CUDA batch completed. Runner exit=$runnerExit. See $consoleLog"
}
finally {
    Remove-Item Env:USGS_M2M_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:USGS_USERNAME -ErrorAction SilentlyContinue
}
