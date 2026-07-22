from __future__ import annotations

import json
from pathlib import Path


def test_committed_2006_2024_archive_has_expected_shape() -> None:
    path = Path("web/public/data/observations.json")
    observations = json.loads(path.read_text(encoding="utf-8"))
    assert len(observations) == 19 * 2 * 2 * 2 == 152
    assert {row["year"] for row in observations} == set(range(2006, 2025))
    assert all(row["record_kind"] == "ephemeris" for row in observations)
    assert all(row["response_sha256"] for row in observations)
    assert all(-90 <= row["apparent_altitude_deg"] <= 90 for row in observations)
    assert all(-90 <= row["declination_deg"] <= 90 for row in observations)
