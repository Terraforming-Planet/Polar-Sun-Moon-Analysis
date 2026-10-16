#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import subprocess
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote

import numpy as np
import rasterio
import requests
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject, transform

from terra_water.measurement import (
    landsat_qa_valid_mask,
    landsat_surface_reflectance,
    measure_mndwi_water_area,
    mndwi,
    sentinel_scl_valid_mask,
)

PC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
PC_TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token/{collection}"
SEASONS = ("spring", "autumn")
SESSION = requests.Session()
TOKENS: dict[str, str] = {}

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF,.jp2,.JP2")


def request_json(method: str, url: str, **kwargs: Any) -> dict[str, Any]:
    last: requests.Response | None = None
    for attempt in range(7):
        response = SESSION.request(method, url, timeout=120, **kwargs)
        last = response
        if response.status_code not in (429, 500, 502, 503, 504):
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise TypeError(f"Expected object from {url}")
            return payload
        wait = min(30, int(response.headers.get("Retry-After", 2**attempt)))
        print(f"retry {response.status_code} {url} in {wait}s", flush=True)
        time.sleep(wait)
    if last is None:
        raise RuntimeError(f"No HTTP response from {url}")
    last.raise_for_status()
    raise RuntimeError(f"Request failed: {url}")


def token(collection: str) -> str:
    if collection not in TOKENS:
        payload = request_json("GET", PC_TOKEN.format(collection=collection))
        TOKENS[collection] = str(payload["token"])
    return TOKENS[collection]


def sign_href(href: str, collection: str) -> str:
    if "sig=" in href or "se=" in href:
        return href
    signed = token(collection)
    return href + ("&" if "?" in href else "?") + signed


def git_show(branch: str, path: str) -> str:
    refspec = f"+refs/heads/{branch}:refs/remotes/origin/{branch}"
    subprocess.run(
        ["git", "fetch", "--no-tags", "--filter=blob:none", "origin", refspec],
        check=True,
    )
    process = subprocess.run(
        ["git", "show", f"refs/remotes/origin/{branch}:{path}"],
        check=True,
        capture_output=True,
        text=True,
    )
    return process.stdout


