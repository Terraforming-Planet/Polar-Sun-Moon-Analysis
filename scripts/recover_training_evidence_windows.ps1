param(
    [string]$OutputRoot = '',
    [switch]$DeepScan
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
if (-not $OutputRoot) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    if (-not $desktop) { $desktop = $env:TEMP }
    $OutputRoot = Join-Path $desktop "Terra-Training-Evidence-Recovery-$timestamp"
}
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$knownArchives = @{
    '20260819T202428Z_FULL_LOGS.zip' = '71B44F6151BBB8992795A144CC222C7A5D7E7D244A6183DED1758D1F230571212'
    'stream_gibs_20260820T013036Z_FULL_LOGS.zip' = '40128DD94E8AEF7282835387625DEF270CF0F34F261775683C603EBFFD7F9F08'
}

$repoCandidates = @(
    'C:\TP\Polar-Sun-Moon-Analysis',
    'C:\Users\xodobrox\Polar-Sun-Moon-Analysis'
) | Where-Object { Test-Path $_ }

$priorityNames = @(
    '*_FULL_LOGS.zip',
    '*_FULL_LOGS.zip.sha256.txt',
    'FULL-CONSOLE.log',
    'POWERSHELL-TRANSCRIPT.log',
    'evidence-manifest.json',
    'SHA256SUMS.txt',
    'training-metrics-extract.txt',
    'cuda-preflight.txt',
    'nvidia-smi-before.txt',
    'nvidia-smi-after.txt',
    'exit-code.txt',
    'git-commit.txt',
    'python-packages.txt',
    'metrics.json',
    'summary.json',
    'analysis.json',
    'training_manifest.json',
    'site_corpus_manifest.json',
    'gpu_audit_summary.json',
    'gpu_image_audit.jsonl',
    'stream_failures.jsonl',
    'source_manifest.json',
    'run_training004_cached_gpu_l4.py',
    'gpu1h.ps1',
    'gpu_parameter_golf.ps1'
)

$results = New-Object System.Collections.Generic.List[object]
$seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

