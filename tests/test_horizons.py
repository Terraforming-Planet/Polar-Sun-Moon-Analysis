from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest
from _pytest.monkeypatch import MonkeyPatch

from polar_equinox_analysis.horizons import HorizonsClient, HorizonsResponseError
from polar_equinox_analysis.models import Observatory

SAMPLE_RESPONSE = """Target body name: Sun (10)
Date__(UT)__HR:MN, DEC_(a-app), Elev_(a-app)
$$SOE
2024-Mar-20 03:06, 0.123456, 12.5
$$EOE
"""


def test_parse_csv_rows_extracts_data_block() -> None:
    rows = HorizonsClient._parse_csv_rows(SAMPLE_RESPONSE)

    assert rows == [
        {
            "Date__(UT)__HR:MN": "2024-Mar-20 03:06",
            "DEC_(a-app)": "0.123456",
            "Elev_(a-app)": "12.5",
        }
    ]


def test_required_float_reports_missing_quantity() -> None:
    with pytest.raises(HorizonsResponseError, match="Required quantity unavailable"):
        HorizonsClient._required_float({"DEC": "n.a."}, ["DEC"])


def test_observer_ephemeris_uses_middle_row(monkeypatch: MonkeyPatch, tmp_path: Path) -> None:
    response = """Date__(UT)__HR:MN, DEC_(a-app), Elev_(a-app)
$$SOE
2024-Mar-20 03:05, -0.1, 1.0
2024-Mar-20 03:06, 0.0, 2.0
2024-Mar-20 03:07, 0.1, 3.0
2024-Mar-20 03:07, 0.1, 3.0
$$EOE
"""
    captured_params: dict[str, object] = {}
    client = HorizonsClient(cache_dir=tmp_path)

    def fake_fetch(params: dict[str, object]) -> str:
        captured_params.update(params)
        return response

    monkeypatch.setattr(client, "fetch_text", fake_fetch)

    values = client.observer_ephemeris(
        "Sun",
        Observatory(name="North Pole", latitude=90.0),
        datetime(2024, 3, 20, 3, 6, tzinfo=UTC),
    )

    assert values == {"declination_deg": 0.0, "apparent_altitude_deg": 2.0}
    assert captured_params["CENTER"] == "coord@399"
    assert captured_params["COORD_TYPE"] == "GEODETIC"
    assert captured_params["SITE_COORD"] == "0.0,90.0,0.0"
    assert captured_params["ANG_FORMAT"] == "DEG"


def test_validate_raw_response_rejects_horizons_errors() -> None:
    with pytest.raises(HorizonsResponseError, match="Horizons reported an error"):
        HorizonsClient._validate_raw_response("$$SOE\nERROR: bad request\n$$EOE")


def test_required_float_rejects_non_degree_text() -> None:
    with pytest.raises(HorizonsResponseError, match="not a decimal degree value"):
        HorizonsClient._required_float({"DEC_(a-app)": "+00 00 00.0"}, ["DEC_(a-app)"])


def test_invalid_timestamp_is_rejected(tmp_path: Path) -> None:
    client = HorizonsClient(cache_dir=tmp_path)
    with pytest.raises(TypeError, match="timestamp must be a datetime"):
        client.sun_declination("2024-Mar-20")  # type: ignore[arg-type]
