param(
    [switch]$Full,
    [switch]$SkipCodex,
    [int]$SmokePacks = 120,
    [int]$TargetPacks = 500000,
    [int]$Workers = 16,
    [int]$BatchSize = 24,
    [int]$Seed = 4004
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

$branch = 'agent/eve-terra-l4-comparative-benchmark'
$briefPath = Join-Path $repoRoot 'CODEX_TRAINING_004_WATER_CYCLE_L4_EXECUTION.md'
$manifestPath = Join-Path $repoRoot 'research_runs\training004_water_cycle_manifest.jsonl'
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$runRoot = Join-Path $repoRoot "research_runs\training004_water_cycle_$stamp"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$consoleLog = Join-Path $runRoot 'orchestrator-console.log'
$gpuLog = Join-Path $runRoot 'gpu-telemetry.csv'
$orchestratorPath = Join-Path $runRoot 'orchestrator.json'

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )
    Write-Host "`n=== $Label ===" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

function Test-TrackedWorktreeClean {
    git diff --quiet
    if ($LASTEXITCODE -ne 0) {
        throw 'Tracked unstaged changes exist. Commit/stash them before Training #4 synchronization.'
    }
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        throw 'Staged changes exist. Commit/stash them before Training #4 synchronization.'
    }
}

function Get-Python {
    $candidates = @(
        (Join-Path $repoRoot '.venv-l4\Scripts\python.exe'),
        (Join-Path $repoRoot '.venv\Scripts\python.exe')
    )
    $systemPython = Get-Command python -ErrorAction SilentlyContinue
    if ($systemPython) { $candidates += $systemPython.Source }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (-not $candidate -or -not (Test-Path $candidate)) { continue }
        & $candidate -c "import sys; print(sys.executable)" *> $null
        if ($LASTEXITCODE -eq 0) { return $candidate }
    }
    throw 'No usable Python interpreter was found.'
}

