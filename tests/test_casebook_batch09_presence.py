import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "web/public/data/hydrology/global-water-casebook-batch-09.json"
PAGE = ROOT / "web/public/water-casebook/index.html"


def test_batch09_is_validated_and_loaded() -> None:
    data = json.loads(BATCH.read_text(encoding="utf-8"))
    rows = data["cases"]
    assert len(rows) == 10
    assert all(row["record_status"] == "validated_case" for row in rows)
    assert len({row["id"] for row in rows}) == 10
    assert "global-water-casebook-batch-09.json" in PAGE.read_text(encoding="utf-8")
