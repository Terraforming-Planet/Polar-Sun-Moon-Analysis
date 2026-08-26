from __future__ import annotations

import argparse
import json
import math
import time
from collections import Counter
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol, cast
from urllib.parse import urlparse

import requests


USGS_LANDSAT_STAC = "https://landsatlook.usgs.gov/stac-server/search"
LANDSAT_SR_COLLECTION = "landsat-c2l2-sr"
ALLOWED_STAC_HOSTS = frozenset({"landsatlook.usgs.gov"})
PREFERRED_CLOUD_PERCENT = 15.0
FALLBACK_CLOUD_PERCENT = 30.0
CACHE_CELL_DEG = 0.5
SEARCH_HALF_SPAN_DEG = 0.35


class Searcher(Protocol):
    def search(
        self,
        *,
        lat: float,
        lon: float,
        year: int,
        window: tuple[str, str],
    ) -> list[dict[str, Any]]: ...


def _json_object(value: object, *, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object for {label}")
    return cast(dict[str, Any], value)


def _json_list(value: object, *, label: str) -> list[object]:
    if not isinstance(value, list):
        raise ValueError(f"Expected JSON list for {label}")
    return cast(list[object], value)


def _quantize(value: float, step: float = CACHE_CELL_DEG) -> float:
    return round(value / step) * step


def _window_iso(year: int, window: tuple[str, str]) -> str:
    start, end = window
    return f"{year}-{start}T00:00:00Z/{year}-{end}T23:59:59Z"


def _midpoint(year: int, window: tuple[str, str]) -> datetime:
    start = datetime.fromisoformat(f"{year}-{window[0]}T00:00:00+00:00")
    end = datetime.fromisoformat(f"{year}-{window[1]}T23:59:59+00:00")
    return start + (end - start) / 2


def _item_datetime(item: dict[str, Any]) -> datetime | None:
    properties = item.get("properties")
    if not isinstance(properties, dict):
        return None
    raw = properties.get("datetime") or properties.get("start_datetime")
    if not isinstance(raw, str) or not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _cloud_cover(item: dict[str, Any]) -> float | None:
    properties = item.get("properties")
    if not isinstance(properties, dict):
        return None
    for key in ("eo:cloud_cover", "landsat:cloud_cover_land", "cloud_cover"):
        value = properties.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int | float) and math.isfinite(float(value)):
            return max(0.0, min(100.0, float(value)))
    return None


def _contains_point(item: dict[str, Any], *, lat: float, lon: float) -> bool:
    raw_bbox = item.get("bbox")
    if not isinstance(raw_bbox, list) or len(raw_bbox) < 4:
        return True
    values = raw_bbox[:4]
    if not all(isinstance(value, int | float) for value in values):
        return True
    west, south, east, north = (float(value) for value in values)
    return west <= lon <= east and south <= lat <= north


def _tier_priority(item_id: str) -> int:
    upper = item_id.upper()
    if "_T1_" in upper or upper.endswith("_T1_SR"):
        return 0
    if "_T2_" in upper or upper.endswith("_T2_SR"):
        return 2
    return 1


def _select_best(
    items: Iterable[dict[str, Any]],
    *,
    lat: float,
    lon: float,
    year: int,
    window: tuple[str, str],
) -> dict[str, Any] | None:
    target = _midpoint(year, window)
    ranked: list[tuple[tuple[float, ...], dict[str, Any]]] = []
    for item in items:
        item_id = str(item.get("id", ""))
        if not item_id or not _contains_point(item, lat=lat, lon=lon):
            continue
        cloud = _cloud_cover(item)
        acquired = _item_datetime(item)
        if cloud is None or cloud > FALLBACK_CLOUD_PERCENT or acquired is None:
            continue
        cloud_band = 0.0 if cloud <= PREFERRED_CLOUD_PERCENT else 1.0
        day_distance = abs((acquired - target).total_seconds()) / 86400.0
        score = (
            cloud_band,
            float(_tier_priority(item_id)),
            cloud,
            day_distance,
        )
        ranked.append((score, item))
    if not ranked:
        return None
    ranked.sort(key=lambda pair: pair[0])
    return ranked[0][1]


def _self_href(item: dict[str, Any]) -> str | None:
    links = item.get("links")
    if not isinstance(links, list):
        return None
    for raw in links:
        if not isinstance(raw, dict) or raw.get("rel") != "self":
            continue
        href = raw.get("href")
        if isinstance(href, str) and href.startswith("https://"):
            return href
    return None


