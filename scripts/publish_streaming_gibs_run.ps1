param(
    [string]$RunDir = '',
    [switch]$PrepareGitBranch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

$python = Join-Path $repoRoot '.venv-l4\Scripts\python.exe'
if (-not (Test-Path $python)) {
    throw "Python environment not found: $python"
}

if (-not $RunDir) {
    $candidate = Get-ChildItem (Join-Path $repoRoot 'research_runs') -Directory -Filter 'stream_gibs_*' |
        Where-Object { Test-Path (Join-Path $_.FullName 'metrics.json') } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $candidate) {
        throw 'No completed stream_gibs_* run was found.'
    }
    $RunDir = $candidate.FullName
}

$resolvedRun = (Resolve-Path $RunDir).Path
$runName = Split-Path $resolvedRun -Leaf

if ($PrepareGitBranch) {
    $trackedChanges = git status --porcelain --untracked-files=no
    if ($trackedChanges) {
        throw 'Tracked working-tree changes already exist. Commit/stash them before -PrepareGitBranch.'
    }
    $branch = "publish-$runName"
    git switch -c $branch
}

& $python '.\scripts\publish_streaming_gibs_run.py' '--run-dir' $resolvedRun
if ($LASTEXITCODE -ne 0) {
    throw "Streaming report publisher failed with exit code $LASTEXITCODE"
}

$publication = "published/training-runs/$runName"
Write-Host '=== STREAMING TRAINING #3 REPORT READY ===' -ForegroundColor Green
Write-Host "Run: $resolvedRun" -ForegroundColor Cyan
Write-Host "Publication: $publication" -ForegroundColor Cyan
Write-Host "Full logs ZIP: research_runs/${runName}_FULL_LOGS.zip" -ForegroundColor Cyan

if ($PrepareGitBranch) {
    git add -- $publication web/index.html
    git commit -m "Publish L4 streaming training #3"
    git push -u origin $branch
    Write-Host "Branch pushed: $branch" -ForegroundColor Green
    Write-Host 'Ask ChatGPT to open the PR from this branch after CI validation.' -ForegroundColor Yellow
}
