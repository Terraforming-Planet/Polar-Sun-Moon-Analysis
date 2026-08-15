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
        'id="duplicateSelected"',
        'id="sunAzimuth"',
        'id="sunElevation"',
        'id="materialBank"',
        "23.515002°N, 11.998501°E",
    ):
        assert marker in html


def test_sahara_station_uses_shadowed_3d_and_material_balance() -> None:
    js = SCRIPT.read_text(encoding="utf-8")

    assert "renderer.shadowMap.enabled = true" in js
    assert "TransformControls" in js
    assert "frustumVolume" in js
    assert "valleyOffsetAt" in js
    assert "bank: excavated - used" in js
    assert "Najpierw wykop dolinę" in js


def test_sahara_research_copy_separates_atlantic_paleoriver_context() -> None:
    html = PAGE.read_text(encoding="utf-8")

    assert "Tamanrasett / Tamanrasset" in html
    assert "→ Atlantyk" in html
    assert "Nie należy zaliczać jej do rzek uchodzących do Morza Śródziemnego." in html