def _compact_item(item: dict[str, Any]) -> dict[str, object]:
    properties = item.get("properties")
    safe_properties = properties if isinstance(properties, dict) else {}
    platform = safe_properties.get("platform")
    instruments = safe_properties.get("instruments")
    return {
        "status": "selected",
        "stac_collection": str(item.get("collection", LANDSAT_SR_COLLECTION)),
        "stac_item_id": str(item.get("id", "")),
        "stac_item_href": _self_href(item),
        "datetime": (
            _item_datetime(item).isoformat().replace("+00:00", "Z")
            if _item_datetime(item) is not None
            else None
        ),
        "cloud_cover_percent": _cloud_cover(item),
        "platform": platform if isinstance(platform, str) else None,
        "instruments": instruments if isinstance(instruments, list) else None,
        "provider": "USGS Landsat Collection 2 Level-2 Surface Reflectance",
        "evidence_class": "OBSERVATION",
        "pixel_data_downloaded": False,
    }


class UsgsLandsatSearcher:
    def __init__(
        self,
        endpoint: str = USGS_LANDSAT_STAC,
        *,
        timeout_s: float = 45.0,
        request_delay_ms: int = 100,
        max_retries: int = 4,
    ) -> None:
        parsed = urlparse(endpoint)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_STAC_HOSTS:
            raise ValueError("Only the official USGS Landsat STAC endpoint is allowed")
        self.endpoint = endpoint
        self.timeout_s = timeout_s
        self.request_delay_s = max(0, request_delay_ms) / 1000.0
        self.max_retries = max(1, max_retries)
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": "TerraObservationSystem-Training004/1.0 (+public-research)"}
        )
        self._cache: dict[tuple[float, float, int, str, str], list[dict[str, Any]]] = {}

    def search(
        self,
        *,
        lat: float,
        lon: float,
        year: int,
        window: tuple[str, str],
    ) -> list[dict[str, Any]]:
        qlat = _quantize(lat)
        qlon = _quantize(lon)
        key = (qlat, qlon, year, window[0], window[1])
        cached = self._cache.get(key)
        if cached is not None:
            return cached

        body: dict[str, object] = {
            "collections": [LANDSAT_SR_COLLECTION],
            "bbox": [
                qlon - SEARCH_HALF_SPAN_DEG,
                qlat - SEARCH_HALF_SPAN_DEG,
                qlon + SEARCH_HALF_SPAN_DEG,
                qlat + SEARCH_HALF_SPAN_DEG,
            ],
            "datetime": _window_iso(year, window),
            "limit": 100,
        }
        payload = self._post(body)
        raw_features = _json_list(payload.get("features", []), label="features")
        features = [
            cast(dict[str, Any], raw)
            for raw in raw_features
            if isinstance(raw, dict)
        ]
        self._cache[key] = features
        if self.request_delay_s:
            time.sleep(self.request_delay_s)
        return features

    def _post(self, body: dict[str, object]) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(self.max_retries):
            try:
                response = self.session.post(
                    self.endpoint,
                    json=body,
                    timeout=self.timeout_s,
                )
                if response.status_code == 429 or response.status_code >= 500:
                    raise requests.HTTPError(
                        f"Temporary STAC HTTP {response.status_code}",
                        response=response,
                    )
                response.raise_for_status()
                return _json_object(response.json(), label="USGS STAC response")
            except (requests.RequestException, ValueError) as exc:
                last_error = exc
                if attempt + 1 >= self.max_retries:
                    break
                time.sleep(min(8.0, 0.75 * (2**attempt)))
        raise RuntimeError("USGS Landsat STAC request failed after retries") from last_error


def _window_tuple(raw: object) -> tuple[str, str] | None:
    if not isinstance(raw, list) or len(raw) != 2:
        return None
    start, end = raw
    if not isinstance(start, str) or not isinstance(end, str):
        return None
    return (start, end)


def _resolve_observation(
    searcher: Searcher,
    *,
    lat: float,
    lon: float,
    year: int,
    window: tuple[str, str],
) -> dict[str, object]:
    candidates = searcher.search(lat=lat, lon=lon, year=year, window=window)
    selected = _select_best(candidates, lat=lat, lon=lon, year=year, window=window)
    if selected is None:
        return {
            "status": "UNKNOWN_optical_unavailable",
            "year": year,
            "window": list(window),
            "provider": "USGS Landsat Collection 2 Level-2 Surface Reflectance",
            "pixel_data_downloaded": False,
            "next_evidence": "SAR_or_wider_quality_search_without_fabricating_clear_optical",
        }
    compact = _compact_item(selected)
    compact["year"] = year
    compact["window"] = list(window)
    return compact


