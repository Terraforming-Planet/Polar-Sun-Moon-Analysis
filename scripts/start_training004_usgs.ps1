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

& .\.venv-l4\Scripts\python.exe .\scripts\test_usgs_m2m_login.py
if ($LASTEXITCODE -ne 0) {
    Remove-Item -Force -ErrorAction SilentlyContinue $secretFile
    Remove-Item Env:USGS_M2M_TOKEN -ErrorAction SilentlyContinue
    throw 'USGS LOGIN FAIL - saved credential removed. Verify the exact USGS username and create a fresh M2M Application Token.'
}

Write-Host 'USGS M2M LOGIN OK - credential verified and kept encrypted locally.' -ForegroundColor Green
Write-Host 'Starting Training #4...' -ForegroundColor Green
& .\scripts\run_training_004_water_cycle_l4.ps1 -Full -SkipCodex
exit $LASTEXITCODE
