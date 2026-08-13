import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CASEBOOK = ROOT / "web" / "public" / "data" / "hydrology" / "global-water-casebook.json"


def load_casebook() -> dict[str, object]:
    return json.loads(CASEBOOK.read_text(encoding="utf-8"))


def test_casebook_keeps_validated_and_candidate_records_separate() -> None:
    data = load_casebook()
    cases = data["cases"]
    candidate_queue = data["candidate_queue"]

    assert isinstance(cases, list)
    assert isinstance(candidate_queue, list)
    assert len(cases) == data["targets"]["validated_now"] == 21  # type: ignore[index]
    assert len(candidate_queue) == data["targets"]["candidate_now"] == 0  # type: ignore[index]
    assert all(case["record_status"] == "validated_case" for case in cases)
    assert all(item.get("record_status") == "candidate_case" for item in candidate_queue)
    assert data["targets"]["next_milestones"] == [100, 1000, 10000]  # type: ignore[index]


def test_every_validated_case_has_https_provenance() -> None:
    data = load_casebook()
    cases = data["cases"]

    ids = [case["id"] for case in cases]
    assert len(ids) == len(set(ids))
    assert "sahara-african-humid-period" in ids

    for case in cases:
        urls = case.get("source_urls")
        assert isinstance(urls, list) and urls, case["id"]
        for url in urls:
            parsed = urlparse(url)
            assert parsed.scheme == "https" and parsed.netloc, (case["id"], url)
        assert case.get("observed_pattern")
        assert case.get("management_lesson")
        assert case.get("mechanisms")
        assert str(case.get("evidence_class", "")).startswith("validated_")


def test_casebook_contains_key_olszowka_analogue_mechanisms() -> None:
    data = load_casebook()
    text = json.dumps(data["cases"], ensure_ascii=False).lower()

    for mechanism in (
        "hydraulic",
        "silt",
        "drought",
        "groundwater",
        "diversion",
        "outflow",
        "water quality",
        "restoration",
    ):
        assert mechanism in text


def test_casebook_does_not_turn_analogy_into_automatic_diagnosis() -> None:
    data = load_casebook()
    assert "not automatic diagnoses" in str(data["purpose"])
    assert "local hydrological" in data["validation_policy"]["intervention_notice"]  # type: ignore[index]
