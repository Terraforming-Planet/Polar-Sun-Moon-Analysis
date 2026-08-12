from __future__ import annotations

from scripts.build_global_safety_feed import event_feature, normalized_geojson_geometry


def test_eonet_polygon_geometry_survives_into_hazard_feature() -> None:
    event = {
        "id": "eonet-test-flood",
        "type": "flood",
        "title": "Open flood",
        "status": "open",
        "observed_at": "2026-08-12T07:00:00Z",
        "source": "NASA EONET",
        "source_url": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_TEST",
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [-5.0, 50.0],
                    [-4.0, 50.0],
                    [-4.0, 51.0],
                    [-5.0, 51.0],
                    [-5.0, 50.0],
                ]
            ],
        },
    }

    feature = event_feature(event)

    assert feature is not None
    assert feature["geometry"]["type"] == "Polygon"
    assert feature["properties"]["categories"] == ["flood"]
    assert feature["properties"]["observation_time"] == "2026-08-12T07:00:00Z"
    assert feature["properties"]["source"] == "NASA EONET"


def test_point_geometry_is_normalized_and_preserves_time() -> None:
    event = {
        "id": "eonet-test-fire",
        "type": "fire",
        "observed_at": "2026-08-12T07:30:00Z",
        "geometry": {"type": "Point", "coordinates": [18, 54]},
    }

    feature = event_feature(event)

    assert feature is not None
    assert feature["geometry"] == {"type": "Point", "coordinates": [18.0, 54.0]}
    assert feature["properties"]["observation_time"] == "2026-08-12T07:30:00Z"


def test_invalid_polygon_is_rejected_instead_of_publishing_bad_geojson() -> None:
    event = {
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[0, 0], [1, 0], [1, 1]]],
        }
    }

    assert normalized_geojson_geometry(event) is None


def test_legacy_lat_lon_events_still_become_point_features() -> None:
    event = {
        "id": "usgs-test",
        "type": "earthquake",
        "latitude": 10,
        "longitude": 20,
        "observed_at": "2026-08-12T06:00:00Z",
    }

    feature = event_feature(event)

    assert feature is not None
    assert feature["geometry"] == {"type": "Point", "coordinates": [20.0, 10.0]}
