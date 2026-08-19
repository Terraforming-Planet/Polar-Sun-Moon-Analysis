from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from PIL import Image

NASA_GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
USGS_STAC_SEARCH = "https://landsatlook.usgs.gov/stac-server/search"
CDSE_STAC_SEARCH = "https://stac.dataspace.copernicus.eu/v1/search"
ALLOWED_DOWNLOAD_HOSTS = {
    "gibs.earthdata.nasa.gov",
    "landsatlook.usgs.gov",
    "stac.dataspace.copernicus.eu",
    "d9-wret.s3.us-west-2.amazonaws.com",
}
RETRYABLE_HTTP = {408, 425, 429, 500, 502, 503, 504}
SEASONAL_DATES = ((3, 15), (6, 15), (9, 15), (12, 15))
USGS_TARGET_DATES = ((5, 15), (9, 15))
CDSE_TARGET_DATES = ((5, 15), (9, 15))


@dataclass(slots=True, frozen=True)
class Region:
    id: str
    name: str
    lat: float
    lon: float
    span_deg: float
    tags: tuple[str, ...]


@dataclass(slots=True, frozen=True)
class ImageRecord:
    path: str
    sha256: str
    source: str
    source_family: str
    region_id: str
    region_name: str
    observation_date: str
    bbox: tuple[float, float, float, float]
    source_scene_id: str | None
    source_url: str
    derived_window: bool
    evidence_class: str = "OBSERVATION"


def _load_regions(path: Path) -> list[Region]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    regions: list[Region] = []
    for raw in payload.get("regions") or []:
        regions.append(
            Region(
                id=str(raw["id"]),
                name=str(raw["name"]),
                lat=float(raw["lat"]),
                lon=float(raw["lon"]),
                span_deg=float(raw["span_deg"]),
                tags=tuple(str(tag) for tag in raw.get("tags") or []),
            )
        )
    if not regions:
        raise RuntimeError(f"No regions found in {path}")
    return regions


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _valid_image(path: Path) -> bool:
    try:
        with Image.open(path) as image:
            image.verify()
        return path.stat().st_size > 1024
    except (OSError, ValueError):
        return False


def _jsonl_append(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, separators=(",", ":")) + "\n")


def _request(
    url: str,
    *,
    body: dict[str, Any] | None = None,
    timeout: float = 60.0,
    retries: int = 6,
) -> bytes:
    data = None
    headers = {"User-Agent": "Terraforming-Planet-Global-Public-Dataset/1.0"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=data, headers=headers, method="POST" if data else "GET")
    for attempt in range(retries):
        try:
            with urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed HTTPS APIs
                return response.read()
        except HTTPError as exc:
            if exc.code not in RETRYABLE_HTTP or attempt + 1 >= retries:
                raise
        except (URLError, TimeoutError):
            if attempt + 1 >= retries:
                raise
        time.sleep(min(30.0, 1.5 * (2**attempt)))
    raise RuntimeError("request retries exhausted")


def _download(url: str, target: Path) -> None:
    host = urlparse(url).hostname or ""
    if host not in ALLOWED_DOWNLOAD_HOSTS:
        raise RuntimeError(f"Refusing unapproved download host: {host}")
    payload = _request(url, timeout=90.0, retries=6)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".part")
    temporary.write_bytes(payload)
    if not _valid_image(temporary):
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"Downloaded payload is not a readable image: {url}")
    temporary.replace(target)


def _cell_bbox(region: Region, grid: int, cell: int) -> tuple[float, float, float, float]:
    row, column = divmod(cell, grid)
    half = region.span_deg / 2.0
    west = region.lon - half
    south = region.lat - half
    cell_size = region.span_deg / grid
    cell_west = west + column * cell_size
    cell_east = cell_west + cell_size
    cell_south = south + row * cell_size
    cell_north = cell_south + cell_size
    return (
        max(-180.0, cell_west),
        max(-89.8, cell_south),
        min(180.0, cell_east),
        min(89.8, cell_north),
    )


def _gibs_layer(year: int) -> str:
    if year >= 2012:
        return "VIIRS_SNPP_CorrectedReflectance_TrueColor"
    return "MODIS_Terra_CorrectedReflectance_TrueColor"


