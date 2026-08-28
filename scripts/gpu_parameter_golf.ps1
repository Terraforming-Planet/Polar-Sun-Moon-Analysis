param(
    [ValidateRange(2, 1440)][int]$Minutes = 60,
    [ValidateRange(8, 512)][int]$BatchSize = 128,
    [ValidateRange(2, 4096)][int]$MaxPairs = 256
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot
$launcher = Join-Path $PSScriptRoot 'gpu1h.ps1'

if (-not (Test-Path $launcher)) {
    throw "Missing evidence-aware GPU launcher: $launcher"
}

Write-Host 'PARAMETER-GOLF EVIDENCE DISCIPLINE' -ForegroundColor Cyan
Write-Host 'Phase 1/2: mandatory 1-minute smoke run with full evidence capture.' -ForegroundColor Yellow

& $launcher -Minutes 1 -BatchSize $BatchSize -MaxPairs $MaxPairs
$smokeExit = $LASTEXITCODE
if ($smokeExit -ne 0) {
    throw "SMOKE FAILED with exit code $smokeExit. Long training is blocked."
}

$runRoot = Join-Path $repoRoot 'research_runs\training004_gpu_ssl_one_hour'
$latestEvidence = Get-ChildItem $runRoot -Directory -Filter 'evidence-*' |
    Sort-Object Name -Descending |
    Select-Object -First 1
if (-not $latestEvidence) {
    throw 'SMOKE EVIDENCE MISSING: no evidence-* directory was created.'
}

$fullLog = Join-Path $latestEvidence.FullName 'FULL-CONSOLE.log'
$hashes = Join-Path $latestEvidence.FullName 'SHA256SUMS.txt'
if (-not (Test-Path $fullLog) -or (Get-Item $fullLog).Length -eq 0) {
    throw 'SMOKE EVIDENCE INVALID: FULL-CONSOLE.log missing or empty.'
}
if (-not (Test-Path $hashes)) {
    throw 'SMOKE EVIDENCE INVALID: SHA256SUMS.txt missing.'
}
if (-not (Select-String -Path $fullLog -Pattern 'GPU_SSL_TRAINING step=' -Quiet)) {
    throw 'SMOKE EVIDENCE INVALID: no GPU_SSL_TRAINING record in full log.'
}

Write-Host "SMOKE PASS: $($latestEvidence.FullName)" -ForegroundColor Green
Write-Host "Phase 2/2: $Minutes-minute run. Full evidence capture is mandatory." -ForegroundColor Yellow

& $launcher -Minutes $Minutes -BatchSize $BatchSize -MaxPairs $MaxPairs
$longExit = $LASTEXITCODE
if ($longExit -ne 0) {
    throw "LONG TRAINING FAILED with exit code $longExit"
}

$finalEvidence = Get-ChildItem $runRoot -Directory -Filter 'evidence-*' |
    Sort-Object Name -Descending |
    Select-Object -First 1
$finalLog = Join-Path $finalEvidence.FullName 'FULL-CONSOLE.log'
$finalHashes = Join-Path $finalEvidence.FullName 'SHA256SUMS.txt'
if (-not (Test-Path $finalLog) -or (Get-Item $finalLog).Length -eq 0) {
    throw 'FINAL EVIDENCE INVALID: FULL-CONSOLE.log missing or empty.'
}
if (-not (Test-Path $finalHashes)) {
    throw 'FINAL EVIDENCE INVALID: SHA256SUMS.txt missing.'
}

Write-Host 'PARAMETER-GOLF DISCIPLINE: COMPLETE' -ForegroundColor Green
Write-Host "FINAL_EVIDENCE=$($finalEvidence.FullName)" -ForegroundColor Green
Write-Host "FULL_LOG=$finalLog" -ForegroundColor Green
Write-Host "HASHES=$finalHashes" -ForegroundColor Green
