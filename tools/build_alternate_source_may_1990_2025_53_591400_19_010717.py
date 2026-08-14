from __future__ import annotations

import json
import math
import os
import re
import time
import zipfile
from datetime import datetime
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

# Independent delivery path from the earlier Microsoft Planetary Computer pack.
STAC_ROOT = "https://earth-search.aws.element84.com/v1"
SEARCH_URL = STAC_ROOT + "/search"
SESSION = requests.Session()
LANDSAT_COLLECTION = "landsat-c2-l2"
SENTINEL_COLLECTIONS = ["sentinel-2-c1-l2a", "sentinel-2-pre-c1-l2a"]
GCS_LANDSAT_ROOT = "https://storage.googleapis.com/gcp-public-data-landsat"
GCS_SENTINEL_ROOT = "https://storage.googleapis.com/gcp-public-data-sentinel-2"

# Known official Sentinel-2 product from the first manifest, used only when Earth Search has an ingestion gap.
KNOWN_GCS_SENTINEL_PRODUCTS = {
    2022: "S2B_MSIL2A_20220510T100029_N0400_R122_T33UYV_20220510T145506",
}

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF,.jp2,.JP2")
os.environ.setdefault("CPL_VSIL_CURL_USE_HEAD", "NO")

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
            if r.status_code >= 400:
                print("HTTP ERROR", r.status_code, url, r.text[:1200], flush=True)
            r.raise_for_status()
            return r.json()
        wait = min(30, int(r.headers.get("Retry-After", 2 ** attempt)))
        print(f"retry {r.status_code} {url} in {wait}s", flush=True)
        time.sleep(wait)
    assert last is not None
    last.raise_for_status()


def search(collection: str, year: int, limit: int = 160) -> list[dict]:
    params = {
        "collections": collection,
        "bbox": ",".join(str(x) for x in SEARCH_BBOX),
        "datetime": f"{year}-05-01T00:00:00Z/{year}-05-31T23:59:59Z",
        "limit": str(limit),
    }
    data = request_json("GET", SEARCH_URL, params=params)
    return data.get("features", [])


def search_sentinel(year: int) -> list[dict]:
    items: list[dict] = []
    seen: set[str] = set()
    for collection in SENTINEL_COLLECTIONS:
        try:
            for item in search(collection, year):
                iid = str(item.get("id"))
                if iid not in seen:
                    seen.add(iid)
                    items.append(item)
        except requests.HTTPError as exc:
            print("Sentinel collection unavailable", collection, year, repr(exc), flush=True)
    return items


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


def item_full_bbox_coverage(item: dict) -> bool:
    bbox = item.get("bbox") or []
    if len(bbox) < 4:
        return True
    return bbox[0] <= SEARCH_BBOX[0] and bbox[1] <= SEARCH_BBOX[1] and bbox[2] >= SEARCH_BBOX[2] and bbox[3] >= SEARCH_BBOX[3]


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


def read_url(href: str, resolution_m: float, nearest: bool = False) -> np.ndarray:
    width, height, dst_transform = target_grid(resolution_m)
    dst = np.full((height, width), np.nan, dtype=np.float32)
    with rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_MULTIRANGE="YES",
        GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
        CPL_VSIL_CURL_USE_HEAD="NO",
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


def read_asset(item: dict, key: str, resolution_m: float, nearest: bool = False) -> np.ndarray:
    return read_url(item["assets"][key]["href"], resolution_m, nearest)


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


def pansharpen(r: np.ndarray, g: np.ndarray, b: np.ndarray, pan: np.ndarray) -> np.ndarray:
    sr, sg, sb, sp = stretch(r), stretch(g), stretch(b), stretch(pan)
    intensity = (sr + sg + sb) / 3.0
    ratio = np.clip(sp / (intensity + 1e-4), 0.45, 2.2)
    out = np.stack([np.clip(sr * ratio, 0, 1), np.clip(sg * ratio, 0, 1), np.clip(sb * ratio, 0, 1)], axis=-1)
    return np.rint(out * 255).astype(np.uint8)