def _gibs_url(date: str, bbox: tuple[float, float, float, float], size: int) -> str:
    west, south, east, north = bbox
    year = int(date[:4])
    params = {
        "service": "WMS",
        "request": "GetMap",
        "version": "1.3.0",
        "layers": _gibs_layer(year),
        "styles": "",
        "format": "image/jpeg",
        "transparent": "false",
        "width": str(size),
        "height": str(size),
        "crs": "EPSG:4326",
        "bbox": f"{south},{west},{north},{east}",
        "time": date,
    }
    return f"{NASA_GIBS_WMS}?{urlencode(params)}"


def _gibs_tasks(
    regions: list[Region],
    *,
    start_year: int,
    end_year: int,
    grid: int,
) -> Iterable[tuple[Region, str, int, tuple[float, float, float, float]]]:
    for year in range(max(2000, start_year), end_year + 1):
        for month, day in SEASONAL_DATES:
            date = f"{year:04d}-{month:02d}-{day:02d}"
            for region in regions:
                for cell in range(grid * grid):
                    yield region, date, cell, _cell_bbox(region, grid, cell)


def _download_gibs_task(
    task: tuple[Region, str, int, tuple[float, float, float, float]],
    cache_root: Path,
    size: int,
) -> ImageRecord:
    region, date, cell, bbox = task
    path = cache_root / "nasa_gibs" / region.id / date / f"cell-{cell:02d}.jpg"
    url = _gibs_url(date, bbox, size)
    if not _valid_image(path):
        _download(url, path)
    return ImageRecord(
        path=path.as_posix(),
        sha256=_sha256(path),
        source="NASA GIBS",
        source_family="nasa_gibs_true_color",
        region_id=region.id,
        region_name=region.name,
        observation_date=date,
        bbox=bbox,
        source_scene_id=None,
        source_url=url,
        derived_window=True,
    )


def _stac_search(
    endpoint: str,
    *,
    collection: str,
    bbox: tuple[float, float, float, float],
    start: str,
    end: str,
    limit: int = 30,
) -> list[dict[str, Any]]:
    payload = {
        "collections": [collection],
        "bbox": list(bbox),
        "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
        "limit": limit,
    }
    raw = json.loads(_request(endpoint, body=payload).decode("utf-8"))
    features = raw.get("features") or []
    return [feature for feature in features if isinstance(feature, dict)]


def _cloud_cover(item: dict[str, Any]) -> float:
    props = item.get("properties") or {}
    for key in ("eo:cloud_cover", "cloud_cover", "cloudCover"):
        value = props.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return 1000.0


def _item_date(item: dict[str, Any]) -> str:
    props = item.get("properties") or {}
    value = props.get("datetime") or props.get("start_datetime") or ""
    return str(value)[:10]


def _preview_asset(item: dict[str, Any]) -> tuple[str, str] | None:
    assets = item.get("assets") or {}
    for key in (
        "thumbnail",
        "rendered_preview",
        "browse",
        "visual",
        "overview",
        "preview",
        "quicklook",
    ):
        raw = assets.get(key)
        if isinstance(raw, dict) and isinstance(raw.get("href"), str):
            href = str(raw["href"])
            host = urlparse(href).hostname or ""
            if href.startswith("https://") and host in ALLOWED_DOWNLOAD_HOSTS:
                return key, href
    return None


def _nearest_item(items: list[dict[str, Any]], target_date: str) -> dict[str, Any] | None:
    target = datetime.fromisoformat(target_date).replace(tzinfo=UTC)
    candidates: list[tuple[float, float, dict[str, Any]]] = []
    for item in items:
        date_text = _item_date(item)
        if not date_text:
            continue
        try:
            acquired = datetime.fromisoformat(date_text).replace(tzinfo=UTC)
        except ValueError:
            continue
        candidates.append((abs((acquired - target).total_seconds()), _cloud_cover(item), item))
    if not candidates:
        return None
    return min(candidates, key=lambda row: (row[0], row[1]))[2]


