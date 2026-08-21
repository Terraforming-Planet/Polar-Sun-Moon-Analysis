from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "web" / "public" / "eclipse-live" / "index.html"
CLOSE = ROOT / "web" / "public" / "eclipse-live" / "close.html"
REPLAY = ROOT / "web" / "public" / "eclipse-live" / "replay-2026.html"
GALLERY = ROOT / "web" / "public" / "eclipse-live" / "gallery.html"
PAGES = ROOT / ".github" / "workflows" / "force-pages-deploy.yml"


def test_main_observatory_exposes_historical_archive_and_gallery() -> None:
    source = LIVE.read_text(encoding="utf-8")

    assert "Historyczny model CLOSE" in source
    assert 'href="./close.html"' in source
    assert 'href="./gallery.html"' in source
    assert "Zamknięta kampania obserwacyjna 2026" in source


def test_legacy_close_is_archive_redirect_and_replay_has_no_live_timer() -> None:
    close = CLOSE.read_text(encoding="utf-8")
    replay = REPLAY.read_text(encoding="utf-8")

    assert "./replay-2026.html" in close
    assert "To nie jest LIVE." in replay
    assert "new Date(frame.observed_utc)" in replay
    assert "setInterval" not in replay
    assert "Kampania 12.08.2026 jest zamknięta" in replay


def test_current_eumetsat_noaa_context_is_separate_from_2026_replay() -> None:
    source = LIVE.read_text(encoding="utf-8")

    assert "mtg_fd:vis06_hrfi" in source
    assert "Aktualny kontekst atmosferyczny — EUMETSAT + NOAA" in source
    assert "nie jest prognozą pogody na 2027" in source
    assert "GOES19/ABI/FD/02/1808x1808.jpg" in source


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
