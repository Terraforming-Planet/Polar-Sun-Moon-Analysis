from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "sahara-station"
DOCS = ROOT / "docs" / "sahara-station"
DATA = ROOT / "data" / "training" / "paleoriver_8"


def test_global_dem_tile_engine_is_published_with_web_docs_parity() -> None:
    web = (WEB / "sahara-global-dem-tiles.js").read_text(encoding="utf-8")
    docs = (DOCS / "sahara-global-dem-tiles.js").read_text(encoding="utf-8")

    assert web == docs
    assert "class GlobalDemTileEngine" in web
    assert "copernicus-dem-90m.s3.amazonaws.com" in web
    assert "globalDemNeighborhood" in web
    assert "Promise.allSettled" in web
    assert "sampleCache" in web
    assert "frustumCulled = true" in web


def test_global_dem_uses_small_camera_centered_neighborhood_and_two_lods() -> None:
    source = (WEB / "sahara-global-dem-tiles.js").read_text(encoding="utf-8")

    assert "radiusTiles = 1" in source
    assert "sampleSize: 9" in source
    assert "sampleSize: 17" in source
    assert "cameraDistance < 8.8" in source
    assert "BATCH_SIZE = 3" in source
    assert "globalny DEM LOD" in source


def test_globe_integrates_global_dem_without_removing_regional_hydrology_overlay() -> None:
    web = (WEB / "sahara-globe.js").read_text(encoding="utf-8")
    docs = (DOCS / "sahara-globe.js").read_text(encoding="utf-8")

    assert web == docs
    assert "./sahara-global-dem-tiles.js" in web
    assert "new GlobalDemTileEngine" in web
    assert "globalDem.setFocus" in web
    assert "globalDem.updateForCamera" in web
    assert "new RegionalDemOverlay" in web
    assert "demOverlay.setPlace" in web


def test_iteration_12_note_does_not_claim_full_dem_residency_or_physical_exaggeration() -> None:
    note = (DATA / "research_note_iteration_12.md").read_text(encoding="utf-8")

    assert "not a claim that the complete Earth DEM is resident in memory" in note
    assert "only a small neighbourhood is fetched and rendered" in note
    assert "changes the display only" in note
    assert "original Copernicus elevation values should never be overwritten" in note
