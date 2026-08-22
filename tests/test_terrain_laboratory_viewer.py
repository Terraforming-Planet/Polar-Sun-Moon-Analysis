from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TERRAIN = ROOT / "web" / "src" / "ResearchTerrainLab.tsx"
TERRAIN_CSS = ROOT / "web" / "src" / "research-terrain-lab.css"
VIEWER_MODEL = ROOT / "web" / "src" / "lib" / "terrainLabViewer.ts"


def test_terrain_viewer_has_explicit_non_black_fallback_states() -> None:
    source = TERRAIN.read_text(encoding="utf-8")
    css = TERRAIN_CSS.read_text(encoding="utf-8")
    model = VIEWER_MODEL.read_text(encoding="utf-8")

    assert "terrain-fallback-map" in source
    assert "terrain-viewer-state" in source
    assert "data-viewer-phase" in source
    assert "IMAGE_ATTEMPT_TIMEOUT_MS" in source
    assert "ResizeObserver" in source
    assert "document.addEventListener('toggle', refreshSize, true)" in source
    assert "'loading' | 'ready' | 'fallback-ready' | 'error'" in model
    assert "FALLBACK READY" in model
    assert "background-color:#dcebf2" in css
    assert ".terrain-imagery{position:absolute" in css
    assert ".terrain-imagery.loaded{opacity:1}" in css


def test_terrain_viewer_keeps_existing_research_tools() -> None:
    source = TERRAIN.read_text(encoding="utf-8")

    assert "⚑ Flag + elevation" in source
    assert "✎ Draw line" in source
    assert "Add 3 Nile reference points" in source
    assert ">Clear</button>" in source
    assert "Copernicus Sentinel-2 · highest detail" in source
    assert "NASA VIIRS · recent global" in source
    assert "NASA MODIS · historical" in source
    assert "Image size" in source
    assert "Open technical 3D Earth" in source


def test_terrain_river_arrows_use_public_topology_and_dem_not_random_direction() -> None:
    source = TERRAIN.read_text(encoding="utf-8")
    model = VIEWER_MODEL.read_text(encoding="utf-8")

    assert "Show river flow arrows" in source
    assert "useState(true)" in source
    assert 'way["waterway"="river"]' in source
    assert "Natural Earth 1:50m major rivers" in source
    assert "fetchResearchElevations" in source
    assert "Copernicus DEM slope" in source
    assert "markerMid=\"url(#terrain-river-arrow)\"" in source
    assert "markerEnd=\"url(#terrain-river-arrow)\"" in source
    assert "No random arrows were drawn" in source
    assert "element?.tags?.waterway !== 'river'" in model
    assert "topologyDownstream" in model
    assert "directionSource: 'dem'" in model


def test_terrain_async_requests_have_abort_and_version_guards() -> None:
    source = TERRAIN.read_text(encoding="utf-8")
    model = VIEWER_MODEL.read_text(encoding="utf-8")

    assert "new AbortController()" in source
    assert "riverRequestVersion" in source
    assert "requestVersion !== riverRequestVersion.current" in source
    assert "RIVER_REQUEST_TIMEOUT_MS" in source
    assert "event.requestKey !== state.requestKey" in model
    assert "event.candidateIndex !== state.candidateIndex" in model