def load_target(test: int, path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    config = json.loads(path.read_text(encoding="utf-8"))
    targets = [target for target in config["targets"] if int(target["test"]) == test]
    if len(targets) != 1:
        raise ValueError(f"Expected one target for Test {test:03d}, got {len(targets)}")
    return config, targets[0]


def load_source(test: int, path: Path) -> dict[str, Any]:
    config = json.loads(path.read_text(encoding="utf-8"))
    sources = [source for source in config["tests"] if int(source["test"]) == test]
    if len(sources) != 1:
        raise ValueError(f"Expected one evidence source for Test {test:03d}")
    return sources[0]


def load_evidence_records(source: dict[str, Any]) -> list[dict[str, Any]]:
    branch = str(source["branch"])
    mode = str(source["mode"])
    output: list[dict[str, Any]] = []
    if mode == "manifest":
        experiment_dir = str(source["experiment_dir"])
        for season in SEASONS:
            path = f"{experiment_dir}/seasonal_evidence/{season}/manifest.json"
            manifest = json.loads(git_show(branch, path))
            for record in manifest.get("records", []):
                copied = dict(record)
                copied["season"] = season
                output.append(copied)
        return output
    if mode == "published_index":
        index = json.loads(git_show(branch, str(source["index_path"])))
        return [dict(record) for record in index.get("records", [])]
    raise ValueError(f"Unsupported source mode {mode}")


def collection_for(record: dict[str, Any]) -> str:
    platform = str(record.get("platform") or "").lower()
    item_id = str(record.get("item_id") or "").upper()
    if "sentinel" in platform or item_id.startswith("S2"):
        return "sentinel-2-l2a"
    if "landsat" in platform or item_id.startswith(("LT", "LE", "LC", "LO")):
        return "landsat-c2-l2"
    raise ValueError(f"Unsupported platform/item: {platform} {item_id}")


def fetch_item(collection: str, item_id: str) -> dict[str, Any]:
    encoded = quote(item_id, safe="")
    url = f"{PC_STAC}/collections/{collection}/items/{encoded}"
    return request_json("GET", url)


def asset_key(
    item: dict[str, Any],
    exact: tuple[str, ...],
    common_names: tuple[str, ...] = (),
) -> str | None:
    assets = item.get("assets") or {}
    if not isinstance(assets, dict):
        return None
    for key in exact:
        if key in assets:
            return key
    lowered = {str(key).lower(): str(key) for key in assets}
    for key in exact:
        match = lowered.get(key.lower())
        if match:
            return match
    wanted = {name.lower() for name in common_names}
    for key, raw_asset in assets.items():
        if not isinstance(raw_asset, dict):
            continue
        bands = raw_asset.get("eo:bands") or raw_asset.get("raster:bands") or []
        for band in bands:
            if not isinstance(band, dict):
                continue
            common = str(band.get("common_name") or "").lower()
            if common in wanted:
                return str(key)
    return None


def target_grid(target: dict[str, Any]) -> tuple[str, tuple[float, float, float, float], int, int]:
    lon = float(target["lon"])
    lat = float(target["lat"])
    zone = int(math.floor((lon + 180.0) / 6.0) + 1)
    epsg = 32600 + zone if lat >= 0 else 32700 + zone
    crs = f"EPSG:{epsg}"
    xs, ys = transform("EPSG:4326", crs, [lon], [lat])
    half_width = float(target["width_m"]) / 2.0
    half_height = float(target["height_m"]) / 2.0
    bounds = (
        xs[0] - half_width,
        ys[0] - half_height,
        xs[0] + half_width,
        ys[0] + half_height,
    )
    resolution = float(target["resolution_m"])
    width = max(1, int(round(float(target["width_m"]) / resolution)))
    height = max(1, int(round(float(target["height_m"]) / resolution)))
    return crs, bounds, width, height


def read_asset(
    item: dict[str, Any],
    key: str,
    *,
    collection: str,
    crs: str,
    bounds: tuple[float, float, float, float],
    width: int,
    height: int,
    nearest: bool,
) -> np.ndarray:
    asset = item["assets"][key]
    href = sign_href(str(asset["href"]), collection)
    dst_transform = from_bounds(*bounds, width=width, height=height)
    destination = np.full((height, width), np.nan, dtype=np.float32)
    env = {
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "GDAL_HTTP_MULTIRANGE": "YES",
        "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    }
    with rasterio.Env(**env):
        with rasterio.open(href) as src:
            reproject(
                source=rasterio.band(src, 1),
                destination=destination,
                src_transform=src.transform,
                src_crs=src.crs,
                src_nodata=src.nodata,
                dst_transform=dst_transform,
                dst_crs=crs,
                dst_nodata=np.nan,
                resampling=Resampling.nearest if nearest else Resampling.bilinear,
            )
    return destination


def measure_landsat(
    item: dict[str, Any],
    target: dict[str, Any],
    threshold: float,
    sensitivity: float,
) -> dict[str, Any]:
    collection = "landsat-c2-l2"
    green_key = asset_key(item, ("green",), ("green",))
    swir_key = asset_key(item, ("swir16", "swir1"), ("swir16", "swir1"))
    qa_key = asset_key(item, ("qa_pixel", "QA_PIXEL"))
    if not green_key or not swir_key or not qa_key:
        raise KeyError(f"Missing Landsat green/SWIR1/QA assets: {green_key} {swir_key} {qa_key}")
    crs, bounds, width, height = target_grid(target)
    kwargs = {
        "collection": collection,
        "crs": crs,
        "bounds": bounds,
        "width": width,
        "height": height,
    }
    green_dn = read_asset(item, green_key, nearest=False, **kwargs)
    swir_dn = read_asset(item, swir_key, nearest=False, **kwargs)
    qa = read_asset(item, qa_key, nearest=True, **kwargs)
    qa_finite = np.isfinite(qa)
    qa_int = np.where(qa_finite, qa, 1).astype(np.uint32)
    valid = qa_finite & landsat_qa_valid_mask(qa_int)
    green = landsat_surface_reflectance(green_dn)
    swir = landsat_surface_reflectance(swir_dn)
    physical = (
        np.isfinite(green)
        & np.isfinite(swir)
        & (green >= -0.2)
        & (green <= 1.6)
        & (swir >= -0.2)
        & (swir <= 1.6)
    )
    valid &= physical
    index = mndwi(green, swir, valid)
    resolution = float(target["resolution_m"])
    result = measure_mndwi_water_area(
        index,
        pixel_area_m2=resolution * resolution,
        threshold=threshold,
        sensitivity=sensitivity,
    )
    return measurement_dict(result, width * height, green_key, swir_key, qa_key)


def measure_sentinel(
    item: dict[str, Any],
    target: dict[str, Any],
    threshold: float,
    sensitivity: float,
) -> dict[str, Any]:
    collection = "sentinel-2-l2a"
    green_key = asset_key(item, ("B03", "green"), ("green",))
    swir_key = asset_key(item, ("B11", "swir16", "swir1"), ("swir16", "swir1"))
    scl_key = asset_key(item, ("SCL", "scl", "scene-classification"))
    if not green_key or not swir_key or not scl_key:
        raise KeyError(f"Missing Sentinel green/SWIR1/SCL assets: {green_key} {swir_key} {scl_key}")
    crs, bounds, width, height = target_grid(target)
    kwargs = {
        "collection": collection,
        "crs": crs,
        "bounds": bounds,
        "width": width,
        "height": height,
    }
    green_raw = read_asset(item, green_key, nearest=False, **kwargs)
    swir_raw = read_asset(item, swir_key, nearest=False, **kwargs)
    scl = read_asset(item, scl_key, nearest=True, **kwargs)
    scl_finite = np.isfinite(scl)
    scl_int = np.where(scl_finite, scl, 0).astype(np.int16)
    valid = scl_finite & sentinel_scl_valid_mask(scl_int)
    green = green_raw.astype(np.float64) * 0.0001
    swir = swir_raw.astype(np.float64) * 0.0001
    physical = (
        np.isfinite(green)
        & np.isfinite(swir)
        & (green >= 0.0)
        & (green <= 1.6)
        & (swir >= 0.0)
        & (swir <= 1.6)
    )
    valid &= physical
    index = mndwi(green, swir, valid)
    resolution = float(target["resolution_m"])
    result = measure_mndwi_water_area(
        index,
        pixel_area_m2=resolution * resolution,
        threshold=threshold,
        sensitivity=sensitivity,
    )
    return measurement_dict(result, width * height, green_key, swir_key, scl_key)


def measurement_dict(
    result: Any,
    total_pixels: int,
    green_key: str,
    swir_key: str,
    quality_key: str,
) -> dict[str, Any]:
    valid_fraction = result.valid_pixels / total_pixels if total_pixels else 0.0
    return {
        "valid_pixels": result.valid_pixels,
        "total_pixels": total_pixels,
        "valid_fraction": round(valid_fraction, 6),
        "central_water_pixels": result.central_water_pixels,
        "conservative_water_pixels": result.conservative_water_pixels,
        "upper_water_pixels": result.upper_water_pixels,
        "pixel_area_m2": result.pixel_area_m2,
        "central_area_m2": result.central_area_m2,
        "conservative_area_m2": result.conservative_area_m2,
        "upper_area_m2": result.upper_area_m2,
        "central_area_km2": result.central_area_km2,
        "conservative_area_km2": result.conservative_area_km2,
        "upper_area_km2": result.upper_area_km2,
        "green_asset": green_key,
        "swir1_asset": swir_key,
        "quality_asset": quality_key,
    }


def measure_record(
    record: dict[str, Any],
    target: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    output = {
        "test": int(target["test"]),
        "target": str(target["name"]),
        "group": str(target["group"]),
        "season": str(record.get("season")),
        "year": record.get("year"),
        "date": record.get("date"),
        "platform": record.get("platform"),
        "item_id": record.get("item_id"),
        "evidence_status": record.get("status"),
        "measurement_status": "skipped",
    }
    if record.get("status") != "ok":
        output["reason"] = "evidence_not_accepted"
        return output
    item_id = str(record.get("item_id") or "")
    if not item_id:
        output["measurement_status"] = "error"
        output["reason"] = "missing_item_id"
        return output
    collection = collection_for(record)
    output["collection"] = collection
    try:
        item = fetch_item(collection, item_id)
        threshold = float(config["threshold"])
        sensitivity = float(config["sensitivity"])
        if collection == "landsat-c2-l2":
            measured = measure_landsat(item, target, threshold, sensitivity)
        else:
            measured = measure_sentinel(item, target, threshold, sensitivity)
        output.update(measured)
        minimum = float(config["minimum_valid_fraction"])
        output["measurement_status"] = (
            "ok" if float(measured["valid_fraction"]) >= minimum else "low_valid_fraction"
        )
        output["threshold"] = threshold
        output["sensitivity"] = sensitivity
    except Exception as exc:
        output["measurement_status"] = "error"
        output["reason"] = f"{type(exc).__name__}: {exc}"
        print(
            "MEASUREMENT ERROR",
            output["test"],
            output["season"],
            output["year"],
            item_id,
            repr(exc),
            flush=True,
        )
    return output


def write_outputs(test: int, target: dict[str, Any], records: list[dict[str, Any]]) -> None:
    root = Path("water_measurements") / f"test_{test:03d}"
    root.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": 1,
        "method": "MNDWI=(Green-SWIR1)/(Green+SWIR1), fixed AOI, QA/SCL masked",
        "scope": "open surface water inside the configured fixed AOI",
        "target": target,
        "records": records,
        "accepted_measurements": sum(r.get("measurement_status") == "ok" for r in records),
        "low_valid_measurements": sum(
            r.get("measurement_status") == "low_valid_fraction" for r in records
        ),
        "errors": sum(r.get("measurement_status") == "error" for r in records),
    }
    (root / "measurements.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    fieldnames = sorted({key for record in records for key in record})
    with (root / "measurements.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure open surface-water area for one test")
    parser.add_argument("--test", type=int, required=True)
    parser.add_argument(
        "--targets",
        type=Path,
        default=Path("config/water_measurement_targets.json"),
    )
    parser.add_argument(
        "--sources",
        type=Path,
        default=Path("config/satellite_integrity_sources.json"),
    )
    args = parser.parse_args()

    config, target = load_target(args.test, args.targets)
    source = load_source(args.test, args.sources)
    evidence = load_evidence_records(source)
    expected = {(season, year) for season in SEASONS for year in range(1990, 2027)}
    actual = {(str(record.get("season")), int(record["year"])) for record in evidence}
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise RuntimeError(f"Evidence slots mismatch; missing={missing}, extra={extra}")

    measured: list[dict[str, Any]] = []
    for record in sorted(evidence, key=lambda row: (str(row.get("season")), int(row["year"]))):
        print(
            f"Test {args.test:03d} {record.get('season')} {record.get('year')}",
            flush=True,
        )
        measured.append(measure_record(record, target, config))
    write_outputs(args.test, target, measured)

    usable = [record for record in measured if record.get("measurement_status") == "ok"]
    by_season = {
        season: sum(record.get("measurement_status") == "ok" and record["season"] == season for record in measured)
        for season in SEASONS
    }
    print("USABLE", len(usable), by_season, flush=True)
    if any(count < 20 for count in by_season.values()):
        print("WARNING: fewer than 20 usable measurements in a season", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
