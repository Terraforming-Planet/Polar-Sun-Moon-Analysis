from __future__ import annotations

import argparse
import json
import urllib.request
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

CATALOGUE = "https://ewds.climate.copernicus.eu/api/catalogue/v1/collections"
COLLECTIONS = ("cems-glofas-forecast", "cems-glofas-historical")
VARIABLES = [
    "river_discharge",
    "soil_wetness_index_root_zone",
    "snow_water_equivalent",
    "runoff_water_equivalent_surface_plus_subsurface",
]


def fetch_json(url: str, timeout: float = 30.0) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Terraforming-Planet-Open-Science/1.0"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        return json.load(response)


def normalise_collection(payload: dict[str, Any], checked_at: str) -> dict[str, Any]:
    interval = payload.get("extent", {}).get("temporal", {}).get("interval", [[None, None]])
    temporal = interval[0] if interval else [None, None]
    sanity = payload.get("cads:sanity_check", {})
    links = payload.get("links", [])
    retrieve = next((link.get("href") for link in links if link.get("rel") == "retrieve"), None)
    return {
        "id": payload.get("id"),
        "title": payload.get("title"),
        "provider": "Copernicus CEMS / ECMWF EWDS",
        "status": sanity.get("status", "unknown"),
        "status_checked_at_utc": sanity.get("timestamp"),
        "catalogue_updated_at_utc": payload.get("updated"),
        "update_frequency": payload.get("cads:update_frequency"),
        "temporal_start_utc": temporal[0] if len(temporal) > 0 else None,
        "temporal_end_utc": temporal[1] if len(temporal) > 1 else None,
        "variables": VARIABLES,
        "catalogue_url": f"{CATALOGUE}/{payload.get('id')}",
        "retrieve_url": retrieve,
        "doi": payload.get("sci:doi"),
        "checked_at_utc": checked_at,
        "evidence_class": "modelled_hydrology",
    }


def build_manifest(
    loader: Callable[[str], dict[str, Any]] = fetch_json,
    previous: dict[str, Any] | None = None,
) -> dict[str, Any]:
    checked_at = datetime.now(UTC).isoformat()
    previous_sources = {
        item.get("id"): item for item in (previous or {}).get("sources", []) if item.get("id")
    }
    sources: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for collection_id in COLLECTIONS:
        url = f"{CATALOGUE}/{collection_id}"
        try:
            sources.append(normalise_collection(loader(url), checked_at))
        except Exception as exc:  # network/API failures must not erase last known metadata
            old = previous_sources.get(collection_id)
            if old:
                preserved = dict(old)
                preserved["checked_at_utc"] = checked_at
                preserved["fetch_state"] = "stale_preserved"
                preserved["fetch_error"] = str(exc)
                sources.append(preserved)
            else:
                sources.append(
                    {
                        "id": collection_id,
                        "provider": "Copernicus CEMS / ECMWF EWDS",
                        "status": "unknown",
                        "checked_at_utc": checked_at,
                        "catalogue_url": url,
                        "variables": VARIABLES,
                        "fetch_state": "error",
                        "fetch_error": str(exc),
                    }
                )
            errors.append({"id": collection_id, "error": str(exc)})

    return {
        "generated_at_utc": checked_at,
        "source": "ECMWF Early Warning Data Store STAC Catalogue API",
        "notice": (
            "Metadata describes official GloFAS model products and availability. "
            "It is not a direct measurement of groundwater and is not a flood warning by itself."
        ),
        "sources": sources,
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
        default=Path("web/public/data/hydrology/glofas-catalog.json"),
    )
    args = parser.parse_args()
    previous = load_previous(args.output)
    manifest = build_manifest(previous=previous)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    args.output.write_text(rendered, encoding="utf-8")
    print(f"Wrote {args.output} with {len(manifest['sources'])} official GloFAS sources")


if __name__ == "__main__":
    main()
