from __future__ import annotations

import pytest

from terra_hazards.analysis import analyze_lake_change, classify_fire_activity
from terra_hazards.privacy import PrivacyFilter
from terra_hazards.research import mountain_water_method, seafloor_method


def test_lake_area_change_does_not_invent_volume() -> None:
    result = analyze_lake_change(10, 1, "2020-01-01", "2026-01-01", 0.1, 0.0)
    assert result["absolute_change_km2"] == -9
    assert result["percent_change"] == -90
    assert result["volume_change"] is None


def test_fire_summary_preserves_evidence_boundary() -> None:
    result = classify_fire_activity(
        [{"confidence": "high", "frp": "10"}, {"confidence": "high", "frp": "20"}]
    )
    assert result["detections"] == 2
    assert result["mean_fire_radiative_power_mw"] == 15
    assert result["forecast"] is None


def test_privacy_filter_removes_point_inside_unknown_building_in_strict_mode() -> None:
    buildings = {
        "features": [
            {
                "properties": {},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
                },
            }
        ]
    }
    observations = {
        "features": [
            {"geometry": {"type": "Point", "coordinates": [1, 1]}},
            {"geometry": {"type": "Point", "coordinates": [3, 3]}},
        ]
    }
    result = PrivacyFilter(strict=True).filter_points(observations, buildings)
    assert result["privacy"]["removed"] == 1
    assert len(result["features"]) == 1


def test_invalid_lake_area_is_rejected() -> None:
    with pytest.raises(ValueError):
        analyze_lake_change(0, 1, "before", "after")


def test_research_modules_state_direct_measurement_limits() -> None:
    assert "No satellite directly" in str(mountain_water_method()["limitation"])
    assert "do not directly see" in str(seafloor_method()["limitation"])