def save_native_and_display(rgb: np.ndarray, base: Path) -> tuple[str, str]:
    native = base.with_name(base.stem + "_native.png")
    display = base.with_name(base.stem + "_display1024.png")
    img = Image.fromarray(rgb, mode="RGB")
    img.save(native, optimize=True)
    img.resize((1024, 1024), Image.Resampling.LANCZOS).save(display, optimize=True)
    return native.name, display.name


def landsat_quality(item: dict) -> tuple[float, float]:
    # Catalog metadata is independent of pixel delivery; pixels come from Google Cloud below.
    clear = max(0.0, 1.0 - cloud_cover(item) / 100.0)
    valid = 1.0 if item_full_bbox_coverage(item) else 0.35
    return clear, valid


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


def choose_best_landsat(year: int) -> tuple[dict | None, dict]:
    return choose_from_items(search(LANDSAT_COLLECTION, year), year, "landsat")


def choose_best_sentinel(year: int) -> tuple[dict | None, dict]:
    return choose_from_items(search_sentinel(year), year, "sentinel")


def choose_from_items(items: list[dict], year: int, sensor: str) -> tuple[dict | None, dict]:
    items.sort(key=lambda i: (cloud_cover(i), day_distance(i, year)))
    best = None
    best_meta: dict = {}
    best_score = math.inf
    for item in items[:30]:
        try:
            clear, valid = sentinel_quality(item) if sensor == "sentinel" else landsat_quality(item)
        except Exception as exc:
            print("quality failed", item.get("id"), repr(exc), flush=True)
            clear = max(0.0, 1.0 - cloud_cover(item) / 100.0)
            valid = 1.0 if item_full_bbox_coverage(item) else 0.35
        platform = str(item.get("properties", {}).get("platform", "")).lower()
        slc_penalty = 0.0
        if sensor == "landsat" and "landsat-7" in platform and item_date(item) >= "2003-06-01":
            slc_penalty = 1800.0
        score = ((1 - clear) * 12000 + (1 - valid) * 18000 + cloud_cover(item) * 3 + day_distance(item, year) * 0.2 + slc_penalty)
        print(sensor, year, item.get("id"), item_date(item), "cloud", round(cloud_cover(item), 3), "clear", round(clear, 4), "valid", round(valid, 4), "score", round(score, 2), flush=True)
        if score < best_score:
            best_score = score
            best = item
            best_meta = {"local_clear_fraction": clear, "valid_fraction": valid, "score": score}
        if clear >= 0.997 and valid >= 0.997 and cloud_cover(item) <= 10:
            break
    return best, best_meta


def gcs_landsat_product_prefix(item: dict) -> str:
    iid = str(item.get("id", ""))
    parts = iid.split("_")
    if len(parts) < 5:
        raise RuntimeError(f"unexpected Landsat id {iid}")
    sensor = parts[0]
    pathrow = parts[2]
    acq = parts[3]
    path, row = pathrow[:3], pathrow[3:]
    listing_url = GCS_LANDSAT_ROOT
    for level in ("L1TP", "L1GT", "L1GS"):
        prefix = f"{sensor}/01/{path}/{row}/{sensor}_{level}_{pathrow}_{acq}_"
        r = SESSION.get(listing_url, params={"prefix": prefix, "delimiter": "/"}, timeout=120)
        r.raise_for_status()
        text = r.text
        prefixes = re.findall(r"<Prefix>([^<]+)</Prefix>", text)
        for p in prefixes:
            if p.startswith(prefix) and p.endswith("/") and p != prefix:
                return p
        keys = re.findall(r"<Key>([^<]+)</Key>", text)
        for key in keys:
            if key.startswith(prefix):
                return key.rsplit("/", 1)[0] + "/"
    raise RuntimeError(f"Google Cloud Collection-1 product not found for {iid}")


