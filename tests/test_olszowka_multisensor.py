from datetime import UTC, datetime

from scripts.refresh_olszowka_multisensor import AOI_BBOX, STAC_SEARCH, build_manifest


def test_build_manifest_uses_official_cdse_and_real_observation_metadata() -> None:
    calls: list[tuple[str, dict[str, object]]] = []

    def loader(url: str, payload: dict[str, object]) -> dict[str, object]:
        calls.append((url, payload))
        collection = str(payload["collections"][0])  # type: ignore[index]
        return {
            "features": [
                {
                    "id": f"{collection}-sample",
                    "bbox": AOI_BBOX,
                    "properties": {
                        "datetime": "2026-08-12T20:00:00Z",
                        "eo:cloud_cover": 12.5 if collection == "sentinel-2-l2a" else None,
                        "platform": "sentinel",
                    },
                    "assets": {"thumbnail": {"href": "https://example.invalid/preview.png", "type": "image/png"}},
                    "links": [{"rel": "self", "href": "https://stac.dataspace.copernicus.eu/v1/items/sample"}],
                }
            ]
        }

    manifest = build_manifest(loader=loader, now=datetime(2026, 8, 13, tzinfo=UTC))

    assert len(calls) == 2
    assert all(url == STAC_SEARCH for url, _ in calls)
    assert all(payload["bbox"] == AOI_BBOX for _, payload in calls)
    assert {item["collection"] for item in manifest["observations"]} == {"sentinel-1-grd", "sentinel-2-l2a"}
    assert all(item["synthetic"] is False for item in manifest["observations"])
    assert manifest["night_lights"]["gibs_layer_radiance"] == "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance"
    assert manifest["historical_water"]["dataset"] == "Global Surface Water v1.4"


def test_failed_refresh_preserves_previous_manifest() -> None:
    previous = {
        "generated_at_utc": "2026-08-12T20:00:00+00:00",
        "observations": [{"id": "known-good"}],
        "aoi": {"id": "olszowka-gardeja-water-testbed"},
    }

    def failing_loader(_url: str, _payload: dict[str, object]) -> dict[str, object]:
        raise OSError("temporary catalogue outage")

    assert build_manifest(loader=failing_loader, previous=previous) == previous


def test_field_report_is_priority_for_verification_not_confirmed_disaster() -> None:
    def empty_loader(_url: str, _payload: dict[str, object]) -> dict[str, object]:
        return {"features": []}

    manifest = build_manifest(loader=empty_loader, now=datetime(2026, 8, 13, tzinfo=UTC))
    report = manifest["field_report"]

    assert report["priority"] == "critical_review_requested"
    assert report["verification_state"] == "requires_satellite_and_hydrological_verification"
    assert any(target["local_name"] == "Jezioro Panieńskie" for target in report["targets"] if "local_name" in target)
