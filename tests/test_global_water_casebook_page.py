from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "web" / "public" / "water-casebook" / "index.html"


def test_casebook_page_loads_registry_and_keeps_safety_notice() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "global-water-casebook.json" in source
    assert "global-water-casebook-batch-07.json" in source
    assert "global-water-casebook-batch-08.json" in source
    assert "analogia nie jest diagnozą" in source.lower()
    assert "Nie zalecamy samodzielnego przekopywania" in source
    assert "safeUrl" in source
    assert "https:" in source


def test_casebook_page_links_back_to_local_observatory() -> None:
    source = PAGE.read_text(encoding="utf-8")
    assert 'href="../water-local/"' in source
