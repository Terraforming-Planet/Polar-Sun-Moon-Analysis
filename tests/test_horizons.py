from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest
from _pytest.monkeypatch import MonkeyPatch

from polar_equinox_analysis.horizons import HorizonsClient, HorizonsResponseError
from polar_equinox_analysis.models import Observatory

SAMPLE_RESPONSE = """Target body name: Sun (10)
Date__(UT)__HR:MN, DEC, EL
$$SOE
2024-Mar-20 03:06, 0.123456, 12.5
$$EOE
"""


def test_parse_csv_rows_extracts_data_block() -> None:
    rows = HorizonsClient._parse_csv_rows(SAMPLE_RESPONSE)

    assert rows == [{"Date__(UT)__HR:MN": "2024-Mar-20 03:06", "DEC": "0.123456", "EL": "12.5"}]


def test_required_float_reports_missing_quantity() -> None:
    with pytest.raises(HorizonsResponseError, match="Required quantity unavailable"):
        HorizonsClient._required_float({"DEC": "n.a."}, ["DEC"])


def test_observer_ephemeris_uses_middle_row(monkeypatch: MonkeyPatch, tmp_path: Path) -> None:
    response = """Date__(UT)__HR:MN, DEC, EL
$$SOE
2024-Mar-20 03:05, -0.1, 1.0
2024-Mar-20 03:06, 0.0, 2.0
2024-Mar-20 03:07, 0.1, 3.0
$$EOE
"""
    client = HorizonsClient(cache_dir=tmp_path)
    monkeypatch.setattr(client, "fetch_text", lambda params: response)

    values = client.observer_ephemeris(
        "Sun",
        Observatory(name="North Pole", latitude=90.0),
        datetime(2024, 3, 20, 3, 6, tzinfo=UTC),
    )

    assert values == {"declination_deg": 0.0, "apparent_altitude_deg": 2.0}


def test_validate_raw_response_rejects_horizons_errors() -> None:
    with pytest.raises(HorizonsResponseError, match="Horizons reported an error"):
        HorizonsClient._validate_raw_response("$$SOE\nERROR: bad request\n$$EOE")
