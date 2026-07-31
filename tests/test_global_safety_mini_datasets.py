from __future__ import annotations

import json
from pathlib import Path
from typing import Any

FIXTURES = Path(__file__).parent / "fixtures" / "global_safety"
EXPECTED_TYPES = {
    "fire",
    "flood",
    "storm",
    "earthquake",
    "volcano",
    "landslide",
}


def load_json(name: str) -> dict[str, Any]:
    path = FIXTURES / name
    return json.loads(path.read_text(encoding="utf-8"))


def test_mini_event_dataset_is_balanced_and_consistent() -> None:
    payload = load_json("mini_events.json")
    events = payload["events"]

    assert payload["event_count"] == len(events) == 6
    assert set(payload["summary"]) == EXPECTED_TYPES
    assert all(payload["summary"][event_type] == 1 for event_type in EXPECTED_TYPES)
    assert {event["type"] for event in events} == EXPECTED_TYPES
    assert len({event["id"] for event in events}) == len(events)


def test_mini_hazard_dataset_has_valid_geojson_points() -> None:
    payload = load_json("mini_hazards.geojson")
    features = payload["features"]

    assert payload["type"] == "FeatureCollection"
    assert payload["feature_count"] == len(features) == 6

    categories: set[str] = set()
    for feature in features:
        assert feature["type"] == "Feature"
        assert feature["geometry"]["type"] == "Point"

        longitude, latitude = feature["geometry"]["coordinates"]
        assert -180 <= longitude <= 180
        assert -90 <= latitude <= 90

        feature_categories = feature["properties"]["categories"]
        assert len(feature_categories) == 1
        categories.add(feature_categories[0])

    assert categories == EXPECTED_TYPES


def test_event_and_hazard_fixture_ids_match() -> None:
    events = load_json("mini_events.json")["events"]
    features = load_json("mini_hazards.geojson")["features"]

    event_ids = {event["id"] for event in events}
    feature_ids = {feature["properties"]["event_id"] for feature in features}

    assert event_ids == feature_ids