def gcs_landsat_band(prefix: str, product_id: str, band: int | str) -> str:
    return f"{GCS_LANDSAT_ROOT}/{prefix}{product_id}_B{band}.TIF"


def render_landsat(year: int, item: dict, meta: dict) -> dict:
    prefix = gcs_landsat_product_prefix(item)
    product_id = prefix.rstrip("/").split("/")[-1]
    sensor = product_id.split("_")[0]
    if sensor in ("LT04", "LT05", "LE07"):
        rb, gb, bb = 3, 2, 1
    elif sensor in ("LC08", "LO08"):
        rb, gb, bb = 4, 3, 2
    else:
        raise RuntimeError(f"unsupported Google Landsat sensor {sensor}")
    pan_available = sensor in ("LE07", "LC08", "LO08")
    resolution = 15.0 if pan_available else 30.0
    r = read_url(gcs_landsat_band(prefix, product_id, rb), resolution)
    g = read_url(gcs_landsat_band(prefix, product_id, gb), resolution)
    b = read_url(gcs_landsat_band(prefix, product_id, bb), resolution)
    if pan_available:
        pan = read_url(gcs_landsat_band(prefix, product_id, 8), 15.0)
        rgb = pansharpen(r, g, b, pan)
        processing = "Natural-color Landsat sharpened deterministically with the real 15 m panchromatic band; no AI."
    else:
        rgb = rgb_array(r, g, b)
        processing = "Natural-color display from real Landsat RGB bands; deterministic percentile stretch only, no AI."
    dt = item_date(item)
    platform = str(item.get("properties", {}).get("platform", sensor)).replace("_", "-")
    base = IMG_DIR / f"{year}_{dt}_{platform}_{int(resolution)}m_2km_GCS"
    native, display = save_native_and_display(rgb, base)
    return {
        "year": year,
        "date": dt,
        "source": "USGS/NASA Landsat Collection 1 public archive on Google Cloud Storage",
        "delivery_path": "https://storage.googleapis.com/gcp-public-data-landsat",
        "catalog_metadata": "Element 84 Earth Search Landsat Collection 2",
        "platform": item.get("properties", {}).get("platform"),
        "catalog_item_id": item.get("id"),
        "gcs_product_id": product_id,
        "scene_cloud_cover_percent": cloud_cover(item),
        "local_clear_fraction": round(float(meta.get("local_clear_fraction", 0)), 6),
        "local_valid_fraction": round(float(meta.get("valid_fraction", 0)), 6),
        "native_resolution_m": int(resolution),
        "crop_m": 2000,
        "files": [native, display],
        "processing": processing,
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
    base = IMG_DIR / f"{year}_{dt}_{platform}_10m_2km_E84"
    native, display = save_native_and_display(rgb, base)
    return {
        "year": year,
        "date": dt,
        "source": "ESA/Copernicus Sentinel-2 Level-2A via Element 84 Earth Search / AWS",
        "delivery_path": STAC_ROOT,
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


def try_known_gcs_sentinel(year: int) -> dict | None:
    product = KNOWN_GCS_SENTINEL_PRODUCTS.get(year)
    if not product:
        return None
    m = re.search(r"_T(\d{2})([A-Z])([A-Z]{2})_", product)
    if not m:
        return None
    zone, band, square = m.groups()
    root = f"{GCS_SENTINEL_ROOT}/L2/tiles/{zone}/{band}/{square}/{product}.SAFE/"
    meta_url = root + "MTD_MSIL2A.xml"
    r = SESSION.get(meta_url, timeout=120)
    if r.status_code != 200:
        print("known GCS Sentinel metadata unavailable", year, r.status_code, meta_url, flush=True)
        return None
    text = r.text
    files: dict[str, str] = {}
    for band_name in ("B02", "B03", "B04"):
        candidates = re.findall(r">([^<]*IMG_DATA/R10m/[^<]*_" + band_name + r"_10m)<", text)
        if not candidates:
            candidates = re.findall(r">([^<]*IMG_DATA/[^<]*_" + band_name + r")<", text)
        if not candidates:
            print("known GCS Sentinel missing", band_name, year, flush=True)
            return None
        rel = candidates[0].lstrip("/")
        if not rel.endswith(".jp2"):
            rel += ".jp2"
        files[band_name] = root + rel
    b = read_url(files["B02"], 10.0)
    g = read_url(files["B03"], 10.0)
    rr = read_url(files["B04"], 10.0)
    rgb = rgb_array(rr, g, b)
    dt = product.split("_")[2][:8]
    dt_fmt = f"{dt[:4]}-{dt[4:6]}-{dt[6:8]}"
    platform = product[:3].lower().replace("s2", "sentinel-2")
    base = IMG_DIR / f"{year}_{dt_fmt}_{platform}_10m_2km_GCS"
    native, display = save_native_and_display(rgb, base)
    return {
        "year": year,
        "date": dt_fmt,
        "source": "ESA/Copernicus Sentinel-2 Level-2A public archive on Google Cloud Storage",
        "delivery_path": "https://storage.googleapis.com/gcp-public-data-sentinel-2",
        "platform": platform,
        "product_id": product,
        "scene_cloud_cover_percent": None,
        "local_clear_fraction": None,
        "local_valid_fraction": 1.0,
        "native_resolution_m": 10,
        "crop_m": 2000,
        "files": [native, display],
        "processing": "Natural-color RGB from real Sentinel-2 10 m B04/B03/B02 pixels; deterministic percentile stretch only, no AI.",
        "status": "ok_gcs_sentinel_fallback",
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
        label = f"{rec['year']}  {rec.get('platform')}  {rec.get('native_resolution_m')}m\n{rec.get('date')}  {str(rec.get('source',''))[:31]}"
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
        "independent_delivery_paths": [
            "Google Cloud public Landsat archive",
            "Element 84 Earth Search / AWS Sentinel-2",
            "Google Cloud public Sentinel-2 fallback where needed",
        ],
        "quality_sync": {
            "1990_2014": "Best May Landsat scene from independent Earth Search metadata, real pixels fetched from Google Cloud public Landsat archive; 15 m panchromatic sharpening on Landsat-7/8 when available.",
            "2015_2025": "Prefer Sentinel-2 10 m via Element 84/AWS; fallback to Google Cloud Landsat or Google Cloud Sentinel-2 for catalog gaps.",
        },
        "integrity": "Real USGS/NASA Landsat and ESA/Copernicus Sentinel-2 pixels. No generative AI, no synthetic filling, no AI super-resolution.",
        "records": [],
    }

    for year in YEARS:
        print(f"\n===== ALT SOURCE MAY {year} =====", flush=True)
        rec: dict = {"year": year, "status": "not_found"}
        try:
            if year >= 2015:
                item, meta = choose_best_sentinel(year)
                if item:
                    rec = render_sentinel(year, item, meta)
                    rec["status"] = "ok"
                else:
                    known = try_known_gcs_sentinel(year)
                    if known:
                        rec = known
                    else:
                        item, meta = choose_best_landsat(year)
                        if item:
                            rec = render_landsat(year, item, meta)
                            rec["status"] = "ok_landsat_fallback"
            else:
                item, meta = choose_best_landsat(year)
                if item:
                    rec = render_landsat(year, item, meta)
                    rec["status"] = "ok"
        except Exception as exc:
            print("PRIMARY YEAR FAILED", year, repr(exc), flush=True)
            # If a modern Sentinel year failed, try the known Google Sentinel product before giving up.
            try:
                known = try_known_gcs_sentinel(year)
                if known:
                    rec = known
                else:
                    rec["error"] = repr(exc)
            except Exception as exc2:
                rec["error"] = repr(exc)
                rec["fallback_error"] = repr(exc2)
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
