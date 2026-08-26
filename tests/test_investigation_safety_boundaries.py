from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLISHED = ROOT / "docs" / "investigation" / "index.html"
SOURCE = ROOT / "web" / "public" / "investigation" / "index.html"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_investigation_page_contains_authorization_and_safety_boundaries() -> None:
    for path in (PUBLISHED, SOURCE):
        text = _read(path)
        assert "Dostęp specjalny wymaga oficjalnych uprawnień" in text
        assert "rozpoznawanie twarzy" in text
        assert "śledzenie konkretnej osoby" in text
        assert "automatyczne przypisywanie winy" in text
        assert "wnioskowanie o poglądach politycznych" in text
        assert "wskazywanie celów do użycia siły" in text


def test_investigation_page_surfaces_requested_public_good_case_families() -> None:
    for path in (PUBLISHED, SOURCE):
        text = _read(path)
        assert "Zabójstwo lub poważne przestępstwo" in text
        assert "Korupcja lub nadużycia infrastrukturalne" in text
        assert "Przestępczość zorganizowana" in text
        assert "rezerwatu lub obszaru chronionego" in text
        assert "AI/deepfake" in text
        assert "Konflikt lub kryzys humanitarny" in text


def test_investigation_page_keeps_claims_evidence_first() -> None:
    for path in (PUBLISHED, SOURCE):
        text = _read(path)
        assert "nie wskazywać automatycznie winnych" in text
        assert "nie podejmuje decyzji politycznych ani militarnych" in text
        assert "nie zastępować sąd, śledczego, ratownika, naukowca" in text
        assert "satelita samodzielnie potrafi rozstrzygnąć autentyczność każdego filmu" in text


def test_public_and_source_pages_share_core_investigation_copy() -> None:
    published = _read(PUBLISHED)
    source = _read(SOURCE)
    required = [
        "GEOFORENSICS · PUBLIC EVIDENCE · HUMAN SAFETY",
        "PUBLIC DEMO · RESTRICTED OPERATIONS",
        "AUTHENTICITY & SHARED REALITY",
        "PLANETARY SAFETY",
    ]
    for phrase in required:
        assert phrase in published
        assert phrase in source
