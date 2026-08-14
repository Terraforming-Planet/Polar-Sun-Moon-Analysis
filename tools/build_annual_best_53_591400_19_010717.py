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
from PIL import Image, ImageDraw, ImageFont
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject

LAT = 53.591400
LON = 19.010717
YEARS = list(range(2000, 2027))
HALF_SIZE_M = 1000.0  # exact 2 km x 2 km
TARGET_CRS = "EPSG:32634"
ROOT = Path("satellite_annual_best") / "53.591400_19.010717"
IMG_DIR = ROOT / "images"
IMG_DIR.mkdir(parents=True, exist_ok=True)

PC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
PC_SEARCH = PC_STAC + "/search"
PC_TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token/{collection}"

SESSION = requests.Session()
TOKENS: dict[str, str] = {}

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
    for attempt in range(7):
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


def token(collection: str) -> str:
    if collection not in TOKENS:
        TOKENS[collection] = request_json("GET", PC_TOKEN.format(collection=collection))["token"]
    return TOKENS[collection]


def sign_href(href: str, collection: str) -> str:
    if "sig=" in href or "se=" in href:
        return href
    t = token(collection)
    return href + ("&" if "?" in href else "?") + t


def asset_key(item: dict, exact: list[str], common_name: str | None = None) -> str | None:
    assets = item.get("assets", {})
    for k in exact:
        if k in assets:
            return k
    low = {k.lower(): k for k in assets}
    for k in exact:
        if k.lower() in low:
            return low[k.lower()]
    if common_name:
        for key, asset in assets.items():
            bands = asset.get("eo:bands") or asset.get("raster:bands") or []
            for band in bands:
                if str(band.get("common_name", "")).lower() == common_name.lower():
                    return key
    return None


def search(collection: str, year: int, summer: bool = True, limit: int = 100) -> list[dict]:
    end = date(year, 12, 31)
    if year == 2026:
        end = min(end, date.today())
    if summer:
        start = date(year, 5, 1)
        stop = min(end, date(year, 9, 30))
    else:
        start = date(year, 1, 1)
        stop = end
    if stop < start:
        return []
    payload = {
        "collections": [collection],
        "bbox": SEARCH_BBOX,
        "datetime": f"{start.isoformat()}/{stop.isoformat()}",
        "limit": limit,
    }
    data = request_json("POST", PC_SEARCH, json=payload)
    return data.get("features", [])


def item_date(item: dict) -> str:
    return str(item.get("properties", {}).get("datetime") or item.get("properties", {}).get("start_datetime") or "")[:10]


def cloud_cover(item: dict) -> float:
    try:
        return float(item.get("properties", {}).get("eo:cloud_cover", 100.0))
    except Exception:
        return 100.0


def day_distance(item: dict, year: int) -> int:
    try:
        return abs((datetime.fromisoformat(item_date(item)) - datetime(year, 7, 15)).days)
    except Exception:
        return 999


def target_grid(resolution_m: float):
    n = max(1, int(round((HALF_SIZE_M * 2) / resolution_m)))
    transform = from_bounds(*TARGET_BOUNDS, width=n, height=n)
    return n, n, transform


