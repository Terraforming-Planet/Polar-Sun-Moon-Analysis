import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data" / "hydrology"
BATCH = DATA / "global-water-casebook-batch-07.json"
PAGE = ROOT / "web" / "public" / "water-casebook" / "batch-07.html"


def test_batch_07_has_ten_validated_unique_cases_with_https_provenance() -> None:
    document = json.loads(BATCH.read_text(encoding="utf-8"))
    rows = document["cases"]
    assert document["record_status"] == "validated_case"
    assert len(rows) == 10
    ids = [row["id"] for row in rows]
    assert len(ids) == len(set(ids))
    assert all(row["record_status"] == "validated_case" for row in rows)

    for case in rows:
        provenance = case["provenance"]
        assert provenance
        for source in provenance:
            assert source["publisher"]
            assert source["title"]
            assert source["publication_date"]
            assert source["supports"]
            parsed = urlparse(source["url"])
            assert parsed.scheme == "https" and parsed.netloc


def test_batch_07_covers_olszowka_relevant_water_mechanisms() -> None:
    text = BATCH.read_text(encoding="utf-8").lower()
    for term in (
        "groundwater",
        "inflow",
        "hydraulic connectivity",
        "sediment",
        "drought",
        "water quality",
        "restoration",
        "salinity",
        "monitoring",
    ):
        assert term in text


def test_batch_07_static_page_is_published_and_points_to_machine_data() -> None:
    source = PAGE.read_text(encoding="utf-8")
    assert "przypadki 62–71" in source
    assert "global-water-casebook-batch-07.json" in source
    assert "Analogia nie jest diagnozą" in source
