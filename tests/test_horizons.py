from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest
from _pytest.monkeypatch import MonkeyPatch

from polar_equinox_analysis.horizons import HorizonsClient, HorizonsResponseError
from polar_equinox_analysis.models import Observatory

# Header and data rows captured from the real NASA/JPL Horizons API on 2026-07-21.
REAL_HORIZONS_RESPONSE = """API VERSION: 1.2
API SOURCE: NASA/JPL Horizons API
 Date__(UT)__HR:MN:SC.fff, , ,R.A._(a-app), DEC_(a-app), Azi_(a-app), Elev_(a-app),
$$SOE
 2024-Mar-20 03:05:00.000,*,m,   127.40849,    23.32862,    3.569396,    23.328618,
 2024-Mar-20 03:06:00.000,*,m,   127.41732,    23.32635,    3.811300,    23.326347,
$$EOE
"""


def test_parse_real_horizons_csv() -> None:
    rows = HorizonsClient._parse_csv_rows(REAL_HORIZONS_RESPONSE)
    assert len(rows) == 2
    assert HorizonsClient._required_float(rows[0], ["DEC_(a-app)"]) == 23.32862
    assert HorizonsClient._required_float(rows[0], ["Elev_(a-app)"]) == 23.328618
    assert HorizonsClient._row_time(rows[0]) == datetime(2024, 3, 20, 3, 5, tzinfo=UTC)


def test_required_float_reports_missing_quantity() -> None:
    with pytest.raises(HorizonsResponseError, match="Required quantity unavailable"):
        HorizonsClient._required_float({"DEC": "n.a."}, ["DEC"])


def test_observer_request_uses_declination_and_elevation_codes(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    captured: dict[str, object] = {}
    client = HorizonsClient(cache_dir=tmp_path)

    def fake_fetch(params: dict[str, object]) -> str:
        captured.update(params)
        return REAL_HORIZONS_RESPONSE.replace(
            " 2024-Mar-20 03:06:00.000,*,m,   127.41732,    23.32635,    3.811300,    23.326347,\n",
            "",
        )

    monkeypatch.setattr(client, "fetch_text", fake_fetch)
    value = client.observer_ephemeris(
        "Moon",
        Observatory(name="North Pole", latitude=90.0),
        datetime(2024, 3, 20, 3, 5, tzinfo=UTC),
    )
    assert value == {"declination_deg": 23.32862, "apparent_altitude_deg": 23.328618}
    assert captured["QUANTITIES"] == "'2,4'"
    assert captured["CENTER"] == "'coord@399'"
    assert captured["SITE_COORD"] == "'0.0,90.0,0.0'"
    assert captured["ANG_FORMAT"] == "'DEG'"


def test_sun_declination_request_never_regresses_to_azimuth_only(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    response = """Date__(UT)__HR:MN, , ,R.A._(a-app), DEC_(a-app),
$$SOE
2024-Mar-20 03:06, , ,359.999, -0.00001,
2024-Mar-20 03:07, , ,0.001, 0.00026,
$$EOE
"""
    captured: dict[str, object] = {}
    client = HorizonsClient(cache_dir=tmp_path)

    def fake_fetch(params: dict[str, object]) -> str:
        captured.update(params)
        return response

    monkeypatch.setattr(client, "fetch_text", fake_fetch)
    assert client.sun_declination(datetime(2024, 3, 20, 3, 6, tzinfo=UTC)) == -0.00001
    assert captured["QUANTITIES"] == "'2'"
    assert captured["START_TIME"] == "'2024-Mar-20 03:06'"
    assert captured["STOP_TIME"] == "'2024-Mar-20 03:07'"


def test_validate_raw_response_rejects_horizons_errors() -> None:
    with pytest.raises(HorizonsResponseError, match="Horizons reported an error"):
        HorizonsClient._validate_raw_response("$$SOE\nERROR: bad request\n$$EOE")


def test_required_float_rejects_non_degree_text() -> None:
    with pytest.raises(HorizonsResponseError, match="Non-numeric"):
        HorizonsClient._required_float({"DEC_(a-app)": "+00 00 00.0"}, ["DEC_(a-app)"])


def test_invalid_timestamp_is_rejected(tmp_path: Path) -> None:
    client = HorizonsClient(cache_dir=tmp_path)
    with pytest.raises(TypeError, match="timestamp must be a datetime"):
        client.sun_declination("2024-Mar-20")  # type: ignore[arg-type]
