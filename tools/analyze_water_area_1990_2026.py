from __future__ import annotations

import csv
import json
import math
import os
import time
from pathlib import Path

import numpy as np
import rasterio
import requests
from PIL import Image, ImageDraw
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject
from scipy import ndimage

REPO_ROOT = Path(__file__).resolve().parents[1]
SERIES_ROOT = REPO_ROOT / "satellite_may_1990_2026" / "53.591400_19.010717"
INPUT_MANIFEST = SERIES_ROOT / "manifest.json"
OUT = REPO_ROOT / "water_analysis_1990_2026" / "53.591400_19.010717"
OUT.mkdir(parents=True, exist_ok=True)
MASKS = OUT / "masks"
MASKS.mkdir(exist_ok=True)

LAT = 53.591400
LON = 19.010717
POND_LAT = 53.594070
POND_LON = 19.000151
# Approximate interior point of Jezioro Kuchnia, used only to identify its connected water component.
LAKE_LAT = 53.58894
LAKE_LON = 19.02326
TARGET_CRS = "EPSG:32634"
HALF_SIZE_M = 2000.0  # 4 km x 4 km analysis crop; needed because 2 km crop truncates the lake.

PC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
PC_SEARCH = PC_STAC + "/search"
PC_TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token/{collection}"
SESSION = requests.Session()
TOKENS: dict[str, str] = {}

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")

TR = Transformer.from_crs("EPSG:4326", TARGET_CRS, always_xy=True)
CX, CY = TR.transform(LON, LAT)
PX, PY = TR.transform(POND_LON, POND_LAT)
LX, LY = TR.transform(LAKE_LON, LAKE_LAT)
BOUNDS = (CX - HALF_SIZE_M, CY - HALF_SIZE_M, CX + HALF_SIZE_M, CY + HALF_SIZE_M)


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


def token(collection: str) -> str:
    if collection not in TOKENS:
        TOKENS[collection] = request_json("GET", PC_TOKEN.format(collection=collection))["token"]
    return TOKENS[collection]


def sign_href(href: str, collection: str) -> str:
    if "sig=" in href or "se=" in href:
        return href
    return href + ("&" if "?" in href else "?") + token(collection)


def stac_item(record: dict) -> dict:
    item_id = record["item_id"]
    collections = ["sentinel-2-l2a"] if "Sentinel" in str(record.get("platform")) else ["landsat-c2-l2", "landsat-c2-l1"]
    for collection in collections:
        data = request_json("POST", PC_SEARCH, json={"collections": [collection], "ids": [item_id], "limit": 2})
        feats = data.get("features", [])
        if feats:
            return feats[0]
    # final broad lookup by id
    data = request_json("POST", PC_SEARCH, json={"ids": [item_id], "limit": 5})
    feats = data.get("features", [])
    if not feats:
        raise RuntimeError(f"STAC item not found: {item_id}")
    return feats[0]


def asset_key(item: dict, exact: list[str], common_names: list[str]) -> str | None:
    assets = item.get("assets", {})
    for k in exact:
        if k in assets:
            return k
    low = {k.lower(): k for k in assets}
    for k in exact:
        if k.lower() in low:
            return low[k.lower()]
    for key, asset in assets.items():
        for band in asset.get("eo:bands", []) or []:
            if str(band.get("common_name", "")).lower() in [x.lower() for x in common_names]:
                return key
    return None


def grid(res: float):
    n = int(round((HALF_SIZE_M * 2) / res))
    return n, from_bounds(*BOUNDS, width=n, height=n)


def band_scale_offset(item: dict, key: str) -> tuple[float, float]:
    asset = item["assets"][key]
    rb = asset.get("raster:bands") or []
    if rb:
        sc = rb[0].get("scale")
        off = rb[0].get("offset")
        if sc is not None or off is not None:
            return float(sc if sc is not None else 1.0), float(off if off is not None else 0.0)
    if item.get("collection") == "landsat-c2-l2":
        return 0.0000275, -0.2
    if item.get("collection") == "sentinel-2-l2a":
        return 0.0001, 0.0
    return 1.0, 0.0