def read_asset(item: dict, key: str, resolution_m: float, nearest: bool = False, band_index: int = 1) -> np.ndarray:
    asset = item["assets"][key]
    href = sign_href(asset["href"], item["collection"])
    width, height, dst_transform = target_grid(resolution_m)
    dst = np.full((height, width), np.nan, dtype=np.float32)
    env = {
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "GDAL_HTTP_MULTIRANGE": "YES",
        "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    }
    with rasterio.Env(**env):
        with rasterio.open(href) as src:
            reproject(
                source=rasterio.band(src, band_index),
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


def valid_fraction(a: np.ndarray, positive_required: bool = False) -> float:
    valid = np.isfinite(a)
    if positive_required:
        valid &= a > 0
    return float(np.mean(valid)) if a.size else 0.0


def stretch(a: np.ndarray, low: float = 2.0, high: float = 98.0) -> np.ndarray:
    out = np.zeros(a.shape, dtype=np.float32)
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
    out[valid] = np.clip((a[valid] - lo) / (hi - lo), 0.0, 1.0)
    return out


def rgb_array(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    sr, sg, sb = stretch(r), stretch(g), stretch(b)
    rgb = np.stack([sr, sg, sb], axis=-1)
    rgb = np.clip(rgb, 0.0, 1.0) ** (1 / 1.05)
    return np.rint(rgb * 255.0).astype(np.uint8)


def pansharpen(r: np.ndarray, g: np.ndarray, b: np.ndarray, pan: np.ndarray) -> np.ndarray:
    sr, sg, sb, sp = stretch(r), stretch(g), stretch(b), stretch(pan)
    intensity = (sr + sg + sb) / 3.0
    ratio = sp / (intensity + 1e-4)
    ratio = np.clip(ratio, 0.45, 2.2)
    out = np.stack([
        np.clip(sr * ratio, 0, 1),
        np.clip(sg * ratio, 0, 1),
        np.clip(sb * ratio, 0, 1),
    ], axis=-1)
    return np.rint(out * 255).astype(np.uint8)


def save_native_and_display(rgb: np.ndarray, base_path: Path) -> tuple[str, str]:
    native = base_path.with_name(base_path.stem + "_native.png")
    display = base_path.with_name(base_path.stem + "_display1024.png")
    img = Image.fromarray(rgb, mode="RGB")
    img.save(native, optimize=True)
    img.resize((1024, 1024), Image.Resampling.LANCZOS).save(display, optimize=True)
    return native.name, display.name


def local_landsat_quality(item: dict) -> tuple[float, float]:
    qa_key = asset_key(item, ["qa_pixel", "QA_PIXEL", "qa"], None)
    if not qa_key:
        return max(0.0, 1.0 - cloud_cover(item) / 100.0), 1.0
    qa = read_asset(item, qa_key, 30.0, nearest=True)
    finite = np.isfinite(qa)
    if not np.any(finite):
        return 0.0, 0.0
    q = np.where(finite, qa, 0).astype(np.uint32)
    fill = (q & 1) != 0
    cloud = ((q >> 1) & 1) | ((q >> 2) & 1) | ((q >> 3) & 1) | ((q >> 4) & 1) | ((q >> 5) & 1)
    valid = finite & (~fill)
    if not np.any(valid):
        return 0.0, 0.0
    clear_fraction = float(np.mean((cloud == 0)[valid]))
    valid_frac = float(np.mean(valid))
    return clear_fraction, valid_frac


def choose_landsat_l1(year: int) -> tuple[dict | None, dict]:
    items = search("landsat-c2-l1", year, summer=True)
    if not items:
        items = search("landsat-c2-l1", year, summer=False)
    # Prefer globally clear scenes, then inspect local QA. Do not assume platform naming.
    items.sort(key=lambda x: (cloud_cover(x), day_distance(x, year)))
    best = None
    best_meta = {"status": "not_found"}
    best_score = math.inf
    for item in items[:14]:
        red = asset_key(item, ["red", "B3", "B4"], "red")
        green = asset_key(item, ["green", "B2", "B3"], "green")
        blue = asset_key(item, ["blue", "B1", "B2"], "blue")
        if not all([red, green, blue]):
            continue
        pan = asset_key(item, ["pan", "panchromatic", "B8"], "pan")
        try:
            clear, valid = local_landsat_quality(item)
        except Exception as exc:
            print("landsat QA failed", year, item.get("id"), repr(exc), flush=True)
            clear = max(0.0, 1.0 - cloud_cover(item) / 100.0)
            valid = 1.0
        resolution = 15 if pan else 30
        # A clear full-coverage 15 m PAN scene wins; SLC-off gaps are heavily penalized.
        score = (1.0 - clear) * 10000 + (1.0 - valid) * 12000 + cloud_cover(item) * 3 + day_distance(item, year) * 0.03 + (0 if pan else 250)
        print("LANDSAT candidate", year, item.get("id"), "date", item_date(item), "cloud", cloud_cover(item), "local_clear", round(clear, 4), "valid", round(valid, 4), "pan", bool(pan), "score", round(score, 2), flush=True)
        if score < best_score:
            best_score = score
            best = item
            best_meta = {"local_clear_fraction": clear, "valid_fraction": valid, "native_resolution_m": resolution, "pan_available": bool(pan)}
        if pan and clear >= 0.995 and valid >= 0.995:
            break
    return best, best_meta


def render_landsat(year: int, item: dict, meta: dict) -> dict:
    red = asset_key(item, ["red", "B3", "B4"], "red")
    green = asset_key(item, ["green", "B2", "B3"], "green")
    blue = asset_key(item, ["blue", "B1", "B2"], "blue")
    pan = asset_key(item, ["pan", "panchromatic", "B8"], "pan")
    assert red and green and blue
    resolution = 15.0 if pan else 30.0
    r = read_asset(item, red, resolution)
    g = read_asset(item, green, resolution)
    b = read_asset(item, blue, resolution)
    if pan:
        p = read_asset(item, pan, 15.0)
        rgb = pansharpen(r, g, b, p)
        processing = "Pansharpened natural-color display from real Landsat RGB plus native 15 m panchromatic band; deterministic Brovey-style sharpening, no AI."
    else:
        rgb = rgb_array(r, g, b)
        processing = "Natural-color display from real Landsat RGB bands; percentile display stretch only, no AI."
    dt = item_date(item)
    platform = str(item.get("properties", {}).get("platform", "Landsat")).replace("_", "-")
    base = IMG_DIR / f"{year}_{dt}_{platform}_{int(resolution)}m_2km"
    native_name, display_name = save_native_and_display(rgb, base)
    return {
        "year": year,
        "date": dt,
        "source": "USGS Landsat Collection 2 Level-1 via Microsoft Planetary Computer STAC",
        "platform": item.get("properties", {}).get("platform"),
        "item_id": item.get("id"),
        "scene_cloud_cover_percent": cloud_cover(item),
        "local_clear_fraction": round(float(meta.get("local_clear_fraction", 0)), 6),
        "local_valid_fraction": round(float(meta.get("valid_fraction", 0)), 6),
        "native_resolution_m": int(resolution),
        "crop_m": 2000,
        "files": [native_name, display_name],
        "processing": processing,
    }


def sentinel_quality(item: dict) -> tuple[float, float]:
    scl_key = asset_key(item, ["SCL", "scl", "scene-classification"], None)
    if not scl_key:
        return max(0.0, 1.0 - cloud_cover(item) / 100.0), 1.0
    scl = read_asset(item, scl_key, 20.0, nearest=True)
    finite = np.isfinite(scl)
    if not np.any(finite):
        return 0.0, 0.0
    s = np.where(finite, scl, 0).astype(np.int16)
    # SCL: 0 no data, 1 saturated, 3 shadow, 8/9 clouds, 10 cirrus, 11 snow/ice.
    bad = np.isin(s, [0, 1, 3, 8, 9, 10, 11])
    clear = float(np.mean((~bad)[finite]))
    valid = float(np.mean(finite & (s != 0)))
    return clear, valid


def choose_sentinel(year: int) -> tuple[dict | None, dict]:
    items = search("sentinel-2-l2a", year, summer=True)
    if not items:
        items = search("sentinel-2-l2a", year, summer=False)
    items.sort(key=lambda x: (cloud_cover(x), day_distance(x, year)))
    best = None
    best_meta = {"status": "not_found"}
    best_score = math.inf
    for item in items[:18]:
        rkey = asset_key(item, ["B04", "red"], "red")
        gkey = asset_key(item, ["B03", "green"], "green")
        bkey = asset_key(item, ["B02", "blue"], "blue")
        if not all([rkey, gkey, bkey]):
            continue
        try:
            clear, valid = sentinel_quality(item)
        except Exception as exc:
            print("sentinel SCL failed", year, item.get("id"), repr(exc), flush=True)
            clear = max(0.0, 1.0 - cloud_cover(item) / 100.0)
            valid = 1.0
        score = (1.0 - clear) * 10000 + (1.0 - valid) * 10000 + cloud_cover(item) * 2 + day_distance(item, year) * 0.02
        print("S2 candidate", year, item.get("id"), "date", item_date(item), "cloud", cloud_cover(item), "local_clear", round(clear, 4), "valid", round(valid, 4), "score", round(score, 2), flush=True)
        if score < best_score:
            best_score = score
            best = item
            best_meta = {"local_clear_fraction": clear, "valid_fraction": valid, "native_resolution_m": 10}
        if clear >= 0.995 and valid >= 0.995:
            break
    return best, best_meta


def render_sentinel(year: int, item: dict, meta: dict) -> dict:
    rkey = asset_key(item, ["B04", "red"], "red")
    gkey = asset_key(item, ["B03", "green"], "green")
    bkey = asset_key(item, ["B02", "blue"], "blue")
    assert rkey and gkey and bkey
    r = read_asset(item, rkey, 10.0)
    g = read_asset(item, gkey, 10.0)
    b = read_asset(item, bkey, 10.0)
    rgb = rgb_array(r, g, b)
    dt = item_date(item)
    platform = str(item.get("properties", {}).get("platform", "Sentinel-2")).replace("_", "-")
    base = IMG_DIR / f"{year}_{dt}_{platform}_10m_2km"
    native_name, display_name = save_native_and_display(rgb, base)
    return {
        "year": year,
        "date": dt,
        "source": "ESA/Copernicus Sentinel-2 Level-2A via Microsoft Planetary Computer STAC",
        "platform": item.get("properties", {}).get("platform"),
        "item_id": item.get("id"),
        "scene_cloud_cover_percent": cloud_cover(item),
        "local_clear_fraction": round(float(meta.get("local_clear_fraction", 0)), 6),
        "local_valid_fraction": round(float(meta.get("valid_fraction", 0)), 6),
        "native_resolution_m": 10,
        "crop_m": 2000,
        "files": [native_name, display_name],
        "processing": "Natural-color RGB from real Sentinel-2 B04/B03/B02 pixels; percentile display stretch and 1024 px viewing copy only, no AI.",
    }


def fallback_landsat_l2(year: int) -> tuple[dict | None, dict]:
    items = search("landsat-c2-l2", year, summer=True)
    if not items:
        items = search("landsat-c2-l2", year, summer=False)
    items.sort(key=lambda x: (cloud_cover(x), day_distance(x, year)))
    best = None
    best_meta = {}
    best_score = math.inf
    for item in items[:12]:
        if not all([
            asset_key(item, ["red"], "red"),
            asset_key(item, ["green"], "green"),
            asset_key(item, ["blue"], "blue"),
        ]):
            continue
        try:
            clear, valid = local_landsat_quality(item)
        except Exception:
            clear, valid = max(0.0, 1.0 - cloud_cover(item) / 100.0), 1.0
        score = (1 - clear) * 10000 + (1 - valid) * 10000 + cloud_cover(item) * 3 + day_distance(item, year) * 0.03
        if score < best_score:
            best_score = score
            best = item
            best_meta = {"local_clear_fraction": clear, "valid_fraction": valid}
    return best, best_meta


def render_landsat_l2(year: int, item: dict, meta: dict) -> dict:
    rkey = asset_key(item, ["red"], "red")
    gkey = asset_key(item, ["green"], "green")
    bkey = asset_key(item, ["blue"], "blue")
    assert rkey and gkey and bkey
    # Collection 2 L2 SR scale/offset. Applying it before display keeps values physically meaningful.
    r = read_asset(item, rkey, 30.0) * 2.75e-5 - 0.2
    g = read_asset(item, gkey, 30.0) * 2.75e-5 - 0.2
    b = read_asset(item, bkey, 30.0) * 2.75e-5 - 0.2
    rgb = rgb_array(r, g, b)
    dt = item_date(item)
    platform = str(item.get("properties", {}).get("platform", "Landsat")).replace("_", "-")
    base = IMG_DIR / f"{year}_{dt}_{platform}_30m_2km"
    native_name, display_name = save_native_and_display(rgb, base)
    return {
        "year": year,
        "date": dt,
        "source": "USGS Landsat Collection 2 Level-2 Surface Reflectance via Microsoft Planetary Computer STAC",
        "platform": item.get("properties", {}).get("platform"),
        "item_id": item.get("id"),
        "scene_cloud_cover_percent": cloud_cover(item),
        "local_clear_fraction": round(float(meta.get("local_clear_fraction", 0)), 6),
        "local_valid_fraction": round(float(meta.get("valid_fraction", 0)), 6),
        "native_resolution_m": 30,
        "crop_m": 2000,
        "files": [native_name, display_name],
        "processing": "Natural-color RGB from real Landsat Collection 2 surface-reflectance pixels; documented SR scale/offset plus display stretch only, no AI.",
    }


def build_contact_sheet(records: list[dict]) -> Path:
    tiles = []
    for rec in records:
        if rec.get("status") != "ok":
            continue
        display_name = rec["files"][1]
        img = Image.open(IMG_DIR / display_name).convert("RGB").resize((256, 256), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (256, 292), "white")
        canvas.paste(img, (0, 0))
        draw = ImageDraw.Draw(canvas)
        label = f"{rec['year']}  {rec['platform']}  {rec['native_resolution_m']} m\n{rec['date']}"
        draw.text((6, 260), label, fill="black")
        tiles.append(canvas)
    cols = 5
    rows = math.ceil(len(tiles) / cols)
    sheet = Image.new("RGB", (cols * 256, rows * 292), "white")
    for idx, tile in enumerate(tiles):
        sheet.paste(tile, ((idx % cols) * 256, (idx // cols) * 292))
    out = ROOT / "CONTACT_SHEET_2000_2026.jpg"
    sheet.save(out, quality=92, optimize=True)
    return out


def make_zip() -> Path:
    zpath = ROOT / "ANNUAL_BEST_2000_2026_2km.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for p in sorted(ROOT.rglob("*")):
            if p.is_file() and p != zpath:
                zf.write(p, p.relative_to(ROOT))
    return zpath


def main():
    manifest = {
        "center": {"lat": LAT, "lon": LON},
        "crop": "2 km x 2 km centered exactly on coordinate",
        "years_requested": YEARS,
        "count_requested": len(YEARS),
        "selection_policy": {
            "2000_2014": "Prefer clear full-coverage Landsat scene with native 15 m PAN when available; penalize local clouds, fill and SLC-off gaps. Fallback to Landsat Collection 2 Level-2 30 m.",
            "2015_2026": "Prefer Sentinel-2 L2A 10 m scene with best local SCL clear fraction, full coverage and low scene cloud cover, primarily May-Sep.",
        },
        "integrity": "All images derive from real satellite pixels from official USGS/ESA missions exposed through public STAC. No generative AI, synthetic filling or AI super-resolution. Files ending display1024 are only visual resizes and contain no additional ground detail.",
        "records": [],
    }

    for year in YEARS:
        print("\n===== YEAR", year, "=====", flush=True)
        rec = {"year": year, "status": "not_found"}
        try:
            if year >= 2015:
                item, meta = choose_sentinel(year)
                if item:
                    rec = render_sentinel(year, item, meta)
                    rec["status"] = "ok"
                else:
                    item2, meta2 = choose_landsat_l1(year)
                    if item2:
                        rec = render_landsat(year, item2, meta2)
                        rec["status"] = "ok"
            else:
                item, meta = choose_landsat_l1(year)
                if item:
                    rec = render_landsat(year, item, meta)
                    rec["status"] = "ok"
                else:
                    item2, meta2 = fallback_landsat_l2(year)
                    if item2:
                        rec = render_landsat_l2(year, item2, meta2)
                        rec["status"] = "ok"
        except Exception as exc:
            print("YEAR FAILED", year, repr(exc), flush=True)
            # Last-resort Level-2 fallback so one broken PAN asset does not lose a year.
            try:
                item2, meta2 = fallback_landsat_l2(year)
                if item2:
                    rec = render_landsat_l2(year, item2, meta2)
                    rec["status"] = "ok_fallback_after_error"
                    rec["primary_error"] = repr(exc)
                else:
                    rec["error"] = repr(exc)
            except Exception as exc2:
                rec["error"] = repr(exc)
                rec["fallback_error"] = repr(exc2)
        manifest["records"].append(rec)
        print("SELECTED", json.dumps(rec, ensure_ascii=False), flush=True)

    manifest["count_ok"] = sum(1 for r in manifest["records"] if str(r.get("status", "")).startswith("ok"))
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    build_contact_sheet(manifest["records"])
    zpath = make_zip()
    print("ZIP", zpath, zpath.stat().st_size, flush=True)
    for p in sorted(ROOT.rglob("*")):
        if p.is_file():
            print(p, p.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