def _harvest_stac_previews(
    regions: list[Region],
    cache_root: Path,
    manifest_path: Path,
    failure_path: Path,
    *,
    endpoint: str,
    collection: str,
    source: str,
    source_family: str,
    start_year: int,
    end_year: int,
    target_dates: tuple[tuple[int, int], ...],
) -> list[ImageRecord]:
    records: list[ImageRecord] = []
    for region in regions:
        bbox = _cell_bbox(region, 1, 0)
        for year in range(start_year, end_year + 1):
            for month, day in target_dates:
                target_date = f"{year:04d}-{month:02d}-{day:02d}"
                start = f"{year:04d}-{max(1, month - 2):02d}-01"
                end_month = min(12, month + 2)
                end = f"{year:04d}-{end_month:02d}-28"
                try:
                    items = _stac_search(
                        endpoint,
                        collection=collection,
                        bbox=bbox,
                        start=start,
                        end=end,
                    )
                    item = _nearest_item(items, target_date)
                    asset = _preview_asset(item or {})
                    if item is None or asset is None:
                        continue
                    asset_key, url = asset
                    scene_id = str(item.get("id") or "unknown")
                    date = _item_date(item) or target_date
                    suffix = ".png" if "png" in url.lower() else ".jpg"
                    path = (
                        cache_root
                        / source_family
                        / region.id
                        / str(year)
                        / f"{scene_id}-{asset_key}{suffix}"
                    )
                    if not _valid_image(path):
                        _download(url, path)
                    record = ImageRecord(
                        path=path.as_posix(),
                        sha256=_sha256(path),
                        source=source,
                        source_family=source_family,
                        region_id=region.id,
                        region_name=region.name,
                        observation_date=date,
                        bbox=bbox,
                        source_scene_id=scene_id,
                        source_url=url,
                        derived_window=False,
                    )
                    records.append(record)
                    _jsonl_append(manifest_path, asdict(record))
                except (HTTPError, URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
                    _jsonl_append(
                        failure_path,
                        {
                            "source": source,
                            "region_id": region.id,
                            "year": year,
                            "target_date": target_date,
                            "error": str(exc),
                        },
                    )
    return records


def _load_existing_records(path: Path) -> list[ImageRecord]:
    if not path.exists():
        return []
    records: list[ImageRecord] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        raw = json.loads(line)
        raw["bbox"] = tuple(float(value) for value in raw["bbox"])
        records.append(ImageRecord(**raw))
    return records


def harvest_global_dataset(
    repo_root: Path,
    *,
    target_images: int,
    start_year: int,
    end_year: int,
    grid: int,
    workers: int,
    size: int,
    max_download_gb: float,
) -> dict[str, Any]:
    config_path = repo_root / "config" / "global_training_regions.json"
    regions = _load_regions(config_path)
    cache_root = repo_root / "research_cache" / "global_public_dataset"
    run_root = repo_root / "research_runs" / f"dataset_{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"
    run_root.mkdir(parents=True, exist_ok=True)
    records_path = run_root / "records.jsonl"
    failures_path = run_root / "failures.jsonl"
    existing = _load_existing_records(cache_root / "records.jsonl")
    by_hash = {record.sha256: record for record in existing if Path(record.path).exists()}
    downloaded_bytes = sum(Path(record.path).stat().st_size for record in by_hash.values())
    byte_budget = int(max_download_gb * 1024**3)

    print(
        json.dumps(
            {
                "event": "global_dataset_start",
                "regions": len(regions),
                "target_images": target_images,
                "existing_unique_images": len(by_hash),
                "grid": grid,
                "sources": ["NASA GIBS", "USGS Landsat", "ESA/Copernicus CDSE"],
            }
        ),
        flush=True,
    )

    tasks = _gibs_tasks(regions, start_year=start_year, end_year=end_year, grid=grid)
    pending: list[Any] = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        for task in tasks:
            if len(by_hash) >= target_images or downloaded_bytes >= byte_budget:
                break
            pending.append(executor.submit(_download_gibs_task, task, cache_root, size))
            if len(pending) < max(16, workers * 4):
                continue
            for future in as_completed(pending):
                try:
                    record = future.result()
                    path = Path(record.path)
                    if record.sha256 not in by_hash:
                        by_hash[record.sha256] = record
                        downloaded_bytes += path.stat().st_size
                        _jsonl_append(records_path, asdict(record))
                except (HTTPError, URLError, TimeoutError, RuntimeError) as exc:
                    _jsonl_append(failures_path, {"source": "NASA GIBS", "error": str(exc)})
                if len(by_hash) >= target_images or downloaded_bytes >= byte_budget:
                    break
            pending.clear()
            print(
                json.dumps(
                    {
                        "event": "global_dataset_progress",
                        "unique_images": len(by_hash),
                        "download_gb": round(downloaded_bytes / 1024**3, 3),
                    }
                ),
                flush=True,
            )
        for future in as_completed(pending):
            try:
                record = future.result()
                if record.sha256 not in by_hash:
                    by_hash[record.sha256] = record
                    downloaded_bytes += Path(record.path).stat().st_size
                    _jsonl_append(records_path, asdict(record))
            except (HTTPError, URLError, TimeoutError, RuntimeError) as exc:
                _jsonl_append(failures_path, {"source": "NASA GIBS", "error": str(exc)})

    if len(by_hash) < target_images:
        usgs = _harvest_stac_previews(
            regions,
            cache_root,
            records_path,
            failures_path,
            endpoint=USGS_STAC_SEARCH,
            collection="landsat-c2l2-sr",
            source="USGS Landsat Collection 2",
            source_family="usgs_landsat_preview",
            start_year=start_year,
            end_year=end_year,
            target_dates=USGS_TARGET_DATES,
        )
        for record in usgs:
            by_hash.setdefault(record.sha256, record)

    if len(by_hash) < target_images and end_year >= 2015:
        cdse = _harvest_stac_previews(
            regions,
            cache_root,
            records_path,
            failures_path,
            endpoint=CDSE_STAC_SEARCH,
            collection="sentinel-2-l2a",
            source="ESA/Copernicus CDSE Sentinel-2",
            source_family="cdse_sentinel2_preview",
            start_year=max(2015, start_year),
            end_year=end_year,
            target_dates=CDSE_TARGET_DATES,
        )
        for record in cdse:
            by_hash.setdefault(record.sha256, record)

    unique = sorted(by_hash.values(), key=lambda record: (record.region_id, record.observation_date, record.path))
    canonical_path = cache_root / "records.jsonl"
    canonical_path.parent.mkdir(parents=True, exist_ok=True)
    canonical_path.write_text(
        "".join(json.dumps(asdict(record), separators=(",", ":")) + "\n" for record in unique),
        encoding="utf-8",
    )

    counts_by_source: dict[str, int] = {}
    counts_by_region: dict[str, int] = {}
    source_scene_ids: set[str] = set()
    for record in unique:
        counts_by_source[record.source] = counts_by_source.get(record.source, 0) + 1
        counts_by_region[record.region_id] = counts_by_region.get(record.region_id, 0) + 1
        if record.source_scene_id:
            source_scene_ids.add(record.source_scene_id)

    summary = {
        "schema": "terra-global-public-dataset-v1",
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "date_range": [start_year, end_year],
        "region_count": len(regions),
        "unique_downloaded_images": len(unique),
        "unique_source_scene_ids": len(source_scene_ids),
        "derived_window_count": sum(1 for record in unique if record.derived_window),
        "download_gb": round(sum(Path(record.path).stat().st_size for record in unique) / 1024**3, 3),
        "counts_by_source": dict(sorted(counts_by_source.items())),
        "counts_by_region": dict(sorted(counts_by_region.items())),
        "records_jsonl": canonical_path.as_posix(),
        "run_records_jsonl": records_path.as_posix(),
        "failures_jsonl": failures_path.as_posix(),
        "claims": {
            "satellite_images_are_unique_by_sha256": True,
            "derived_windows_are_not_counted_as_unique_source_scenes": True,
            "metadata_only_hits_are_not_counted_as_images": True,
            "causal_environmental_claim": False,
        },
        "source_notes": {
            "NASA GIBS": "Public NASA imagery windows. MODIS Terra is used from 2000; VIIRS SNPP from 2012.",
            "USGS Landsat": "Official Landsat Collection 2 STAC previews when the USGS service is available.",
            "ESA/Copernicus": "Official CDSE Sentinel-2 STAC previews when preview assets are publicly exposed.",
        },
    }
    (run_root / "dataset_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps({"event": "global_dataset_complete", **summary}, default=str), flush=True)
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build a resumable, provenance-complete global public satellite image dataset."
    )
    parser.add_argument("--target-images", type=int, default=20_000)
    parser.add_argument("--start-year", type=int, default=1990)
    parser.add_argument("--end-year", type=int, default=2026)
    parser.add_argument("--grid", type=int, default=4)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--max-download-gb", type=float, default=20.0)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.target_images < 1:
        raise SystemExit("--target-images must be positive")
    if not 1 <= args.grid <= 8:
        raise SystemExit("--grid must be between 1 and 8")
    if not 128 <= args.size <= 1024:
        raise SystemExit("--size must be between 128 and 1024")
    harvest_global_dataset(
        Path.cwd(),
        target_images=args.target_images,
        start_year=args.start_year,
        end_year=args.end_year,
        grid=args.grid,
        workers=args.workers,
        size=args.size,
        max_download_gb=args.max_download_gb,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
