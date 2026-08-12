from __future__ import annotations

from scripts.refresh_public_hazard_feeds import normalize_eonet


def test_eonet_events_become_hazard_features_for_frontend_markers() -> None:
    payload = {
        "events": [
            {
                "id": "EONET_FIRE_1",
                "title": "Example wildfire",
                "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_FIRE_1",
                "closed": None,
                "categories": [{"id": "wildfires", "title": "Wildfires"}],
                "sources": [{"id": "Example", "url": "https://example.invalid/fire"}],
                "geometry": [
                    {
                        "date": "2026-08-12T06:00:00Z",
                        "type": "Point",
                        "coordinates": [-20.5, 64.1],
                    }
                ],
            },
            {
                "id": "EONET_FLOOD_1",
                "title": "Example flood",
                "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_FLOOD_1",
                "closed": None,
                "categories": [{"id": "floods", "title": "Floods"}],
                "sources": [],
                "geometry": [
                    {
                        "date": "2026-08-12T05:00:00Z",
                        "type": "Polygon",
                        "coordinates": [
                            [[10.0, 50.0], [11.0, 50.0], [11.0, 51.0], [10.0, 50.0]]
                        ],
                    }
                ],
            },
        ]
    }

    result = normalize_eonet(payload)

    assert len(result["events"]) == 2
    assert len(result["features"]) == 2

    fire = result["features"][0]
    assert fire["geometry"]["type"] == "Point"
    assert fire["properties"]["categories"] == ["Wildfires"]
    assert fire["properties"]["observation_time"] == "2026-08-12T06:00:00Z"
    assert fire["properties"]["source"] == "NASA EONET"

    flood = result["features"][1]
    assert flood["geometry"]["type"] == "Polygon"
    assert flood["properties"]["categories"] == ["Floods"]
    assert flood["properties"]["source_url"].endswith("EONET_FLOOD_1")


def test_eonet_event_without_supported_geometry_stays_in_catalogue_only() -> None:
    payload = {
        "events": [
            {
                "id": "EONET_NO_GEOMETRY",
                "title": "No current geometry",
                "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_NO_GEOMETRY",
                "categories": [{"id": "wildfires", "title": "Wildfires"}],
                "sources": [],
                "geometry": [],
            }
        ]
    }

    result = normalize_eonet(payload)

    assert len(result["events"]) == 1
    assert result["features"] == []
