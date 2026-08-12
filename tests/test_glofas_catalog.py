from scripts.refresh_glofas_catalog import build_manifest


def test_build_manifest_normalises_official_collection() -> None:
    def loader(url: str) -> dict:
        collection_id = url.rsplit("/", 1)[-1]
        return {
            "id": collection_id,
            "title": collection_id,
            "updated": "2026-08-10T00:00:00Z",
            "sci:doi": "10.example/test",
            "extent": {
                "temporal": {
                    "interval": [["2020-01-01T00:00:00Z", "2026-08-10T00:00:00Z"]]
                }
            },
            "cads:sanity_check": {
                "status": "available",
                "timestamp": "2026-08-10T12:00:00Z",
            },
            "cads:update_frequency": "Daily",
            "links": [{"rel": "retrieve", "href": f"https://example.test/{collection_id}"}],
        }

    manifest = build_manifest(loader=loader)

    assert len(manifest["sources"]) == 2
    assert manifest["errors"] == []
    assert manifest["sources"][0]["status"] == "available"
    assert "soil_wetness_index_root_zone" in manifest["sources"][0]["variables"]
    assert manifest["sources"][0]["temporal_end_utc"] == "2026-08-10T00:00:00Z"


def test_build_manifest_preserves_previous_metadata_on_network_failure() -> None:
    previous = {
        "sources": [
            {
                "id": "cems-glofas-forecast",
                "status": "available",
                "temporal_end_utc": "2026-08-09T00:00:00Z",
            }
        ]
    }

    def broken_loader(_url: str) -> dict:
        raise OSError("temporary outage")

    manifest = build_manifest(loader=broken_loader, previous=previous)
    forecast = next(
        item for item in manifest["sources"] if item["id"] == "cems-glofas-forecast"
    )
    historical = next(
        item for item in manifest["sources"] if item["id"] == "cems-glofas-historical"
    )

    assert forecast["status"] == "available"
    assert forecast["fetch_state"] == "stale_preserved"
    assert forecast["temporal_end_utc"] == "2026-08-09T00:00:00Z"
    assert historical["status"] == "unknown"
    assert historical["fetch_state"] == "error"
    assert len(manifest["errors"]) == 2
