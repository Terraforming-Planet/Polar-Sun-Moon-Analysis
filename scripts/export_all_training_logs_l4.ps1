param(
    [string]$OutputDir = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Find-RepoRoot {
    $candidates = @(
        'C:\TP\Polar-Sun-Moon-Analysis',
        'C:\Users\xodobrox\Polar-Sun-Moon-Analysis',
        (Get-Location).Path
    ) | Select-Object -Unique
    foreach ($candidate in $candidates) {
        if (Test-Path (Join-Path $candidate '.git')) { return (Resolve-Path $candidate).Path }
    }
    throw 'Polar-Sun-Moon-Analysis repository was not found on this L4 Windows machine.'
}

$repoRoot = Find-RepoRoot
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
if (-not $OutputDir) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    if (-not $desktop) { $desktop = $env:TEMP }
    $OutputDir = Join-Path $desktop "TERRA_FULL_TRAINING_LOGS_1-4_$timestamp"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$inventory = New-Object System.Collections.Generic.List[object]
$seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

$knownHashes = @{
    '20260819T202428Z_FULL_LOGS.zip' = '71B44F6151BBB8992795A144CC222C7A5D7E7D244A6183DED1758D1F230571212'
    'stream_gibs_20260820T013036Z_FULL_LOGS.zip' = '40128DD94E8AEF7282835387625DEF270CF0F34F261775683C603EBFFD7F9F08'
}

$trainingDefinitions = @(
    [pscustomobject]@{
        Id = 'training-001'
        Label = 'Training #1'
        Tokens = @('20260819T202428Z','l4-training-2026-08-19')
    },
    [pscustomobject]@{
        Id = 'training-002'
        Label = 'Training #2'
        Tokens = @('site_20260819T223835Z')
    },
    [pscustomobject]@{
        Id = 'training-003'
        Label = 'Training #3'
        Tokens = @('stream_gibs_20260820T013036Z')
    },
    [pscustomobject]@{
        Id = 'training-004'
        Label = 'Training #4 - two 60-minute L4 sessions, 120 minutes total'
        Tokens = @('training004','training-004','gpu_ssl_one_hour','20260828')
    }
)

$allowedNames = @(
    '*.log','*.txt','*.json','*.jsonl','*.csv','*.md',
    '*FULL_LOGS.zip','*FULL_LOGS.zip.sha256.txt',
    '*FULL-ARTIFACTS.zip','*FULL-ARTIFACTS.zip.sha256.txt',
    '*training004*.zip','*training004*.zip.sha256.txt',
    'gpu1h.ps1','gpu_parameter_golf.ps1','run_training004_cached_gpu_l4.py'
)

$searchRoots = @(
    $repoRoot,
    (Join-Path $repoRoot 'research_runs'),
    (Join-Path $repoRoot 'published'),
    (Join-Path $repoRoot 'docs\published'),
    (Join-Path $repoRoot 'docs\research'),
    (Join-Path $repoRoot 'web\public\research'),
    'C:\TP',
    'C:\Users\xodobrox'
) | Where-Object { Test-Path $_ } | Select-Object -Unique

function Match-Training {
    param([string]$Path)
    foreach ($def in $trainingDefinitions) {
        foreach ($token in $def.Tokens) {
            if ($Path -like "*$token*") { return $def }
        }
    }
    return $null
}

function Is-AllowedEvidence {
    param([System.IO.FileInfo]$File)
    foreach ($pattern in $allowedNames) {
        if ($File.Name -like $pattern) { return $true }
    }
    return $false
}

function Add-Evidence {
    param([System.IO.FileInfo]$File)
    if (-not $File -or -not $File.Exists) { return }
    if (-not (Is-AllowedEvidence $File)) { return }
    if (-not $seen.Add($File.FullName)) { return }

    $training = Match-Training $File.FullName
    if ($null -eq $training) { return }

    # Never export likely secrets even when they happen to be text/json files.
    if ($File.Name -match '(?i)(token|secret|credential|\.env|private[_-]?key)') { return }

    $sha = (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash.ToUpperInvariant()
    $verification = 'SHA256-COMPUTED'
    if ($knownHashes.ContainsKey($File.Name)) {
        $verification = if ($sha -eq $knownHashes[$File.Name]) { 'KNOWN-SHA256-MATCH' } else { 'KNOWN-SHA256-MISMATCH' }
    }

    $destRoot = Join-Path $OutputDir $training.Id
    New-Item -ItemType Directory -Force -Path $destRoot | Out-Null

    $relative = $File.FullName
    if ($File.FullName.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relative = $File.FullName.Substring($repoRoot.Length).TrimStart('\')
    } else {
        $relative = $File.FullName.TrimStart('\').Replace(':','')
    }
    $safeRelative = $relative -replace '[<>:"/\\|?*]', '_'
    $dest = Join-Path $destRoot $safeRelative
    Copy-Item -LiteralPath $File.FullName -Destination $dest -Force

    $inventory.Add([pscustomobject]@{
        training_id = $training.Id
        training_label = $training.Label
        original_path = $File.FullName
        copied_path = $dest
        file_name = $File.Name
        size_bytes = $File.Length
        modified_utc = $File.LastWriteTimeUtc.ToString('o')
        sha256 = $sha
        verification = $verification
    })
}

Write-Host 'TERRA LOG EXPORT - Training #1 to Training #4' -ForegroundColor Cyan
Write-Host 'Training #4 = two 60-minute L4 sessions (120 minutes total). There is no Training #5.' -ForegroundColor Yellow
Write-Host "Repository: $repoRoot" -ForegroundColor Cyan
Write-Host "Destination: $OutputDir" -ForegroundColor Cyan

foreach ($root in $searchRoots) {
    Write-Host "Scanning $root" -ForegroundColor DarkCyan
    foreach ($pattern in $allowedNames) {
        Get-ChildItem -LiteralPath $root -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue |
            ForEach-Object { Add-Evidence $_ }
    }
}

# Preserve PowerShell command history as auxiliary evidence. It is NOT console output.
try {
    $historyPath = (Get-PSReadLineOption).HistorySavePath
    if ($historyPath -and (Test-Path $historyPath)) {
        $historyDest = Join-Path $OutputDir 'auxiliary-powershell-command-history.txt'
        Copy-Item -LiteralPath $historyPath -Destination $historyDest -Force
        $inventory.Add([pscustomobject]@{
            training_id = 'auxiliary'
            training_label = 'PowerShell command history - commands only, not stdout/stderr'
            original_path = $historyPath
            copied_path = $historyDest
            file_name = [System.IO.Path]::GetFileName($historyPath)
            size_bytes = (Get-Item $historyPath).Length
            modified_utc = (Get-Item $historyPath).LastWriteTimeUtc.ToString('o')
            sha256 = (Get-FileHash $historyPath -Algorithm SHA256).Hash.ToUpperInvariant()
            verification = 'AUXILIARY-COMMAND-HISTORY'
        })
    }
} catch {
    Write-Warning "Could not copy PSReadLine history: $($_.Exception.Message)"
}

$inventoryArray = @($inventory)
$inventoryArray | Export-Csv -NoTypeInformation -Encoding UTF8 (Join-Path $OutputDir 'TRAINING-LOG-INVENTORY.csv')
$inventoryArray | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 (Join-Path $OutputDir 'TRAINING-LOG-INVENTORY.json')

$status = foreach ($def in $trainingDefinitions) {
    $items = @($inventoryArray | Where-Object { $_.training_id -eq $def.Id })
    $rawLogs = @($items | Where-Object { $_.file_name -match '(?i)(FULL-CONSOLE|TRANSCRIPT|\.log$)' })
    $fullArchives = @($items | Where-Object { $_.file_name -match '(?i)(FULL_LOGS|FULL-ARTIFACTS).*\.zip$' })
    $knownMatches = @($items | Where-Object { $_.verification -eq 'KNOWN-SHA256-MATCH' })
    [pscustomobject]@{
        training_id = $def.Id
        label = $def.Label
        evidence_files_found = $items.Count
        raw_log_files_found = $rawLogs.Count
        full_archives_found = $fullArchives.Count
        known_hash_matches = $knownMatches.Count
        status = if ($items.Count -eq 0) { 'NOT-FOUND' } elseif ($rawLogs.Count -gt 0 -or $fullArchives.Count -gt 0) { 'LOG-EVIDENCE-FOUND' } else { 'METADATA-EVIDENCE-ONLY' }
    }
}
$status | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 (Join-Path $OutputDir 'TRAINING-1-4-STATUS.json')
$status | Format-Table -AutoSize | Out-String | Set-Content -Encoding UTF8 (Join-Path $OutputDir 'TRAINING-1-4-STATUS.txt')

$readme = @"
TERRA OBSERVATION SYSTEM - TRAINING LOG RECOVERY PACKAGE
=======================================================
Generated UTC: $((Get-Date).ToUniversalTime().ToString('o'))
Source L4 Windows repository: $repoRoot

Numbering rule:
- Training #1
- Training #2
- Training #3
- Training #4 = TWO 60-minute NVIDIA L4 sessions executed on 2026-08-28, 120 minutes total.
- There is no Training #5 in this sequence.

Integrity rule:
Every copied file is indexed with SHA-256. Known historical FULL_LOGS archives are marked
KNOWN-SHA256-MATCH only when they exactly match the previously published hash.

Important limitation:
A raw console transcript can only be recovered if it was actually persisted by the original run
(Tee-Object, Start-Transcript, redirected stdout/stderr, archive, or another saved file).
PowerShell command history contains commands only and is included as auxiliary evidence; it is not
presented as missing console output.

See TRAINING-1-4-STATUS.txt and TRAINING-LOG-INVENTORY.csv for the exact recovery result.
"@
$readme | Set-Content -Encoding UTF8 (Join-Path $OutputDir 'README-RECOVERY.txt')

$hashTargets = Get-ChildItem -LiteralPath $OutputDir -Recurse -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' }
$hashLines = foreach ($file in $hashTargets) {
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $rel = $file.FullName.Substring($OutputDir.Length).TrimStart('\')
    "$hash  $rel"
}
$hashLines | Set-Content -Encoding ASCII (Join-Path $OutputDir 'SHA256SUMS.txt')

$zip = "$OutputDir.zip"
if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -LiteralPath $OutputDir -DestinationPath $zip -Force
$zipSha = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
"$zipSha  $([System.IO.Path]::GetFileName($zip))" | Set-Content -Encoding ASCII "$zip.sha256.txt"

Write-Host ''
Write-Host 'DONE - FULL TRAINING LOG EXPORT FINISHED' -ForegroundColor Green
$status | Format-Table -AutoSize
Write-Host "ZIP=$zip" -ForegroundColor Green
Write-Host "ZIP_SHA256=$zipSha" -ForegroundColor Green
Write-Host "HASH_FILE=$zip.sha256.txt" -ForegroundColor Green
Write-Host 'Do not delete the original L4 files until this ZIP has been copied off the VM and its hash verified.' -ForegroundColor Yellow
