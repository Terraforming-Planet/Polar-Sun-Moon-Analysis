from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "web" / "public" / "eclipse-live" / "index.html"
CLOSE = ROOT / "web" / "public" / "eclipse-live" / "close.html"
GALLERY = ROOT / "web" / "public" / "eclipse-live" / "gallery.html"
PAGES = ROOT / ".github" / "workflows" / "force-pages-deploy.yml"


def test_main_observer_exposes_night_ir_and_gallery() -> None:
    source = LIVE.read_text(encoding="utf-8")

    assert "🌙 Noktowizor + IR10.5 · CLOSE" in source
    assert 'href="./close.html"' in source
    assert 'href="./gallery.html"' in source


def test_close_night_mode_switches_to_official_eumetsat_ir() -> None:
    source = CLOSE.read_text(encoding="utf-8")

    assert "mtg_fd:ir105_hrfi" in source
    assert "mtg_fd:vis06_hrfi" in source
    assert "nightVision?'mtg_fd:ir105_hrfi':'mtg_fd:vis06_hrfi'" in source
    assert "EUMETSAT Meteosat-12 · IR 10.5 HRFI · NOC" in source
    assert "Nie jest lokalną kamerą IR" in source


def test_gallery_uses_only_archived_manifest_frames_for_animation() -> None:
    source = GALLERY.read_text(encoding="utf-8")

    assert "goes19-band02/manifest.json" in source
    assert "Animacja nie tworzy nowych danych" in source
    assert "f.source_url" in source
    assert "f.sha256" in source
    assert "showFrame(index+1)" in source
    assert "session.log" in source
    assert "capture.log" in source
    assert "provenance.log" in source


def test_pages_publish_retries_after_concurrent_main_updates() -> None:
    source = PAGES.read_text(encoding="utf-8")

    assert "for attempt in 1 2 3 4" in source
    assert "git fetch origin main" in source
    assert "git rebase origin/main" in source
    assert "git rebase --abort" in source
    assert "pages_publish=success" in source
