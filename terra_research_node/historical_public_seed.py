from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError

from .global_public_dataset import (
    CDSE_TARGET_DATES,
    ImageRecord,
    Region,
    USGS_STAC_SEARCH,
    _cell_bbox,
    _download,
    _load_existing_records,
    _load_regions,
    _nearest_item,
    _preview_asset,
    _sha256,
    _stac_search,
    _valid_image,
)


def _append_failure(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, separators=(",", ":")) + "\n")


def _scene_date(item: dict[str, object]) -> str:
    properties = item.get("properties")
    if isinstance(properties, dict):
        value = properties.get("datetime") or properties.get("start_datetime")
        if value:
            return str(value)[:10]
    return ""


def _download_one(
    region: Region,
    item: dict[str, object],
    cache_root: Path,
) -> ImageRecord | None:
    asset = _preview_asset(item)
    if asset is None:
        return None
    asset_key, url = asset
    scene_id = str(item.get("id") or "unknown")
    date = _scene_date(item)
    if not date:
        return None
    suffix = ".png" if "png" in url.lower() else ".jpg"
    target = cache_root / "usgs_landsat_preview" / region.id / date[:4] / (
        f"{scene_id}-{asset_key}{suffix}"
    )
    if not _valid_image(target):
        _download(url, target)
    return ImageRecord(
        path=target.as_posix(),
        sha256=_sha256(target),
        source="USGS Landsat Collection 2",
        source_family="usgs_landsat_preview",
        region_id=region.id,
        region_name=region.name,
        observation_date=date,
        bbox=_cell_bbox(region, 1, 0),
        source_scene_id=scene_id,
        source_url=url,
        derived_window=False,
    )


def seed_historical_landsat(
    repo_root: Path,
    *,
    start_year: int = 1990,
    end_year: int = 1999,
    max_images: int = 2500,
) -> dict[str, object]:
    regions = _load_regions(repo_root / "config" / "global_training_regions.json")
    cache_root = repo_root / "research_cache" / "global_public_dataset"
    records_path = cache_root / "records.jsonl"
    failures_path = cache_root / "historical_seed_failures.jsonl"
    existing = _load_existing_records(records_path)
    by_hash = {record.sha256: record for record in existing if Path(record.path).is_file()}

    probe = regions[0]
    try:
        _stac_search(
            USGS_STAC_SEARCH,
            collection="landsat-c2l2-sr",
            bbox=_cell_bbox(probe, 1, 0),
            start=f"{start_year}-01-01",
            end=f"{start_year}-12-31",
            limit=3,
        )
    except (HTTPError, URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
        summary = {
            "event": "historical_landsat_seed_skipped",
            "reason": str(exc),
            "existing_unique_images": len(by_hash),
            "note": "USGS STAC was unavailable. The global run continues with cached imagery and NASA/CDSE sources.",
        }
        print(json.dumps(summary), flush=True)
        _append_failure(failures_path, summary)
        return summary

    added = 0
    for year in range(start_year, end_year + 1):
        for region in regions:
            if added >= max_images:
                break
            bbox = _cell_bbox(region, 1, 0)
            try:
                items = _stac_search(
                    USGS_STAC_SEARCH,
                    collection="landsat-c2l2-sr",
                    bbox=bbox,
                    start=f"{year}-03-01",
                    end=f"{year}-11-30",
                    limit=100,
                )
                for month, day in CDSE_TARGET_DATES:
                    target = f"{year:04d}-{month:02d}-{day:02d}"
                    item = _nearest_item(items, target)
                    if item is None:
                        continue
                    record = _download_one(region, item, cache_root)
                    if record is None or record.sha256 in by_hash:
                        continue
                    by_hash[record.sha256] = record
                    added += 1
                    if added >= max_images:
                        break
            except (HTTPError, URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
                _append_failure(
                    failures_path,
                    {
                        "source": "USGS Landsat Collection 2",
                        "region_id": region.id,
                        "year": year,
                        "error": str(exc),
                    },
                )
        print(
            json.dumps(
                {
                    "event": "historical_landsat_seed_progress",
                    "year": year,
                    "added": added,
                    "unique_total": len(by_hash),
                }
            ),
            flush=True,
        )
        if added >= max_images:
            break

    records_path.parent.mkdir(parents=True, exist_ok=True)
    records_path.write_text(
        "".join(
            json.dumps(record.__dict__ if hasattr(record, "__dict__") else {
                "path": record.path,
                "sha256": record.sha256,
                "source": record.source,
                "source_family": record.source_family,
                "region_id": record.region_id,
                "region_name": record.region_name,
                "observation_date": record.observation_date,
                "bbox": record.bbox,
                "source_scene_id": record.source_scene_id,
                "source_url": record.source_url,
                "derived_window": record.derived_window,
                "evidence_class": record.evidence_class,
            }, separators=(",", ":")) + "\n"
            for record in sorted(
                by_hash.values(),
                key=lambda record: (record.region_id, record.observation_date, record.path),
            )
        ),
        encoding="utf-8",
    )
    summary = {
        "event": "historical_landsat_seed_complete",
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "added_unique_images": added,
        "unique_total": len(by_hash),
        "years": [start_year, end_year],
    }
    print(json.dumps(summary), flush=True)
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Best-effort public Landsat seed for the 1990s; never blocks the main run on an endpoint outage."
    )
    parser.add_argument("--start-year", type=int, default=1990)
    parser.add_argument("--end-year", type=int, default=1999)
    parser.add_argument("--max-images", type=int, default=2500)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    seed_historical_landsat(
        Path.cwd(),
        start_year=args.start_year,
        end_year=args.end_year,
        max_images=args.max_images,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
