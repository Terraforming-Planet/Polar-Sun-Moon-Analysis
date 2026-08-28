$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host 'Training #4 USGS secure launcher' -ForegroundColor Cyan

$secretDir = Join-Path $env:LOCALAPPDATA 'TerraformingPlanet'
$secretFile = Join-Path $secretDir 'usgs_m2m.credential.xml'
New-Item -ItemType Directory -Force -Path $secretDir | Out-Null

$cred = $null
if (Test-Path $secretFile) {
    try {
        $cred = Import-Clixml -Path $secretFile
        Write-Host 'Loaded locally encrypted USGS credential.' -ForegroundColor DarkGreen
    }
    catch {
        Remove-Item -Force -ErrorAction SilentlyContinue $secretFile
    }
}

if ($null -eq $cred) {
    $cred = Get-Credential -UserName 'Terraformingplanet' -Message 'Wklej NOWY USGS Application Token jako haslo. Zostanie zaszyfrowany lokalnie przez Windows.'
    if ($null -eq $cred) {
        throw 'USGS credential entry cancelled.'
    }
    $cred | Export-Clixml -Path $secretFile
    Write-Host 'USGS credential saved encrypted for this Windows user only.' -ForegroundColor DarkGreen
}

$env:USGS_USERNAME = $cred.UserName
$env:USGS_M2M_TOKEN = $cred.GetNetworkCredential().Password
$env:MPLBACKEND = 'Agg'
$env:PYTHONPATH = (Get-Location).Path

$python = '.\.venv-l4\Scripts\python.exe'

& $python .\scripts\test_usgs_m2m_login.py
if ($LASTEXITCODE -ne 0) {
    Remove-Item -Force -ErrorAction SilentlyContinue $secretFile
    Remove-Item Env:USGS_M2M_TOKEN -ErrorAction SilentlyContinue
    throw 'USGS LOGIN FAIL - saved credential removed. Verify the exact USGS username and create a fresh M2M Application Token.'
}

Write-Host 'USGS M2M LOGIN OK - credential verified and kept encrypted locally.' -ForegroundColor Green
Write-Host 'Checking scientific Landsat download permission before expensive quality gates...' -ForegroundColor Cyan

& $python -m scripts.preflight_training004_usgs_download
$preflightExit = $LASTEXITCODE
if ($preflightExit -ne 0) {
    if ($preflightExit -eq 21) {
        Write-Host ''
        Write-Host 'TRAINING #4 PROVIDER BLOCKED - USGS returned HTTP 403 for download-options.' -ForegroundColor Yellow
        Write-Host 'The token/login is valid, but this ERS account is not currently permitted to request M2M archive downloads.' -ForegroundColor Yellow
        Write-Host 'Open the ERS account page and request/verify M2M API access. Do not rerun the 500k pipeline until this preflight says PASS.' -ForegroundColor Yellow
        exit 21
    }
    throw "USGS scientific download preflight failed with exit code $preflightExit."
}

Write-Host 'USGS SCIENTIFIC DOWNLOAD PREFLIGHT PASS.' -ForegroundColor Green
Write-Host 'Starting Training #4...' -ForegroundColor Green
& .\scripts\run_training_004_water_cycle_l4.ps1 -Full -SkipCodex
exit $LASTEXITCODE