function Add-EvidenceFile {
    param([System.IO.FileInfo]$File)
    if (-not $File -or -not $File.Exists) { return }
    if (-not $seen.Add($File.FullName)) { return }

    $hash = $null
    $hashStatus = 'not-checked'
    try {
        $hash = (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash.ToUpperInvariant()
        $hashStatus = 'computed'
        if ($knownArchives.ContainsKey($File.Name)) {
            if ($hash -eq $knownArchives[$File.Name]) {
                $hashStatus = 'KNOWN-HASH-MATCH'
            } else {
                $hashStatus = 'KNOWN-HASH-MISMATCH'
            }
        }
    } catch {
        $hashStatus = "hash-error: $($_.Exception.Message)"
    }

    $results.Add([pscustomobject]@{
        Path = $File.FullName
        Name = $File.Name
        SizeBytes = $File.Length
        LastWriteTimeUtc = $File.LastWriteTimeUtc.ToString('o')
        SHA256 = $hash
        HashStatus = $hashStatus
    })
}

function Scan-Root {
    param([string]$Root)
    if (-not (Test-Path $Root)) { return }
    Write-Host "Scanning: $Root" -ForegroundColor Cyan

    foreach ($pattern in $priorityNames) {
        Get-ChildItem -LiteralPath $Root -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue |
            ForEach-Object { Add-EvidenceFile $_ }
    }
}

foreach ($repo in $repoCandidates) {
    Scan-Root $repo
}

# Strongly targeted fallback locations used by the project and prior runs.
$targetedRoots = @(
    'C:\TP',
    'C:\Users\xodobrox',
    'C:\Users\Public',
    'D:\TP',
    'D:\Users\xodobrox'
) | Where-Object { Test-Path $_ }
foreach ($root in $targetedRoots) {
    if ($repoCandidates -notcontains $root) { Scan-Root $root }
}

if ($DeepScan) {
    Write-Host 'DeepScan enabled: searching all fixed drives. This can take a while.' -ForegroundColor Yellow
    Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
        Scan-Root ($_.DeviceID + '\')
    }
}

# Copy only evidence/log/manifest/source artifacts. Do not copy secrets or entire repositories.
$copyRoot = Join-Path $OutputRoot 'evidence-files'
New-Item -ItemType Directory -Force -Path $copyRoot | Out-Null

$copyIndex = 0
foreach ($item in $results) {
    $copyIndex++
    $safeName = ('{0:D4}_{1}' -f $copyIndex, $item.Name)
    $dest = Join-Path $copyRoot $safeName
    try {
        Copy-Item -LiteralPath $item.Path -Destination $dest -Force
    } catch {
        Write-Warning "Copy failed: $($item.Path) :: $($_.Exception.Message)"
    }
}

$resultsArray = @($results)
$resultsArray | Export-Csv -NoTypeInformation -Encoding UTF8 (Join-Path $OutputRoot 'recovery-index.csv')
$resultsArray | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 (Join-Path $OutputRoot 'recovery-index.json')

$knownCheck = foreach ($name in $knownArchives.Keys) {
    $matches = @($resultsArray | Where-Object { $_.Name -eq $name })
    [pscustomobject]@{
        Archive = $name
        ExpectedSHA256 = $knownArchives[$name]
        FoundCount = $matches.Count
        VerifiedMatches = @($matches | Where-Object { $_.HashStatus -eq 'KNOWN-HASH-MATCH' }).Count
        Mismatches = @($matches | Where-Object { $_.HashStatus -eq 'KNOWN-HASH-MISMATCH' }).Count
        Paths = @($matches.Path)
    }
}
$knownCheck | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 (Join-Path $OutputRoot 'known-archive-verification.json')

$training4Evidence = @($resultsArray | Where-Object {
    $_.Path -match 'training004_gpu_ssl_one_hour' -or
    $_.Path -match '\\evidence-\d{8}T\d{6}Z\\'
})
$training4Evidence | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 (Join-Path $OutputRoot 'training004-evidence-index.json')

$hashTargets = Get-ChildItem -LiteralPath $OutputRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne 'RECOVERY-SHA256SUMS.txt' }
$hashLines = foreach ($file in $hashTargets) {
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $relative = $file.FullName.Substring($OutputRoot.Length).TrimStart('\')
    "$hash  $relative"
}
$hashLines | Set-Content -Encoding ASCII (Join-Path $OutputRoot 'RECOVERY-SHA256SUMS.txt')

$zipPath = "$OutputRoot.zip"
if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -LiteralPath $OutputRoot -DestinationPath $zipPath -Force
$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
"$zipHash  $([System.IO.Path]::GetFileName($zipPath))" |
    Set-Content -Encoding ASCII "$zipPath.sha256.txt"

Write-Host ''
Write-Host 'TERRA TRAINING EVIDENCE RECOVERY COMPLETE' -ForegroundColor Green
Write-Host "Files indexed: $($resultsArray.Count)" -ForegroundColor Green
Write-Host "Recovery folder: $OutputRoot" -ForegroundColor Cyan
Write-Host "Recovery ZIP: $zipPath" -ForegroundColor Cyan
Write-Host "Recovery ZIP SHA-256: $zipHash" -ForegroundColor Cyan
Write-Host ''
Write-Host 'Known archive verification:' -ForegroundColor Yellow
foreach ($row in $knownCheck) {
    Write-Host "  $($row.Archive): found=$($row.FoundCount), verified=$($row.VerifiedMatches), mismatches=$($row.Mismatches)"
}
Write-Host "Training #4 evidence files found: $($training4Evidence.Count)" -ForegroundColor Yellow
Write-Host 'Nothing was deleted or modified in the original training directories.' -ForegroundColor Green
