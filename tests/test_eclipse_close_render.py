from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "web" / "public" / "eclipse-live" / "close.html"


def test_close_view_uses_nasa_besselian_crescent_overlay() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "MODEL NASA GSFC · lokalna faza · NIE FOTOGRAFIA" in source
    assert 'id="close-sun"' in source
    assert 'id="close-moon"' in source
    assert "function updateOverlay(s)" in source
    assert "scale=sunR/s.rSun" in source
    assert "mx=cx+s.dx*scale" in source
    assert "my=cy-s.dy*scale" in source
    assert "mr=s.rMoon*scale" in source


def test_close_view_disables_misleading_cesium_bodies() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "viewer.scene.sun.show=false" in source
    assert "viewer.scene.moon.show=false" in source
    assert "viewer.camera.frustum.fov=rad(5)" in source
    assert "aimClose()" in source
    assert "setInterval(tick,1000)" in source


def test_close_view_keeps_real_satellite_sources_separate() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "mtg_fd:vis06_hrfi" in source
    assert "mtg_fd:ir105_hrfi" in source
    assert "GOES19/ABI/FD/02/1808x1808.jpg" in source
    assert "Prawdziwy kanał widzialny Europy" in source
    assert "IR10.5 i VIS0.6 to prawdziwe warstwy satelitarne EUMETSAT" in source
    assert ".raw img{width:100%" in source


def test_close_view_has_local_night_vision_without_touching_raw_images() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert 'id="night-toggle"' in source
    assert 'id="night-overlay"' in source
    assert ".night-vision .cesium canvas" in source
    assert "function applyNightVision()" in source
    assert "Zielony „noktowizor” jest tylko filtrem UI" in source
    assert "Nie jest lokalną kamerą IR" in source
    assert ".raw img{width:100%" in source
