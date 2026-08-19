param(
    [int]$TargetScenes = 200000,
    [int]$StartYear = 1990,
    [int]$EndYear = 2026
)

$ErrorActionPreference = 'Stop'
Write-Host "Terra Global Scene Scan / official USGS Landsat STAC"
Write-Host "Target unique scene records: $TargetScenes"
Write-Host "Years: $StartYear-$EndYear"
Write-Host "This stage is CPU/network metadata screening; it does not download full scenes."
python -m terra_research_node.global_scene_scan --target-scenes $TargetScenes --start-year $StartYear --end-year $EndYear