def read_band(item: dict, key: str, res: float, nearest: bool = False, scaled: bool = True) -> np.ndarray:
    n, dst_transform = grid(res)
    dst = np.full((n, n), np.nan, np.float32)
    href = sign_href(item["assets"][key]["href"], item["collection"])
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MULTIRANGE="YES", GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES"):
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
    if scaled:
        scale, offset = band_scale_offset(item, key)
        dst = dst * scale + offset
    return dst


def clear_mask(item: dict, res: float, shape: tuple[int, int]) -> np.ndarray:
    if item.get("collection") == "sentinel-2-l2a":
        key = asset_key(item, ["SCL", "scl", "scene-classification"], [])
        if not key:
            return np.ones(shape, bool)
        scl = read_band(item, key, res, nearest=True, scaled=False)
        s = np.where(np.isfinite(scl), scl, 0).astype(np.int16)
        return np.isin(s, [2, 4, 5, 6, 7])
    key = asset_key(item, ["qa_pixel", "QA_PIXEL", "qa"], [])
    if not key:
        return np.ones(shape, bool)
    qa = read_band(item, key, res, nearest=True, scaled=False)
    finite = np.isfinite(qa)
    q = np.where(finite, qa, 0).astype(np.uint32)
    bad = ((q & 1) != 0) | (((q >> 1) & 1) != 0) | (((q >> 2) & 1) != 0) | (((q >> 3) & 1) != 0) | (((q >> 4) & 1) != 0) | (((q >> 5) & 1) != 0)
    return finite & (~bad)


def xy_to_rc(x: float, y: float, res: float) -> tuple[int, int]:
    n, _ = grid(res)
    col = int(round((x - (CX - HALF_SIZE_M)) / (2 * HALF_SIZE_M) * (n - 1)))
    row = int(round(((CY + HALF_SIZE_M) - y) / (2 * HALF_SIZE_M) * (n - 1)))
    return max(0, min(n - 1, row)), max(0, min(n - 1, col))


def roi_masks(res: float, shape: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    n = shape[0]
    rows, cols = np.indices(shape)
    xs = (CX - HALF_SIZE_M) + (cols + 0.5) * (2 * HALF_SIZE_M / n)
    ys = (CY + HALF_SIZE_M) - (rows + 0.5) * (2 * HALF_SIZE_M / n)
    pond = (np.abs(xs - PX) <= 350) & (np.abs(ys - PY) <= 350)
    # Deliberately exclude the upstream channel/pond and neighboring waters; this box encloses Jezioro Kuchnia.
    lake = (xs >= CX - 250) & (xs <= CX + 1850) & (ys >= CY - 1550) & (ys <= CY + 550)
    return pond, lake


def connected_body(binary: np.ndarray, roi: np.ndarray, seed_rc: tuple[int, int], res: float, max_seed_distance_m: float) -> np.ndarray:
    b = binary & roi
    labels, count = ndimage.label(b, structure=np.ones((3, 3), dtype=np.uint8))
    if count == 0:
        return np.zeros_like(b)
    sr, sc = seed_rc
    label = labels[sr, sc]
    if label == 0:
        coords = np.argwhere(b)
        if coords.size == 0:
            return np.zeros_like(b)
        d2 = (coords[:, 0] - sr) ** 2 + (coords[:, 1] - sc) ** 2
        j = int(np.argmin(d2))
        if math.sqrt(float(d2[j])) * res > max_seed_distance_m:
            return np.zeros_like(b)
        rr, cc = coords[j]
        label = labels[rr, cc]
    return labels == label


def perimeter_uncertainty(mask: np.ndarray, roi: np.ndarray, pixel_area: float) -> tuple[float, float]:
    if not np.any(mask):
        return 0.0, pixel_area
    er = ndimage.binary_erosion(mask, structure=np.ones((3, 3)))
    di = ndimage.binary_dilation(mask, structure=np.ones((3, 3))) & roi
    return float(er.sum() * pixel_area), float(di.sum() * pixel_area)


def make_overlay(mndwi: np.ndarray, pond: np.ndarray, lake: np.ndarray, clear: np.ndarray, year: int) -> None:
    valid = np.isfinite(mndwi)
    vals = mndwi[valid]
    lo, hi = (-0.5, 0.7) if vals.size == 0 else (float(np.percentile(vals, 2)), float(np.percentile(vals, 98)))
    if hi <= lo:
        hi = lo + 1
    g = np.zeros(mndwi.shape, np.uint8)
    g[valid] = np.clip((mndwi[valid] - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)
    rgb = np.stack([g, g, g], axis=-1)
    rgb[~clear] = [90, 90, 90]
    rgb[lake] = [0, 110, 255]
    rgb[pond] = [0, 255, 255]
    im = Image.fromarray(rgb).resize((700, 700), Image.Resampling.NEAREST)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 699, 35), fill="white")
    d.text((8, 10), f"{year} | blue=Jezioro Kuchnia | cyan=staw", fill="black")
    im.save(MASKS / f"{year}_water_mask.png", optimize=True)


