from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs" / "constellation" / "index.html"
WEB = ROOT / "web" / "public" / "constellation" / "index.html"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_tp26_training4_agentic_eo_section_is_published_in_both_copies() -> None:
    docs = _read(DOCS)
    web = _read(WEB)

    marker = 'id="tp26-training4-agentic-eo"'
    assert marker in docs
    assert marker in web
    for required in (
        "TRAINING #4 · MULTI-SENSOR SAR · AGENTIC EO",
        "Sentinel-1 C-band radar",
        "NASA OPERA RTC-S1",
        "JAXA PALSAR/PALSAR-2",
        "Terra Agentic EO",
        "EVE-Instruct",
        "does not imply partnership, endorsement or privileged access",
    ):
        assert required in docs
        assert required in web


def test_tp26_training4_section_keeps_planned_work_distinct_from_existing_work() -> None:
    page = _read(DOCS)

    assert "are already used by the project" in page
    assert "plans independent cross-sensor checks" in page
    assert "The planned large-stream experiment" in page
    assert "up to 500,000 training patches" in page
    assert "gated by calibration, a 20k-patch smoke run" in page


def test_tp26_training4_publication_does_not_claim_provider_affiliation() -> None:
    for page_path in (DOCS, WEB):
        page = _read(page_path)
        assert "independent open-source research" in page
        assert "does not imply partnership, endorsement or privileged access" in page
        assert "The purpose is not to declare a winner." in page