def resolve_pack(record: dict[str, Any], searcher: Searcher) -> dict[str, object]:
    center = _json_object(record.get("sample_center"), label="sample_center")
    lat = float(center["lat"])
    lon = float(center["lon"])
    season = _json_object(record.get("season"), label="season")
    temporal = _json_object(record.get("temporal"), label="temporal")

    if season.get("zone") == "tropical":
        return {
            "pack_id": str(record.get("pack_id", "")),
            "status": "NEEDS_HYDROCLIMATIC_WINDOW",
            "reason": (
                "Tropical AOIs require locally derived hydrological windows from an official "
                "precipitation climatology before optical catalog resolution."
            ),
            "pixel_data_downloaded": False,
        }

    primary_window = _window_tuple(season.get("primary_window"))
    secondary_window = _window_tuple(season.get("secondary_window"))
    if primary_window is None or secondary_window is None:
        raise ValueError("Non-tropical pack is missing explicit seasonal windows")

    mode = str(temporal.get("mode", ""))
    reference_year = int(temporal["reference_year"])
    comparison_year = int(temporal["comparison_year"])
    comparison_window = primary_window
    if mode == "within_year_seasonal_response":
        comparison_window = secondary_window

    reference = _resolve_observation(
        searcher,
        lat=lat,
        lon=lon,
        year=reference_year,
        window=primary_window,
    )
    comparison = _resolve_observation(
        searcher,
        lat=lat,
        lon=lon,
        year=comparison_year,
        window=comparison_window,
    )
    status = "RESOLVED"
    if reference["status"] != "selected" or comparison["status"] != "selected":
        status = "PARTIAL_OR_UNKNOWN"

    return {
        "pack_id": str(record.get("pack_id", "")),
        "category": str(record.get("category", "")),
        "region_id": str(record.get("region_id", "")),
        "sample_center": {"lat": lat, "lon": lon},
        "temporal": temporal,
        "status": status,
        "reference_observation": reference,
        "comparison_observation": comparison,
        "pixel_data_downloaded": False,
        "next_stage": "windowed_COG_band_and_QA_read_on_L4",
    }


def resolve_manifest(
    manifest_path: Path,
    output_path: Path,
    searcher: Searcher,
    *,
    max_packs: int | None = None,
) -> dict[str, object]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    status_counts: Counter[str] = Counter()
    processed = 0
    with manifest_path.open("r", encoding="utf-8") as source, output_path.open(
        "w", encoding="utf-8", newline="\n"
    ) as target:
        for line in source:
            if max_packs is not None and processed >= max_packs:
                break
            if not line.strip():
                continue
            record = _json_object(json.loads(line), label="manifest record")
            resolved = resolve_pack(record, searcher)
            status = str(resolved["status"])
            status_counts[status] += 1
            target.write(json.dumps(resolved, ensure_ascii=False, sort_keys=True))
            target.write("\n")
            processed += 1

    summary: dict[str, object] = {
        "schema": "terra-training-004-water-cycle-catalog-resolution-v1",
        "manifest": str(manifest_path),
        "output": str(output_path),
        "processed_packs": processed,
        "status_counts": dict(status_counts),
        "catalog_metadata_resolved": processed > 0,
        "pixel_data_downloaded": False,
        "source": "USGS Landsat Collection 2 Level-2 Surface Reflectance STAC",
        "next_stage": "read only required scientific COG bands plus QA on L4",
    }
    summary_path = output_path.with_suffix(".summary.json")
    summary_path.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Resolve Training #4 temporal slots against official USGS Landsat STAC"
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("research_runs/training004_water_cycle_manifest.jsonl"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("research_runs/training004_water_cycle_landsat_resolved.jsonl"),
    )
    parser.add_argument("--max-packs", type=int, default=None)
    parser.add_argument("--request-delay-ms", type=int, default=100)
    args = parser.parse_args()

    searcher = UsgsLandsatSearcher(request_delay_ms=args.request_delay_ms)
    summary = resolve_manifest(
        args.manifest,
        args.output,
        searcher,
        max_packs=args.max_packs,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