def analyze_record(record: dict) -> dict:
    year = int(record["year"])
    item = stac_item(record)
    is_s2 = item.get("collection") == "sentinel-2-l2a"
    res = 10.0 if is_s2 else 30.0
    green_key = asset_key(item, ["green", "B03", "B3", "B2", "SR_B3", "SR_B2"], ["green"])
    nir_key = asset_key(item, ["nir", "nir08", "B08", "B8", "B5", "B4", "SR_B5", "SR_B4"], ["nir", "nir08"])
    swir_key = asset_key(item, ["swir16", "B11", "B6", "B5", "SR_B6", "SR_B5"], ["swir16", "swir"])
    if not green_key or not nir_key:
        raise RuntimeError(f"Missing green/NIR assets for {year}: {list(item.get('assets', {}))}")
    green = read_band(item, green_key, res)
    nir = read_band(item, nir_key, res)
    swir = read_band(item, swir_key, res) if swir_key else None
    clear = clear_mask(item, res, green.shape)
    finite = np.isfinite(green) & np.isfinite(nir)
    ndwi = np.full(green.shape, np.nan, np.float32)
    den = green + nir
    good = finite & (np.abs(den) > 1e-6)
    ndwi[good] = (green[good] - nir[good]) / den[good]
    if swir is not None:
        mndwi = np.full(green.shape, np.nan, np.float32)
        den2 = green + swir
        good2 = np.isfinite(green) & np.isfinite(swir) & (np.abs(den2) > 1e-6)
        mndwi[good2] = (green[good2] - swir[good2]) / den2[good2]
        idx = mndwi
    else:
        mndwi = ndwi
        idx = ndwi

    # Standard spectral water rule, with a mild NDWI guard against dark non-water surfaces.
    water = clear & np.isfinite(idx) & np.isfinite(ndwi) & (idx > 0.0) & (ndwi > -0.05)
    pond_roi, lake_roi = roi_masks(res, water.shape)
    pond_seed = xy_to_rc(PX, PY, res)
    lake_seed = xy_to_rc(LX, LY, res)
    pond = connected_body(water, pond_roi, pond_seed, res, 220.0)
    lake = connected_body(water, lake_roi, lake_seed, res, 350.0)
    pixel_area = res * res
    pond_area = float(pond.sum() * pixel_area)
    lake_area = float(lake.sum() * pixel_area)
    pond_low, pond_high = perimeter_uncertainty(pond, pond_roi, pixel_area)
    lake_low, lake_high = perimeter_uncertainty(lake, lake_roi, pixel_area)
    clear_frac = float(np.mean(clear & (pond_roi | lake_roi)) / max(np.mean(pond_roi | lake_roi), 1e-9))
    manifest_clear = float(record.get("local_clear_fraction", 0) or 0)
    manifest_valid = float(record.get("local_valid_fraction", 0) or 0)
    q = min(clear_frac, manifest_clear, manifest_valid)
    confidence = "high" if q >= 0.97 else "medium" if q >= 0.80 else "low"
    make_overlay(mndwi, pond, lake, clear, year)
    return {
        "year": year,
        "date": record.get("date"),
        "platform": record.get("platform"),
        "resolution_m": int(res),
        "pond_area_m2": round(pond_area, 1),
        "pond_low_m2": round(pond_low, 1),
        "pond_high_m2": round(pond_high, 1),
        "lake_kuchnia_area_m2": round(lake_area, 1),
        "lake_low_m2": round(lake_low, 1),
        "lake_high_m2": round(lake_high, 1),
        "spectral_clear_fraction": round(clear_frac, 6),
        "manifest_local_clear_fraction": manifest_clear,
        "manifest_local_valid_fraction": manifest_valid,
        "confidence": confidence,
        "item_id": record.get("item_id"),
        "index": "MNDWI+NDWI" if swir_key else "NDWI",
    }


