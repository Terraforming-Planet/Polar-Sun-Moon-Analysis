from __future__ import annotations

import json
import math
import os
import time
import zipfile
from datetime import date, datetime
from pathlib import Path

import numpy as np
import rasterio
import requests
from PIL import Image, ImageDraw
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject

LAT = 53.591400
LON = 19.010717
YEARS = list(range(1990, 2026))  # exactly 36 years
HALF_SIZE_M = 1000.0
TARGET_CRS = "EPSG:32634"
ROOT = Path("satellite_alternate_source_may_1990_2025") / "53.591400_19.010717"
IMG_DIR = ROOT / "images"
IMG_DIR.mkdir(parents=True, exist_ok=True)

# Independent delivery path from the earlier Planetary Computer pack.
STAC_ROOT = "https://earth-search.aws.element84.com/v1"
SEARCH_URL = STAC_ROOT + "/search"
SESSION = requests.Session()

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF,.jp2,.JP2")

transformer = Transformer.from_crs("EPSG:4326", TARGET_CRS, always_xy=True)
CX, CY = transformer.transform(LON, LAT)
TARGET_BOUNDS = (CX - HALF_SIZE_M, CY - HALF_SIZE_M, CX + HALF_SIZE_M, CY + HALF_SIZE_M)
SEARCH_BBOX = [LON - 0.04, LAT - 0.03, LON + 0.04, LAT + 0.03]


def request_json(method: str, url: str, **kwargs):
    last = None
    for attempt in range(8):
        r = SESSION.request(method, url, timeout=120, **kwargs)
        last = r
        if r.status_code not in (429, 500, 502, 503, 504):
            r.raise_for_status()
            return r.json()
        wait = min(30, int(r.headers.get("Retry-After", 2 ** attempt)))
        print(f"retry {r.status_code} {url} in {wait}s", flush=True)
        time.sleep(wait)
    assert last is not None
    last.raise_for_status()


def search(collection: str, year: int, limit: int = 160) -> list[dict]:
    payload = {
        "collections": [collection],
        "bbox": SEARCH_BBOX,
        "datetime": f"{year}-05-01/{year}-05-31",
        "limit": limit,
    }
    data = request_json("POST", SEARCH_URL, json=payload)
    return data.get("features", [])


def item_date(item: dict) -> str:
    p = item.get("properties", {})
    return str(p.get("datetime") or p.get("start_datetime") or "")[:10]


def cloud_cover(item: dict) -> float:
    try:
        return float(item.get("properties", {}).get("eo:cloud_cover", 100.0))
    except Exception:
        return 100.0


def day_distance(item: dict, year: int) -> int:
    try:
        return abs((datetime.fromisoformat(item_date(item)) - datetime(year, 5, 15)).days)
    except Exception:
        return 999


def asset_key(item: dict, exact: list[str], common_name: str | None = None) -> str | None:
    assets = item.get("assets", {})
    for key in exact:
        if key in assets:
            return key
    low = {k.lower(): k for k in assets}
    for key in exact:
        if key.lower() in low:
            return low[key.lower()]
    if common_name:
        for key, asset in assets.items():
            for band in (asset.get("eo:bands") or asset.get("raster:bands") or []):
                if str(band.get("common_name", "")).lower() == common_name.lower():
                    return key
    return None


def target_grid(resolution_m: float):
    n = max(1, int(round((HALF_SIZE_M * 2) / resolution_m)))
    transform = from_bounds(*TARGET_BOUNDS, width=n, height=n)
    return n, n, transform


def read_asset(item: dict, key: str, resolution_m: float, nearest: bool = False) -> np.ndarray:
    href = item["assets"][key]["href"]
    width, height, dst_transform = target_grid(resolution_m)
    dst = np.full((height, width), np.nan, dtype=np.float32)
    with rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_MULTIRANGE="YES",
        GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
    ):
        with rasterio.open(href) as src:
            reproject(
                source=rasterio.band(src, 1),
                destination=dst,
                src_transform=src.transform,
                src_crs=src.crs,
                src_nodata=src.nodata,
                dst_transform=dst_transform,
                dst_crs=TARGET_CRS,
                dst_nodata=np.nan,
                resampling=Resampling.nearest if nearest else Resampling.bilinear,
            )
    return dst


