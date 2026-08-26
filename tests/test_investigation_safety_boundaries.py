from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLISHED = ROOT / "docs" / "investigation" / "index.html"
SOURCE = ROOT / "web" / "public" / "investigation" / "index.html"
SOURCE_APP = ROOT / "web" / "public" / "investigation" / "app.js"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_investigation_page_contains_authorization_and_safety_boundaries() -> None:
    for path in (PUBLISHED, SOURCE):
        text = _read(path)
        assert "Dostęp specjalny wymaga oficjalnych uprawnień" in text
        assert "rozpoznawanie twarzy" in text
        assert "bez wymaganej autoryzacji" in text
        assert "automatyczne przypisywanie winy" in text
        assert "wnioskowanie o poglądach politycznych" in text
        assert "wskazywanie celów do użycia siły" in text


def test_investigation_page_defines_rapid_emergency_authorization() -> None:
    for path in (PUBLISHED, SOURCE):
        text = _read(path)
        assert "RAPID EMERGENCY AUTHORIZATION" in text
        assert "maksymalnie 1 godziny" in text
        assert "skradziony pojazd" in text
        assert "porwaniem dziecka" in text
        assert "bezpośrednie zagrożenie" in text
        assert "celem operacyjnym systemu, nie obietnicą prawną" in text
        assert "nie może samodzielnie wybrać człowieka jako celu" in text


def test_investigation_runtime_explains_fast_data_vs_fast_authorization() -> None:
    text = _read(SOURCE_APP)
    assert "EMERGENCY RESPONSE SLA · FAST DATA, FAST DECISION" in text
    assert "co 3 sekundy, 15 sekund" in text
    assert "Godzina dotyczy biurokracji i decyzji, nie długości obserwacji" in text
    assert "faktyczną kadencję, opóźnienie, dostawcę i ograniczenia danych" in text
    assert "minimalny pakiet decyzyjny" in text
    assert "aktywnych oszustw telefonicznych lub internetowych" in text
    assert "publiczna Terra Observation nie przechwytuje prywatnych rozmów" in text
    assert "verify → authorize → observe → alert → expire → audit" in text


def test_investigation_page_surfaces_requested_public_good_case_families() -> None:
    for path in (PUBLISHED, SOURCE):
        text = _read(path)
        assert "Pilne odzyskanie skradzionego pojazdu" in text
        assert "Porwanie lub bezpośrednie zagrożenie życia" in text
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
        "RAPID EMERGENCY AUTHORIZATION",
        "AUTHENTICITY & SHARED REALITY",
        "PLANETARY SAFETY",
    ]
    for phrase in required:
        assert phrase in published
        assert phrase in source
