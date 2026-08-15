from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "web" / "public" / "sahara-station" / "index.html"
SCRIPT = ROOT / "web" / "public" / "sahara-station" / "sahara-lab.js"


def test_sahara_station_page_exposes_terrain_controls() -> None:
    html = PAGE.read_text(encoding="utf-8")

    for marker in (
        'id="viewer"',
        'id="digValley"',
        'id="buildMountain"',
        'id="createPair"',
        'id="duplicateSelected"',
        'id="sunAzimuth"',
        'id="sunElevation"',
        'id="optimizeShade"',
        'id="materialBank"',
        'id="waterStored"',
        'id="plantMode"',
        'id="plantSelectedValley"',
        "23.515002°N, 11.998501°E",
    ):
        assert marker in html


def test_sahara_station_uses_shadowed_3d_and_strict_material_pairing() -> None:
    js = SCRIPT.read_text(encoding="utf-8")

    assert "renderer.shadowMap.enabled = true" in js
    assert "TransformControls" in js
    assert "frustumVolume" in js
    assert "valleyOffsetAt" in js
    assert "bank: excavated - used" in js
    assert "findUnpairedValleyForShape" in js
    assert "Najpierw wykop dolinę" in js
    assert "Powielono pełną parę 1:1" in js


def test_sahara_station_has_water_vegetation_and_real_tree_scale_controls() -> None:
    html = PAGE.read_text(encoding="utf-8")
    js = SCRIPT.read_text(encoding="utf-8")

    assert 'id="rainScenario"' in html
    assert 'id="treeHeight"' in html
    assert 'id="showWater"' in html
    assert "heightM / 1000" in js
    assert "scenarioRetention" in js
    assert "updateWaterAndVegetation" in js
    assert "createTree" in js


def test_sahara_station_uses_local_images_and_screenshot_location() -> None:
    html = PAGE.read_text(encoding="utf-8")

    assert "./assets/desert-paleochannel-reference.webp" in html
    assert "./assets/western-sahara-topography.webp" in html
    assert "Trzeci przesłany screenshot nie jest publikowany w galerii" in html


def test_sahara_research_copy_separates_atlantic_paleoriver_context() -> None:
    html = PAGE.read_text(encoding="utf-8")

    assert "Tamanrasett / Tamanrasset" in html
    assert "→ Atlantyk" in html
    assert "Nie należy zaliczać tego systemu do rzek uchodzących do Morza Śródziemnego." in html
