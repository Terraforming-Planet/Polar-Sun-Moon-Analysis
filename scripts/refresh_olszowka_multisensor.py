from __future__ import annotations

import argparse
import json
import urllib.request
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

STAC_SEARCH = "https://stac.dataspace.copernicus.eu/v1/search"
AOI_BBOX = [18.94, 53.55, 19.10, 53.66]
COLLECTION_WINDOWS = {
    "sentinel-1-grd": 21,
    "sentinel-2-l2a": 45,
}
PREVIEW_KEYS = (
    "visual",
    "rendered_preview",
    "thumbnail",
    "overview",
    "preview",
    "quicklook",
)


def post_json(url: str, payload: dict[str, Any], timeout: float = 40.0) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Terraforming-Planet-Open-Science/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        return json.load(response)


def safe_https_url(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc:
        return None
    return value


def preview_url(item: dict[str, Any]) -> str | None:
    assets = item.get("assets") or {}
    for key in PREVIEW_KEYS:
        asset = assets.get(key) if isinstance(assets, dict) else None
        href = asset.get("href") if isinstance(asset, dict) else None
        safe = safe_https_url(href)
        if safe:
            return safe
    for asset in assets.values() if isinstance(assets, dict) else []:
        href = asset.get("href") if isinstance(asset, dict) else None
        media_type = asset.get("type") if isinstance(asset, dict) else None
        safe = safe_https_url(href)
        if safe and isinstance(media_type, str) and media_type.startswith("image/"):
            return safe
    return None


def item_url(item: dict[str, Any]) -> str | None:
    for link in item.get("links") or []:
        if not isinstance(link, dict) or link.get("rel") not in {"self", "canonical"}:
            continue
        safe = safe_https_url(link.get("href"))
        if safe:
            return safe
    return None


def normalise_item(item: dict[str, Any], collection: str) -> dict[str, Any]:
    properties = item.get("properties") or {}
    return {
        "id": item.get("id"),
        "collection": collection,
        "datetime_utc": properties.get("datetime") or properties.get("start_datetime"),
        "platform": properties.get("platform"),
        "constellation": properties.get("constellation"),
        "instrument": properties.get("instruments"),
        "cloud_cover_percent": properties.get("eo:cloud_cover"),
        "bbox": item.get("bbox"),
        "preview_url": preview_url(item),
        "product_url": item_url(item),
        "evidence_class": "satellite_observation_metadata",
        "synthetic": False,
    }


def source_record(collection: str, days: int) -> dict[str, Any]:
    return {
        "collection": collection,
        "provider": "Copernicus Data Space Ecosystem",
        "catalogue_url": "https://stac.dataspace.copernicus.eu/v1/",
        "search_window_days": days,
        "evidence_class": "official_public_catalogue",
    }


def _previous_by_collection(previous: dict[str, Any] | None) -> dict[str, list[dict[str, Any]]]:
    grouped = {collection: [] for collection in COLLECTION_WINDOWS}
    observations = (previous or {}).get("observations")
    if not isinstance(observations, list):
        return grouped
    for item in observations:
        if not isinstance(item, dict):
            continue
        collection = item.get("collection")
        if collection in grouped:
            grouped[collection].append(item)
    return grouped


def build_manifest(
    loader: Callable[[str, dict[str, Any]], dict[str, Any]] = post_json,
    now: datetime | None = None,
    previous: dict[str, Any] | None = None,
) -> dict[str, Any]:
    current = now or datetime.now(UTC)
    observations_by_collection = _previous_by_collection(previous)
    errors: list[dict[str, str]] = []
    successful_collections: set[str] = set()

    for collection, days in COLLECTION_WINDOWS.items():
        start = current - timedelta(days=days)
        start_utc = start.isoformat().replace("+00:00", "Z")
        current_utc = current.isoformat().replace("+00:00", "Z")
        payload = {
            "collections": [collection],
            "bbox": AOI_BBOX,
            "datetime": f"{start_utc}/{current_utc}",
            "limit": 8,
            "sortby": [{"field": "datetime", "direction": "desc"}],
        }
        try:
            data = loader(STAC_SEARCH, payload)
            items = data.get("features") if isinstance(data, dict) else []
            observations_by_collection[collection] = (
                [normalise_item(item, collection) for item in items if isinstance(item, dict)]
                if isinstance(items, list)
                else []
            )
            successful_collections.add(collection)
        except Exception as exc:
            errors.append({"collection": collection, "error": str(exc)})
            print(
                f"collection={collection} refresh=failed "
                f"preserving_previous_collection=true error={exc}"
            )

    if errors and previous and not successful_collections:
        print("catalogue_refresh=failed_preserving_previous_manifest")
        return previous

    observations = [
        item
        for collection in COLLECTION_WINDOWS
        for item in observations_by_collection.get(collection, [])
    ]
    observations.sort(key=lambda item: item.get("datetime_utc") or "", reverse=True)
    previous_observations = (previous or {}).get("observations")
    changed = observations != previous_observations
    if changed or not previous:
        generated_at = current.isoformat()
    else:
        generated_at = previous.get("generated_at_utc", current.isoformat())

    return {
        "generated_at_utc": generated_at,
        "aoi": {
            "id": "olszowka-gardeja-water-testbed",
            "label": "Olszówka · Gardeja · lokalny poligon hydrologiczny",
            "bbox_wgs84": AOI_BBOX,
            "focus_wgs84": [19.02, 53.61],
        },
        "observations": observations,
        "sources": [
            source_record(collection, days)
            for collection, days in COLLECTION_WINDOWS.items()
        ],
        "night_lights": {
            "provider": "NASA Earthdata / VIIRS Day-Night Band",
            "gibs_layer_radiance": "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance",
            "gibs_layer_enhanced": "VIIRS_SNPP_DayNightBand_ENCC",
            "worldview_url": "https://worldview.earthdata.nasa.gov/",
            "evidence_class": "nighttime_radiance_observation",
            "notice": (
                "Warstwa DNB może pokazać regionalną radiancję nocną, ale nie gwarantuje "
                "rozróżnienia pojedynczej lampy. Kontrast w Cesium jest wyłącznie "
                "transformacją wizualizacji."
            ),
        },
        "historical_water": {
            "provider": "EC JRC / Copernicus Programme",
            "dataset": "Global Surface Water v1.4",
            "temporal_extent": "1984-2021",
            "source_url": "https://global-surface-water.appspot.com/",
            "notice": (
                "Warstwa historyczna służy do porównania zaniku i zmian zasięgu wód, "
                "nie do bieżącego alarmu."
            ),
        },
        "field_report": {
            "priority": "critical_review_requested",
            "verification_state": "requires_satellite_and_hydrological_verification",
            "targets": [
                {
                    "id": "staw-w-lesie-panienskie",
                    "label": "Staw w lesie",
                    "local_name": "Jezioro Panieńskie",
                    "coordinate_status": "pending_verified_pin",
                    "reported_issue": "wieloletni zanik wody / silne wysuszenie",
                },
                {
                    "id": "jezioro-kuchnia",
                    "label": "Jezioro Kuchnia",
                    "latitude": 53.58809,
                    "longitude": 19.01969,
                    "reported_issue": "spadek poziomu i pogorszenie jakości wody — do weryfikacji",
                },
                {
                    "id": "czarne-dolne",
                    "label": "Jezioro Czarne Dolne",
                    "latitude": 53.62940,
                    "longitude": 19.04310,
                    "reported_issue": "zbiornik kontrolny dla lokalnego bilansu wodnego",
                },
                {
                    "id": "czarne-gorne",
                    "label": "Jezioro Czarne Górne",
                    "latitude": 53.62810,
                    "longitude": 19.07390,
                    "reported_issue": "zbiornik kontrolny dla lokalnego bilansu wodnego",
                },
            ],
        },
        "errors": errors,
    }


def load_previous(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("web/public/data/hydrology/olszowka-multisensor.json"),
    )
    args = parser.parse_args()
    previous = load_previous(args.output)
    manifest = build_manifest(previous=previous)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    args.output.write_text(rendered, encoding="utf-8")
    print(f"Wrote {args.output} observations={len(manifest.get('observations', []))}")


if __name__ == "__main__":
    main()
