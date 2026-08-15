from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "web" / "public" / "sahara-station" / "index.html"
SCRIPT = ROOT / "web" / "public" / "sahara-station" / "sahara-lab.js"
DOCS_SCRIPT = ROOT / "docs" / "sahara-station" / "sahara-lab.js"


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


def test_sahara_station_uses_cube_chess_512_spatial_engine() -> None:
    js = SCRIPT.read_text(encoding="utf-8")

    assert "const BOARD_SIZE = 8" in js
    assert "const TOTAL_LEVELS = 8" in js
    assert "BOARD_SIZE ** 2 * TOTAL_LEVELS" in js
    assert "8 × 8 × 8" in js
    assert "CubeChess512SpatialEngine" in js
    assert "THREE.InstancedMesh" in js
    assert "function buildGrid512()" in js
    assert "function worldToGridCell" in js
    assert "function updateGridOccupancy" in js
    assert "GRID 512" in js


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


def test_sahara_station_seeds_arctic_reference_mountain_and_valley() -> None:
    js = SCRIPT.read_text(encoding="utf-8")

    assert "function arcticReferenceShape()" in js
    assert "const base = 20" in js
    assert "height = 8" in js
    assert "function arcticMountainGeometry" in js
    assert "function seedInitialSaharaScene()" in js
    assert "createValley(shape,18,-11)" in js.replace(" ", "")
    assert "createMountain(shape,0,0" in js.replace(" ", "")
    assert "bind('digValley','click'" in js.replace(" ", "")
    assert "bind('buildMountain','click'" in js.replace(" ", "")


def test_sahara_station_loads_public_copernicus_dem_with_safe_fallback() -> None:
    js = SCRIPT.read_text(encoding="utf-8")

    assert "COPERNICUS_DEM_90M" in js
    assert "copernicus-dem-90m.s3.amazonaws.com" in js
    assert "Copernicus_DSM_COG_30_" in js
    assert "function copernicusTileUrl" in js
    assert "async function loadCopernicusDem" in js
    assert "readRasters" in js
    assert "resampleMethod:'bilinear'" in js.replace(" ", "")
    assert "fallbackTerrainHeight" in js
    assert "DEM Copernicus chwilowo niedostępny" in js


def test_sahara_station_has_water_vegetation_and_real_tree_scale_controls() -> None:
    html = PAGE.read_text(encoding="utf-8")
    js = SCRIPT.read_text(encoding="utf-8")

    assert 'id="rainScenario"' in html
    assert 'id="treeHeight"' in html
    assert 'id="showWater"' in html
    assert "heightM/1000" in js.replace(" ", "")
    assert "scenarioRetention" in js
    assert "updateWaterAndVegetation" in js
    assert "createTree" in js


def test_sahara_station_docs_and_web_runtime_are_identical() -> None:
    assert SCRIPT.read_text(encoding="utf-8") == DOCS_SCRIPT.read_text(encoding="utf-8")


def test_sahara_station_uses_local_images_and_screenshot_location() -> None:
    html = PAGE.read_text(encoding="utf-8")

    assert "./assets/desert-paleochannel-reference.webp" in html
    assert "./assets/western-sahara-topography.webp" in html
    assert "Trzeci przesłany screenshot nie jest publikowany w galerii" in html


def test_sahara_research_copy_separates_atlantic_paleoriver_context() -> None:
    html = PAGE.read_text(encoding="utf-8")

    assert "Tamanrasett / Tamanrasset" in html
    assert "→ Atlantyk" in html
    expected = "Nie należy zaliczać tego systemu do rzek uchodzących do Morza Śródziemnego."
    assert expected in html
