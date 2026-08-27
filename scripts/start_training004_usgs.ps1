$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host 'Training #4 USGS secure launcher' -ForegroundColor Cyan
$cred = Get-Credential -UserName 'terraformingplanet' -Message 'Wklej NOWY USGS Application Token jako haslo'
$env:USGS_USERNAME = $cred.UserName
$env:USGS_M2M_TOKEN = $cred.GetNetworkCredential().Password
$env:MPLBACKEND = 'Agg'

& .\.venv-l4\Scripts\python.exe .\scripts\test_usgs_m2m_login.py
if ($LASTEXITCODE -ne 0) {
    throw 'USGS LOGIN FAIL - Training #4 nie wystartowal.'
}

Write-Host 'USGS M2M LOGIN OK - starting Training #4' -ForegroundColor Green
& .\scripts\run_training_004_water_cycle_l4.ps1 -Full -SkipCodex
exit $LASTEXITCODE
