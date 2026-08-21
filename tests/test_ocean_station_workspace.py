from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OCEAN_JS = ROOT / "docs" / "ocean-station" / "ocean-lab.js"
OCEAN_CSS = ROOT / "docs" / "ocean-station" / "ocean-lab.css"


def test_ocean_station_has_explicit_mouse_and_touch_navigation() -> None:
    source = OCEAN_JS.read_text(encoding="utf-8")

    assert "controls.mouseButtons.RIGHT = THREE.MOUSE.PAN" in source
    assert "controls.touches.TWO = THREE.TOUCH.DOLLY_PAN" in source
    assert "moved > 7" in source
    assert "pointerup" in source


def test_ocean_station_supports_numbered_markers_and_private_workspace_save() -> None:
    source = OCEAN_JS.read_text(encoding="utf-8")

    assert "terra-ocean-station-workspace" in source
    assert "raw-assistant-prompts-excluded" in source
    assert "localStorage.setItem(STORAGE_KEY" in source
    assert "Eksport JSON" in source
    assert "addUserMarker" in source
    assert "To adnotacja użytkownika, nie automatyczny pomiar naukowy" in source


def test_ocean_station_workspace_is_large_and_illuminated_on_mobile() -> None:
    source = OCEAN_CSS.read_text(encoding="utf-8")

    assert "min-height:700px" in source
    assert "height:78vh" in source
    assert "height:74vh;min-height:600px" in source
    assert ".workspace-toolbar" in source
    assert ".workspace-privacy" in source