def main() -> None:
    manifest = json.loads(INPUT_MANIFEST.read_text(encoding="utf-8"))
    results = []
    for rec in manifest["records"]:
        print("ANALYZE", rec["year"], rec["date"], rec["platform"], flush=True)
        try:
            out = analyze_record(rec)
        except Exception as exc:
            out = {"year": rec["year"], "date": rec.get("date"), "platform": rec.get("platform"), "confidence": "failed", "error": repr(exc)}
            print("FAILED", rec["year"], repr(exc), flush=True)
        results.append(out)
        print(json.dumps(out, ensure_ascii=False), flush=True)

    ok = [r for r in results if "pond_area_m2" in r]
    if ok:
        first = next((r for r in ok if r["year"] == 1990), ok[0])
        last = next((r for r in ok if r["year"] == 2026), ok[-1])
        summary = {
            "method": "Spectral water extraction from the exact May acquisitions in the 1990-2026 image series. Landsat uses 30 m reflectance; Sentinel-2 uses 10 m. MNDWI/NDWI, QA/SCL cloud masks, and connected-component identification around fixed pond/lake seed points. No AI-generated pixels.",
            "analysis_crop": "4 km x 4 km to include the whole lake; the original 2 km images truncate Jezioro Kuchnia.",
            "pond_seed": {"lat": POND_LAT, "lon": POND_LON},
            "lake_seed": {"lat": LAKE_LAT, "lon": LAKE_LON},
            "results": results,
            "change_1990_2026": {
                "pond_m2": round(last["pond_area_m2"] - first["pond_area_m2"], 1),
                "lake_kuchnia_m2": round(last["lake_kuchnia_area_m2"] - first["lake_kuchnia_area_m2"], 1),
            },
        }
    else:
        summary = {"method": "failed", "results": results}

    (OUT / "water_area_results.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    fieldnames = sorted({k for r in results for k in r.keys()})
    with (OUT / "water_area_results.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(results)

    # contact sheet of masks
    mask_files = sorted(MASKS.glob("*_water_mask.png"))
    if mask_files:
        thumb_w = 220
        thumb_h = 220
        cols = 5
        rows = math.ceil(len(mask_files) / cols)
        sheet = Image.new("RGB", (cols * thumb_w, rows * thumb_h), "white")
        for i, p in enumerate(mask_files):
            im = Image.open(p).convert("RGB").resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
            sheet.paste(im, ((i % cols) * thumb_w, (i // cols) * thumb_h))
        sheet.save(OUT / "CONTACT_SHEET_WATER_MASKS_1990_2026.jpg", quality=92, optimize=True)

    print("DONE", OUT, flush=True)


if __name__ == "__main__":
    main()