def stretch(a: np.ndarray, low: float = 2.0, high: float = 98.0) -> np.ndarray:
    out = np.zeros_like(a, dtype=np.float32)
    valid = np.isfinite(a)
    if not np.any(valid):
        return out
    vals = a[valid]
    lo, hi = np.percentile(vals, [low, high])
    if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
        lo = float(np.nanmin(vals))
        hi = float(np.nanmax(vals))
    if hi <= lo:
        out[valid] = 0.5
        return out
    out[valid] = np.clip((a[valid] - lo) / (hi - lo), 0, 1)
    return out


def rgb_array(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    rgb = np.stack([stretch(r), stretch(g), stretch(b)], axis=-1)
    rgb = np.clip(rgb, 0, 1) ** (1 / 1.05)
    return np.rint(rgb * 255).astype(np.uint8)


def save_native_and_display(rgb: np.ndarray, base: Path) -> tuple[str, str]:
    native = base.with_name(base.stem + "_native.png")
    display = base.with_name(base.stem + "_display1024.png")
    img = Image.fromarray(rgb, mode="RGB")
    img.save(native, optimize=True)
    img.resize((1024, 1024), Image.Resampling.LANCZOS).save(display, optimize=True)
    return native.name, display.name


def landsat_quality(item: dict) -> tuple[float, float]:
    qa_key = asset_key(item, ["qa_pixel", "QA_PIXEL"], None)
    if not qa_key:
        return max(0.0, 1.0 - cloud_cover(item) / 100.0), 1.0
    qa = read_asset(item, qa_key, 30.0, nearest=True)
    finite = np.isfinite(qa)
    if not np.any(finite):
        return 0.0, 0.0
    q = np.where(finite, qa, 0).astype(np.uint32)
    fill = (q & 1) != 0
    bad = (((q >> 1) & 1) | ((q >> 2) & 1) | ((q >> 3) & 1) | ((q >> 4) & 1) | ((q >> 5) & 1)) != 0
    valid = finite & (~fill)
    if not np.any(valid):
        return 0.0, 0.0
    return float(np.mean((~bad)[valid])), float(np.mean(valid))


def sentinel_quality(item: dict) -> tuple[float, float]:
    scl_key = asset_key(item, ["scl", "SCL"], None)
    if not scl_key:
        return max(0.0, 1.0 - cloud_cover(item) / 100.0), 1.0
    scl = read_asset(item, scl_key, 20.0, nearest=True)
    finite = np.isfinite(scl)
    if not np.any(finite):
        return 0.0, 0.0
    s = np.where(finite, scl, 0).astype(np.int16)
    bad = np.isin(s, [0, 1, 3, 8, 9, 10, 11])
    valid = finite & (s != 0)
    if not np.any(valid):
        return 0.0, 0.0
    return float(np.mean((~bad)[valid])), float(np.mean(valid))


def choose_best(collection: str, year: int, sensor: str) -> tuple[dict | None, dict]:
    items = search(collection, year)
    items.sort(key=lambda i: (cloud_cover(i), day_distance(i, year)))
    best = None
    best_meta: dict = {}
    best_score = math.inf
    for item in items[:28]:
        try:
            if sensor == "sentinel":
                clear, valid = sentinel_quality(item)
            else:
                clear, valid = landsat_quality(item)
        except Exception as exc:
            print("quality failed", item.get("id"), repr(exc), flush=True)
            clear = max(0.0, 1.0 - cloud_cover(item) / 100.0)
            valid = 1.0
        platform = str(item.get("properties", {}).get("platform", "")).lower()
        slc_penalty = 0.0
        if sensor == "landsat" and "landsat-7" in platform and item_date(item) >= "2003-06-01":
            slc_penalty = 1800.0
        score = ((1 - clear) * 12000 + (1 - valid) * 14000 + cloud_cover(item) * 3 + day_distance(item, year) * 0.2 + slc_penalty)
        print(sensor, year, item.get("id"), item_date(item), "cloud", round(cloud_cover(item), 3), "clear", round(clear, 4), "valid", round(valid, 4), "score", round(score, 2), flush=True)
        if score < best_score:
            best_score = score
            best = item
            best_meta = {"local_clear_fraction": clear, "valid_fraction": valid, "score": score}
        if clear >= 0.997 and valid >= 0.997 and cloud_cover(item) <= 10:
            break
    return best, best_meta


def render_landsat(year: int, item: dict, meta: dict) -> dict:
    rkey = asset_key(item, ["red"], "red")
    gkey = asset_key(item, ["green"], "green")
    bkey = asset_key(item, ["blue"], "blue")
    if not all([rkey, gkey, bkey]):
        raise RuntimeError(f"missing Landsat RGB assets for {item.get('id')}")
    r = read_asset(item, rkey, 30.0)
    g = read_asset(item, gkey, 30.0)
    b = read_asset(item, bkey, 30.0)
    rgb = rgb_array(r, g, b)
    dt = item_date(item)
    platform = str(item.get("properties", {}).get("platform", "landsat")).replace("_", "-")
    base = IMG_DIR / f"{year}_{dt}_{platform}_30m_2km"
    native, display = save_native_and_display(rgb, base)
    return {
        "year": year,
        "date": dt,
        "source": "USGS Landsat Collection 2 Level-2 mirrored by Element 84 Earth Search / AWS",
        "delivery_path": "https://earth-search.aws.element84.com/v1",
        "platform": item.get("properties", {}).get("platform"),
        "item_id": item.get("id"),
        "scene_cloud_cover_percent": cloud_cover(item),
        "local_clear_fraction": round(float(meta.get("local_clear_fraction", 0)), 6),
        "local_valid_fraction": round(float(meta.get("valid_fraction", 0)), 6),
        "native_resolution_m": 30,
        "crop_m": 2000,
        "files": [native, display],
        "processing": "Natural-color display from real Landsat RGB pixels; deterministic percentile stretch only, no AI.",
    }


def render_sentinel(year: int, item: dict, meta: dict) -> dict:
    rkey = asset_key(item, ["red", "B04"], "red")
    gkey = asset_key(item, ["green", "B03"], "green")
    bkey = asset_key(item, ["blue", "B02"], "blue")
    if not all([rkey, gkey, bkey]):
        raise RuntimeError(f"missing Sentinel RGB assets for {item.get('id')}")
    r = read_asset(item, rkey, 10.0)
    g = read_asset(item, gkey, 10.0)
    b = read_asset(item, bkey, 10.0)
    rgb = rgb_array(r, g, b)
    dt = item_date(item)
    platform = str(item.get("properties", {}).get("platform", "sentinel-2")).replace("_", "-")
    base = IMG_DIR / f"{year}_{dt}_{platform}_10m_2km"
    native, display = save_native_and_display(rgb, base)
    return {
        "year": year,
        "date": dt,
        "source": "ESA/Copernicus Sentinel-2 Level-2A mirrored by Element 84 Earth Search / AWS",
        "delivery_path": "https://earth-search.aws.element84.com/v1",
        "platform": item.get("properties", {}).get("platform"),
        "item_id": item.get("id"),
        "scene_cloud_cover_percent": cloud_cover(item),
        "local_clear_fraction": round(float(meta.get("local_clear_fraction", 0)), 6),
        "local_valid_fraction": round(float(meta.get("valid_fraction", 0)), 6),
        "native_resolution_m": 10,
        "crop_m": 2000,
        "files": [native, display],
        "processing": "Natural-color RGB from real Sentinel-2 B04/B03/B02 pixels; deterministic percentile stretch only, no AI.",
    }


def build_contact_sheet(records: list[dict]) -> Path:
    tiles = []
    for rec in records:
        if not str(rec.get("status", "")).startswith("ok"):
            continue
        img = Image.open(IMG_DIR / rec["files"][1]).convert("RGB").resize((256, 256), Image.Resampling.LANCZOS)
        tile = Image.new("RGB", (256, 304), "white")
        tile.paste(img, (0, 0))
        draw = ImageDraw.Draw(tile)
        label = f"{rec['year']}  {rec.get('platform')}  {rec.get('native_resolution_m')}m\n{rec.get('date')}  clear={rec.get('local_clear_fraction')}"
        draw.text((5, 260), label, fill="black")
        tiles.append(tile)
    cols = 4
    rows = math.ceil(len(tiles) / cols) if tiles else 1
    sheet = Image.new("RGB", (cols * 256, rows * 304), "white")
    for i, tile in enumerate(tiles):
        sheet.paste(tile, ((i % cols) * 256, (i // cols) * 304))
    out = ROOT / "CONTACT_SHEET_ALT_SOURCE_MAY_1990_2025.jpg"
    sheet.save(out, quality=93, optimize=True)
    return out


def make_zip() -> Path:
    zpath = ROOT / "ALT_SOURCE_MAY_1990_2025_36_YEARS_2km_53.591400_19.010717.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for p in sorted(ROOT.rglob("*")):
            if p.is_file() and p != zpath:
                zf.write(p, p.relative_to(ROOT))
    return zpath


def main() -> None:
    manifest = {
        "center": {"lat": LAT, "lon": LON},
        "crop": "2 km x 2 km centered exactly on coordinate",
        "month": "May only",
        "years_requested": YEARS,
        "count_requested": 36,
        "independent_delivery_path": "Element 84 Earth Search / AWS; not Microsoft Planetary Computer",
        "quality_sync": {
            "1990_2014": "Best local-quality May Landsat Collection 2 Level-2 scene, 30 m; Landsat-7 post-SLC failure scenes are heavily penalized.",
            "2015_2025": "Prefer Sentinel-2 Level-2A at 10 m. If no usable Sentinel-2 May scene exists, fallback to Landsat 30 m.",
        },
        "integrity": "Real USGS Landsat and ESA/Copernicus Sentinel-2 mission pixels mirrored through an independent public AWS STAC delivery path. No generative AI, no synthetic filling, no AI super-resolution.",
        "records": [],
    }

    for year in YEARS:
        print(f"\n===== ALT SOURCE MAY {year} =====", flush=True)
        rec: dict = {"year": year, "status": "not_found"}
        try:
            if year >= 2015:
                item, meta = choose_best("sentinel-2-l2a", year, "sentinel")
                if item:
                    rec = render_sentinel(year, item, meta)
                    rec["status"] = "ok"
                else:
                    item, meta = choose_best("landsat-c2-l2", year, "landsat")
                    if item:
                        rec = render_landsat(year, item, meta)
                        rec["status"] = "ok_landsat_fallback"
            else:
                item, meta = choose_best("landsat-c2-l2", year, "landsat")
                if item:
                    rec = render_landsat(year, item, meta)
                    rec["status"] = "ok"
        except Exception as exc:
            rec["error"] = repr(exc)
            print("YEAR FAILED", year, repr(exc), flush=True)
        manifest["records"].append(rec)
        print("SELECTED", json.dumps(rec, ensure_ascii=False), flush=True)

    manifest["count_ok"] = sum(1 for r in manifest["records"] if str(r.get("status", "")).startswith("ok"))
    manifest["count_missing"] = len(YEARS) - manifest["count_ok"]
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    build_contact_sheet(manifest["records"])
    zpath = make_zip()
    print("COUNT_OK", manifest["count_ok"], "OF", len(YEARS), flush=True)
    print("ZIP", zpath, zpath.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
