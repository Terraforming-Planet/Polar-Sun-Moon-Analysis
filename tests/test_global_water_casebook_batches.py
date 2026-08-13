import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "web" / "public" / "data" / "hydrology"
BASE = DATA_DIR / "global-water-casebook.json"
BATCHES = [
    DATA_DIR / "global-water-casebook-batch-03.json",
    DATA_DIR / "global-water-casebook-batch-04.json",
]
PAGE = ROOT / "web" / "public" / "water-casebook" / "index.html"


def _load(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _validated_cases() -> list[dict[str, object]]:
    documents = [_load(BASE), *(_load(path) for path in BATCHES)]
    cases: list[dict[str, object]] = []
    for document in documents:
        rows = document.get("cases")
        assert isinstance(rows, list)
        for row in rows:
            assert isinstance(row, dict)
            if row.get("record_status") == "validated_case":
                cases.append(row)
    return cases


def test_batches_add_ten_validated_cases_each_without_duplicate_ids() -> None:
    for path in BATCHES:
        batch = _load(path)
        rows = batch["cases"]
        assert isinstance(rows, list)
        assert len(rows) == 10, path.name
        assert all(row["record_status"] == "validated_case" for row in rows)

    cases = _validated_cases()
    ids = [str(case["id"]) for case in cases]
    assert len(cases) == 41
    assert len(ids) == len(set(ids))


def test_all_incremental_batches_have_full_https_provenance() -> None:
    for path in BATCHES:
        batch = _load(path)
        rows = batch["cases"]
        assert isinstance(rows, list)

        for case in rows:
            provenance = case.get("provenance")
            assert isinstance(provenance, list) and provenance, case["id"]
            for source in provenance:
                assert isinstance(source, dict)
                assert source.get("publisher")
                assert source.get("title")
                assert source.get("publication_date")
                assert source.get("supports")
                url = source.get("url")
                assert isinstance(url, str)
                parsed = urlparse(url)
                assert parsed.scheme == "https" and parsed.netloc, (case["id"], url)


def test_latest_batch_expands_olszowka_relevant_mechanisms() -> None:
    text = json.dumps(_load(BATCHES[-1]), ensure_ascii=False).lower()
    for mechanism in (
        "hydraulic",
        "inflow",
        "diversion",
        "evaporation",
        "sediment",
        "water quality",
        "restoration",
        "wetland",
    ):
        assert mechanism in text


def test_casebook_page_loads_batches_and_only_renders_validated_records() -> None:
    source = PAGE.read_text(encoding="utf-8")
    for path in BATCHES:
        assert path.name in source
    assert "record_status==='validated_case'" in source
    assert "Promise.allSettled" in source
    assert "candidate_case" in source
