import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CASEBOOK = ROOT / "web" / "public" / "data" / "hydrology" / "global-water-casebook.json"


def test_casebook_has_validated_baseline_and_sahara_context() -> None:
    data = json.loads(CASEBOOK.read_text(encoding="utf-8"))
    cases = data["cases"]

    assert len(cases) >= 11
    ids = [case["id"] for case in cases]
    assert len(ids) == len(set(ids))
    assert "sahara-african-humid-period" in ids
    assert data["targets"]["next_milestones"] == [100, 1000, 10000]


def test_every_case_keeps_provenance_and_no_automatic_diagnosis() -> None:
    data = json.loads(CASEBOOK.read_text(encoding="utf-8"))
    assert "not automatic diagnoses" in data["purpose"]

    for case in data["cases"]:
        assert case["name"]
        assert case["mechanisms"]
        assert case["observed_pattern"]
        assert case["management_lesson"]
        assert case["evidence_class"].startswith("validated_")
        assert case["source_urls"]
        for url in case["source_urls"]:
            parsed = urlparse(url)
            assert parsed.scheme == "https"
            assert parsed.netloc