function Assert-NoDangerousStagedFiles {
    $paths = @(git diff --cached --name-only)
    foreach ($path in $paths) {
        if (-not $path) { continue }
        $normalized = $path.Replace('\', '/').ToLowerInvariant()
        if (
            $normalized -match '(^|/)research_runs/' -or
            $normalized -match '(^|/)\.env($|\.)' -or
            $normalized -match '\.(pt|pth|ckpt|safetensors|gguf|bin)$' -or
            $normalized -match '(^|/)(weights|checkpoints?|model-cache|hf-cache|huggingface-cache)/'
        ) {
            throw "Safety gate: forbidden generated/secret/model path staged: $path"
        }

        $localPath = Join-Path $repoRoot $path
        if (Test-Path $localPath -PathType Leaf) {
            $size = (Get-Item $localPath).Length
            if ($size -gt 20MB) {
                throw "Safety gate: staged file exceeds 20 MiB: $path"
            }
        }
    }
}

function Start-GpuTelemetry {
    param([string]$Path)
    return Start-Job -ArgumentList $Path -ScriptBlock {
        param($OutputPath)
        'timestamp,gpu_name,gpu_util_pct,mem_util_pct,mem_used_mb,mem_total_mb,power_w,temp_c' |
            Set-Content -Encoding UTF8 $OutputPath
        while ($true) {
            $line = & nvidia-smi `
                --query-gpu=timestamp,name,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,temperature.gpu `
                --format=csv,noheader,nounits 2>$null | Select-Object -First 1
            if ($line) { Add-Content -Encoding UTF8 $OutputPath $line }
            Start-Sleep -Seconds 2
        }
    }
}

$state = [ordered]@{
    schema = 'terra-training-004-water-cycle-l4-orchestrator-v1'
    started_utc = (Get-Date).ToUniversalTime().ToString('o')
    branch = $branch
    requested_full = [bool]$Full
    smoke_packs = $SmokePacks
    target_packs = $TargetPacks
    seed = $Seed
    code_sync = 'PENDING'
    codex = if ($SkipCodex) { 'SKIPPED_BY_USER' } else { 'PENDING' }
    quality = 'PENDING'
    smoke = 'PENDING'
    full = if ($Full) { 'PENDING' } else { 'NOT_REQUESTED' }
    scientific_finding_claim = $false
    environmental_ground_truth_claim = $false
    test001_training_leakage_allowed = $false
}
$state | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $orchestratorPath

$gpuJob = $null
Start-Transcript -Path $consoleLog -Force | Out-Null
try {
    Write-Host 'TERRA OBSERVATION SYSTEM — TRAINING #4 WATER CYCLE' -ForegroundColor Green
    Write-Host '30 complete years: 1996-2025 | 500k target packs | TEST 001 anchor holdout' -ForegroundColor Green
    Write-Host 'This is the Water Cycle experiment. Historical Training #4A/GIBS evidence is not relabelled.' -ForegroundColor Yellow

    if (-not (Test-Path $briefPath)) {
        throw "Missing Codex master brief: $briefPath"
    }

    Test-TrackedWorktreeClean

    Invoke-Checked 'FETCH EXPERIMENTAL BRANCH + MAIN' {
        git fetch origin $branch main --prune
    }

    $currentBranch = (git branch --show-current).Trim()
    if ($currentBranch -ne $branch) {
        Invoke-Checked 'SWITCH TO PR #248 BRANCH' {
            git switch $branch
        }
    }

    Invoke-Checked 'FAST-FORWARD LOCAL PR BRANCH' {
        git pull --ff-only origin $branch
    }

    Invoke-Checked 'MERGE CURRENT MAIN INTO PR #248 WORKTREE' {
        git merge --no-edit origin/main
    }

    $state.code_sync = 'PASS'
    $state.synced_head_before_codex = (git rev-parse HEAD).Trim()
    $state | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $orchestratorPath

    $python = Get-Python
    Write-Host "Python: $python" -ForegroundColor DarkCyan

    if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
        throw 'nvidia-smi is not available. The requested publishable run targets NVIDIA L4.'
    }
    $gpuName = (nvidia-smi --query-gpu=name --format=csv,noheader | Select-Object -First 1).Trim()
    Write-Host "GPU: $gpuName" -ForegroundColor DarkCyan
    if ($gpuName -notmatch 'NVIDIA L4|\bL4\b') {
        throw "Expected NVIDIA L4 for this launcher, detected: $gpuName"
    }

    & $python -c "import torch; assert torch.cuda.is_available(); print('torch', torch.__version__); print('cuda', torch.version.cuda); print('gpu', torch.cuda.get_device_name(0))"
    if ($LASTEXITCODE -ne 0) {
        throw 'PyTorch CUDA preflight failed. Do not start a full run on a CPU-only environment.'
    }

    $gpuJob = Start-GpuTelemetry -Path $gpuLog

    if (-not $SkipCodex) {
        $codex = Get-Command codex -ErrorAction SilentlyContinue
        if (-not $codex) {
            $npm = Get-Command npm -ErrorAction SilentlyContinue
            if (-not $npm) {
                throw 'Codex CLI is missing and npm is unavailable for automatic installation.'
            }
            Invoke-Checked 'INSTALL CODEX CLI' {
                npm install -g '@openai/codex@latest'
            }
        }

        Invoke-Checked 'VERIFY CODEX LOGIN' {
            codex login status
        }

        $brief = Get-Content $briefPath -Raw -ErrorAction Stop
        Write-Host 'Launching Codex with the frozen Training #4 Water Cycle master brief...' -ForegroundColor Green
        & codex exec --sandbox danger-full-access $brief
        if ($LASTEXITCODE -ne 0) {
            throw "Codex implementation failed with exit code $LASTEXITCODE."
        }
        $state.codex = 'PASS'
    }

    Invoke-Checked 'TRACKED SECRET SCAN' {
        & $python scripts/ci/scan_tracked_secrets.py
    }

    Invoke-Checked 'RUFF FULL REPOSITORY' {
        & $python -m ruff check .
    }

    $trainingModules = @(
        'terra_research_node/water_cycle_manifest.py',
        'terra_research_node/water_cycle_acquisition.py'
    )
    $sourceDir = Join-Path $repoRoot 'terra_research_node\training004_sources'
    if (Test-Path $sourceDir) {
        $trainingModules += @(
            Get-ChildItem $sourceDir -Filter '*.py' -File -Recurse |
                ForEach-Object { $_.FullName.Substring($repoRoot.Length + 1) }
        )
    }
    $trainerModule = Join-Path $repoRoot 'terra_research_node\water_cycle_training.py'
    if (Test-Path $trainerModule) { $trainingModules += 'terra_research_node/water_cycle_training.py' }

    Invoke-Checked 'MYPY TRAINING 004 MODULES' {
        & $python -m mypy @trainingModules
    }

    Invoke-Checked 'PYTEST FULL REPOSITORY' {
        & $python -m pytest -q
    }

    Invoke-Checked 'COMPILE TRAINING MODULES' {
        & $python -m compileall terra_research_node scripts tests
    }

    $state.quality = 'PASS'
    $state | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $orchestratorPath

    $porcelain = @(git status --porcelain)
    if ($porcelain.Count -gt 0) {
        Write-Host 'Codex produced worktree changes. Staging after safety checks...' -ForegroundColor Cyan
        git add -A
        if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }
        Assert-NoDangerousStagedFiles
        Invoke-Checked 'RE-SCAN STAGED FILES FOR SECRETS' {
            & $python scripts/ci/scan_tracked_secrets.py
        }
        $staged = @(git diff --cached --name-only)
        if ($staged.Count -gt 0) {
            Invoke-Checked 'COMMIT CODEX IMPLEMENTATION TO PR #248' {
                git commit -m 'research: implement Training 004 Water Cycle L4 pipeline'
            }
        }
    }

    Invoke-Checked 'PUSH SYNCHRONIZED IMPLEMENTATION TO PR #248' {
        git push origin HEAD:$branch
    }

    $state.code_head = (git rev-parse HEAD).Trim()
    $state | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $orchestratorPath

    Invoke-Checked 'BUILD 500K WATER-CYCLE MANIFEST' {
        & $python scripts/build_training_004_water_cycle_manifest.py `
            --output $manifestPath `
            --count $TargetPacks `
            --seed $Seed
    }

    if (-not (Test-Path $manifestPath)) {
        throw 'The 500k manifest was not created.'
    }

    $runner = Join-Path $repoRoot 'scripts\run_training_004_water_cycle_l4.py'
    if (-not (Test-Path $runner)) {
        throw 'Codex did not create scripts/run_training_004_water_cycle_l4.py as required.'
    }

    $smokeDir = Join-Path $runRoot 'smoke'
    New-Item -ItemType Directory -Force -Path $smokeDir | Out-Null
    Invoke-Checked 'REPRESENTATIVE WATER-CYCLE SMOKE RUN' {
        & $python $runner `
            --mode smoke `
            --manifest $manifestPath `
            --output-dir $smokeDir `
            --resume `
            --seed $Seed `
            --max-packs $SmokePacks `
            --device cuda `
            --workers $Workers `
            --batch-size $BatchSize
    }

    $state.smoke = 'PASS'
    $state | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $orchestratorPath

    if ($Full) {
        $fullDir = Join-Path $runRoot 'full'
        New-Item -ItemType Directory -Force -Path $fullDir | Out-Null
        Invoke-Checked 'FULL 500K WATER-CYCLE RUN' {
            & $python $runner `
                --mode full `
                --manifest $manifestPath `
                --output-dir $fullDir `
                --resume `
                --seed $Seed `
                --max-packs $TargetPacks `
                --device cuda `
                --workers $Workers `
                --batch-size $BatchSize
        }
        $state.full = 'PASS'
    }

    $state.completed_utc = (Get-Date).ToUniversalTime().ToString('o')
    $state.status = 'PASS'
    $state | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $orchestratorPath

    Write-Host ''
    Write-Host 'TRAINING 004 WATER CYCLE ORCHESTRATOR: PASS' -ForegroundColor Green
    Write-Host "Branch/head: $branch / $($state.code_head)" -ForegroundColor Green
    Write-Host "Smoke: $($state.smoke)" -ForegroundColor Green
    Write-Host "Full: $($state.full)" -ForegroundColor Green
    Write-Host "Run directory: $runRoot" -ForegroundColor Cyan
    Write-Host 'Raw run data remains outside Git. PR #248 is NOT merged by this script.' -ForegroundColor Yellow
} catch {
    $state.completed_utc = (Get-Date).ToUniversalTime().ToString('o')
    $state.status = 'FAIL'
    $state.error = $_.Exception.Message
    $state | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $orchestratorPath
    Write-Host "TRAINING 004 WATER CYCLE ORCHESTRATOR: FAIL — $($_.Exception.Message)" -ForegroundColor Red
    throw
} finally {
    try { Stop-Transcript | Out-Null } catch {}
    if ($gpuJob) {
        Stop-Job $gpuJob -ErrorAction SilentlyContinue | Out-Null
        Remove-Job $gpuJob -Force -ErrorAction SilentlyContinue
    }
}
