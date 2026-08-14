from __future__ import annotations

import csv
import json
import math
import shutil
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
import rasterio
from PIL import Image, ImageDraw, ImageFont
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import from_bounds, rowcol
from rasterio.warp import reproject
from scipy.ndimage import (
    binary_closing,
    binary_fill_holes,
    binary_opening,
    label,
    median_filter,
)

LAT = 53.591400
LON = 19.010717
YEARS = list(range(2015, 2026))
TARGET_CRS = "EPSG:32634"
RESOLUTION_M = 10.0
HALF_SIZE_M = 1000.0
PIXEL_AREA_M2 = RESOLUTION_M * RESOLUTION_M
ROOT = Path("satellite_third_source_sentinel1_rtc_may_2015_2025") / "53.591400_19.010717"
IMG_DIR = ROOT / "images"
ROOT.mkdir(parents=True, exist_ok=True)
IMG_DIR.mkdir(parents=True, exist_ok=True)

# Two water bodies inside the same 2 x 2 km scientific comparison window.
WATER_BODIES = {
    "jezioro_kuchnia": {
        "label": "Jezioro Kuchnia",
        "lat": 53.591400,
        "lon": 19.010717,
        "roi_radius_m": 520.0,
        "seed_search_radius_m": 100.0,
        "max_component_area_m2": 800_000.0,
    },
    "staw_w_lesie": {
        "label": "Staw w lesie",
        "lat": 53.594070,
        "lon": 19.000151,
        "roi_radius_m": 260.0,
        "seed_search_radius_m": 90.0,
        "max_component_area_m2": 90_000.0,
    },
}

CATALOG_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
COLLECTION = "sentinel-1-rtc"

transformer = Transformer.from_crs("EPSG:4326", TARGET_CRS, always_xy=True)
CX, CY = transformer.transform(LON, LAT)
TARGET_BOUNDS = (CX - HALF_SIZE_M, CY - HALF_SIZE_M, CX + HALF_SIZE_M, CY + HALF_SIZE_M)
N = int(round((HALF_SIZE_M * 2) / RESOLUTION_M))
TARGET_TRANSFORM = from_bounds(*TARGET_BOUNDS, width=N, height=N)
SEARCH_BBOX = [LON - 0.035, LAT - 0.025, LON + 0.035, LAT + 0.025]


def catalog_client():
    return pystac_client.Client.open(CATALOG_URL, modifier=planetary_computer.sign_inplace)


def item_date(item) -> str:
    dt = item.properties.get("datetime")
    if dt:
        return str(dt)[:10]
    return ""


def day_distance(item, year: int) -> int:
    try:
        return abs((datetime.fromisoformat(item_date(item)) - datetime(year, 5, 15)).days)
    except Exception:
        return 999


def orbit_key(item) -> tuple[str, int | None]:
    state = str(item.properties.get("sat:orbit_state") or "unknown").lower()
    rel = item.properties.get("sat:relative_orbit")
    try:
        rel_i = int(rel) if rel is not None else None
    except Exception:
        rel_i = None
    return state, rel_i


def valid_item(item) -> bool:
    props = item.properties
    mode = str(props.get("sar:instrument_mode") or "").upper()
    pols = {str(x).upper() for x in (props.get("sar:polarizations") or [])}
    return mode == "IW" and {"VV", "VH"}.issubset(pols) and "vv" in item.assets and "vh" in item.assets


def search_year(client, year: int) -> list:
    search = client.search(
        collections=[COLLECTION],
        bbox=SEARCH_BBOX,
        datetime=f"{year}-05-01T00:00:00Z/{year}-05-31T23:59:59Z",
        max_items=100,
    )
    items = [it for it in search.items() if valid_item(it)]
    items.sort(key=lambda it: (day_distance(it, year), item_date(it), it.id))
    print("YEAR", year, "RTC_ITEMS", len(items), [(item_date(i), orbit_key(i), i.id[:28]) for i in items], flush=True)
    return items


def choose_preferred_track(items_by_year: dict[int, list]) -> tuple[str, int | None]:
    years_by_track: dict[tuple[str, int | None], set[int]] = defaultdict(set)
    count_by_track: Counter = Counter()
    for year, items in items_by_year.items():
        for item in items:
            key = orbit_key(item)
            years_by_track[key].add(year)
            count_by_track[key] += 1
    if not years_by_track:
        raise RuntimeError("No Sentinel-1 RTC tracks found")
    ranked = sorted(
        years_by_track,
        key=lambda k: (len(years_by_track[k]), count_by_track[k], k[0] == "descending", -(k[1] or 999)),
        reverse=True,
    )
    best = ranked[0]
    print("TRACK_RANKING", [(k, len(years_by_track[k]), count_by_track[k]) for k in ranked], flush=True)
    print("PREFERRED_TRACK", best, "years", sorted(years_by_track[best]), flush=True)
    return best


def select_items_for_year(items: list, preferred_track: tuple[str, int | None], year: int) -> tuple[list, str]:
    exact = [it for it in items if orbit_key(it) == preferred_track]
    if exact:
        selected = exact
        mode = "preferred_track"
    else:
        same_state = [it for it in items if orbit_key(it)[0] == preferred_track[0]]
        selected = same_state if same_state else items
        mode = "orbit_state_fallback" if same_state else "any_track_fallback"
    # At most three repeat passes closest to mid-May. A temporal median reduces speckle/outliers.
    selected = sorted(selected, key=lambda it: (day_distance(it, year), item_date(it)))[:3]
    return selected, mode


def read_rtc_asset(item, key: str) -> np.ndarray:
    dst = np.full((N, N), np.nan, dtype=np.float32)
    href = item.assets[key].href
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
                dst_transform=TARGET_TRANSFORM,
                dst_crs=TARGET_CRS,
                dst_nodata=np.nan,
                resampling=Resampling.bilinear,
            )
    dst[(~np.isfinite(dst)) | (dst <= 0)] = np.nan
    return dst


def linear_to_db(a: np.ndarray) -> np.ndarray:
    out = np.full_like(a, np.nan, dtype=np.float32)
    valid = np.isfinite(a) & (a > 0)
    out[valid] = 10.0 * np.log10(a[valid])
    return out


def robust_median_stack(arrays: list[np.ndarray]) -> np.ndarray:
    if not arrays:
        return np.full((N, N), np.nan, dtype=np.float32)
    with np.errstate(all="ignore"):
        return np.nanmedian(np.stack(arrays, axis=0), axis=0).astype(np.float32)


def otsu_threshold(values: np.ndarray, bins: int = 192) -> float:
    x = values[np.isfinite(values)]
    if x.size < 20:
        return float("nan")
    lo, hi = np.percentile(x, [1, 99])
    if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
        return float(np.nanmedian(x))
    hist, edges = np.histogram(np.clip(x, lo, hi), bins=bins, range=(lo, hi))
    centers = (edges[:-1] + edges[1:]) / 2.0
    weight1 = np.cumsum(hist).astype(float)
    weight2 = np.cumsum(hist[::-1]).astype(float)[::-1]
    mean1 = np.cumsum(hist * centers) / np.maximum(weight1, 1)
    mean2 = (np.cumsum((hist * centers)[::-1]) / np.maximum(weight2[::-1], 1))[::-1]
    variance = weight1[:-1] * weight2[1:] * (mean1[:-1] - mean2[1:]) ** 2
    if variance.size == 0 or not np.any(np.isfinite(variance)):
        return float(np.nanmedian(x))
    return float(centers[int(np.nanargmax(variance))])


def pixel_for_lonlat(lon: float, lat: float) -> tuple[int, int]:
    x, y = transformer.transform(lon, lat)
    rr, cc = rowcol(TARGET_TRANSFORM, x, y)
    return int(rr), int(cc)


def circle_mask(center_rc: tuple[int, int], radius_m: float) -> np.ndarray:
    rr, cc = np.ogrid[:N, :N]
    r0, c0 = center_rc
    rad_px = radius_m / RESOLUTION_M
    return (rr - r0) ** 2 + (cc - c0) ** 2 <= rad_px ** 2


def nearest_component(mask: np.ndarray, seed_rc: tuple[int, int], max_distance_m: float, max_area_m2: float):
    structure = np.ones((3, 3), dtype=np.uint8)
    labels, count = label(mask, structure=structure)
    if count == 0:
        return np.zeros_like(mask, dtype=bool), math.inf, 0
    sr, sc = seed_rc
    best_label = None
    best_dist2 = math.inf
    best_pixels = 0
    for lab in range(1, count + 1):
        coords = np.argwhere(labels == lab)
        px = int(coords.shape[0])
        area = px * PIXEL_AREA_M2
        if px < 3 or area > max_area_m2:
            continue
        d2 = np.min((coords[:, 0] - sr) ** 2 + (coords[:, 1] - sc) ** 2)
        if d2 < best_dist2:
            best_dist2 = float(d2)
            best_label = lab
            best_pixels = px
    if best_label is None:
        return np.zeros_like(mask, dtype=bool), math.inf, 0
    dist_m = math.sqrt(best_dist2) * RESOLUTION_M
    if dist_m > max_distance_m:
        return np.zeros_like(mask, dtype=bool), dist_m, 0
    return labels == best_label, dist_m, best_pixels


def measure_water(vv_db: np.ndarray, vh_db: np.ndarray, body: dict) -> tuple[dict, np.ndarray]:
    seed_rc = pixel_for_lonlat(body["lon"], body["lat"])
    roi = circle_mask(seed_rc, body["roi_radius_m"])
    valid = roi & np.isfinite(vv_db) & np.isfinite(vh_db)
    vv_vals = vv_db[valid]
    vh_vals = vh_db[valid]
    if vv_vals.size < 50:
        result = {
            "area_m2": None,
            "area_ha": None,
            "water_pixels": 0,
            "seed_distance_m": None,
            "vv_threshold_db": None,
            "vh_threshold_db": None,
            "edge_pixel_uncertainty_m2": None,
            "confidence": "low",
            "status": "insufficient_valid_pixels",
        }
        return result, np.zeros((N, N), dtype=bool)

    # Adaptive thresholds are derived separately for every annual May median and ROI.
    # Caps keep the selected class in the physically radar-dark regime.
    vv_otsu = otsu_threshold(vv_vals)
    vh_otsu = otsu_threshold(vh_vals)
    vv_thr = min(vv_otsu, -12.0) if np.isfinite(vv_otsu) else -15.0
    vh_thr = min(vh_otsu, -17.0) if np.isfinite(vh_otsu) else -20.0

    # Open water is expected to be dark in both co-pol and cross-pol channels.
    candidate = valid & (vv_db <= vv_thr) & (vh_db <= vh_thr)
    candidate = binary_closing(candidate, structure=np.ones((3, 3), dtype=bool), iterations=1)
    candidate = binary_fill_holes(candidate)
    # Gentle opening removes isolated speckle but preserves small ponds.
    candidate = binary_opening(candidate, structure=np.ones((2, 2), dtype=bool), iterations=1)
    candidate &= roi

    component, seed_dist_m, pixels = nearest_component(
        candidate,
        seed_rc,
        body["seed_search_radius_m"],
        body["max_component_area_m2"],
    )
    area_m2 = pixels * PIXEL_AREA_M2
    if pixels:
        eroded = binary_opening(component, structure=np.ones((3, 3), dtype=bool), iterations=1)
        boundary_pixels = int(np.count_nonzero(component & ~eroded))
        edge_unc = max(PIXEL_AREA_M2, boundary_pixels * PIXEL_AREA_M2 * 0.5)
    else:
        boundary_pixels = 0
        edge_unc = PIXEL_AREA_M2

    # Confidence is descriptive, not a formal probability.
    if pixels == 0:
        confidence = "medium" if seed_dist_m > body["seed_search_radius_m"] else "low"
        status = "no_connected_radar_dark_open_water_at_seed"
    else:
        seed_good = seed_dist_m <= 30.0
        contrast = float(np.nanmedian(vv_vals) - np.nanmedian(vv_db[component])) if np.any(component) else 0.0
        if seed_good and contrast >= 5.0:
            confidence = "high"
        elif contrast >= 3.0:
            confidence = "medium"
        else:
            confidence = "low"
        status = "ok"

    return {
        "area_m2": float(area_m2),
        "area_ha": float(area_m2 / 10_000.0),
        "water_pixels": int(pixels),
        "seed_distance_m": None if not np.isfinite(seed_dist_m) else float(seed_dist_m),
        "vv_threshold_db": float(vv_thr),
        "vh_threshold_db": float(vh_thr),
        "vv_otsu_db": float(vv_otsu) if np.isfinite(vv_otsu) else None,
        "vh_otsu_db": float(vh_otsu) if np.isfinite(vh_otsu) else None,
        "boundary_pixels": boundary_pixels,
        "edge_pixel_uncertainty_m2": float(edge_unc),
        "confidence": confidence,
        "status": status,
    }, component


def scale_db(a: np.ndarray, lo: float, hi: float) -> np.ndarray:
    out = np.zeros_like(a, dtype=np.uint8)
    valid = np.isfinite(a)
    if np.any(valid):
        z = np.clip((a[valid] - lo) / (hi - lo), 0, 1)
        out[valid] = np.rint(z * 255).astype(np.uint8)
    return out


def radar_rgb(vv_db: np.ndarray, vh_db: np.ndarray) -> np.ndarray:
    vv = scale_db(vv_db, -25, 2)
    vh = scale_db(vh_db, -32, -5)
    ratio = vv_db - vh_db
    rr = scale_db(ratio, 0, 18)
    # False-color SAR composite: R=VV, G=VH, B=VV-VH ratio.
    return np.stack([vv, vh, rr], axis=-1)


def overlay_water(rgb: np.ndarray, masks: dict[str, np.ndarray]) -> np.ndarray:
    out = rgb.astype(np.float32).copy()
    palette = {
        "jezioro_kuchnia": np.array([0, 230, 255], dtype=np.float32),
        "staw_w_lesie": np.array([255, 230, 0], dtype=np.float32),
    }
    for key, mask in masks.items():
        if np.any(mask):
            color = palette[key]
            out[mask] = out[mask] * 0.35 + color * 0.65
    return np.clip(out, 0, 255).astype(np.uint8)


def save_img(arr: np.ndarray, path: Path, display_size: int | None = None) -> None:
    img = Image.fromarray(arr, mode="RGB")
    if display_size:
        img = img.resize((display_size, display_size), Image.Resampling.NEAREST)
    img.save(path, optimize=True)


def grayscale_rgb(a: np.ndarray, lo: float, hi: float) -> np.ndarray:
    g = scale_db(a, lo, hi)
    return np.stack([g, g, g], axis=-1)


def annotate_contact_cell(image_path: Path, year: int, record: dict, size: int = 360) -> Image.Image:
    img = Image.open(image_path).convert("RGB").resize((size, size), Image.Resampling.NEAREST)
    canvas = Image.new("RGB", (size, size + 76), "white")
    canvas.paste(img, (0, 0))
    draw = ImageDraw.Draw(canvas)
    lake = record["measurements"]["jezioro_kuchnia"].get("area_m2")
    pond = record["measurements"]["staw_w_lesie"].get("area_m2")
    lake_txt = "n/a" if lake is None else f"{lake:,.0f} m2"
    pond_txt = "n/a" if pond is None else f"{pond:,.0f} m2"
    draw.text((8, size + 5), f"{year}  Sentinel-1 RTC", fill="black")
    draw.text((8, size + 27), f"Kuchnia: {lake_txt}", fill="black")
    draw.text((8, size + 49), f"Staw: {pond_txt}", fill="black")
    return canvas


def build_contact_sheet(records: list[dict]) -> Path:
    cells = []
    for rec in records:
        if rec.get("status") != "ok":
            continue
        p = ROOT / rec["files"]["water_overlay_display"]
        cells.append(annotate_contact_cell(p, rec["year"], rec))
    if not cells:
        raise RuntimeError("No cells for contact sheet")
    cols = 3
    cell_w, cell_h = cells[0].size
    rows = math.ceil(len(cells) / cols)
    sheet = Image.new("RGB", (cell_w * cols, cell_h * rows), "white")
    for idx, cell in enumerate(cells):
        sheet.paste(cell, ((idx % cols) * cell_w, (idx // cols) * cell_h))
    path = ROOT / "CONTACT_SHEET_SENTINEL1_RTC_MAY_2015_2025.jpg"
    sheet.save(path, quality=92, optimize=True)
    return path


def add_baseline_changes(records: list[dict]) -> None:
    for body_key in WATER_BODIES:
        baseline = None
        baseline_year = None
        for rec in records:
            m = rec.get("measurements", {}).get(body_key, {})
            area = m.get("area_m2")
            if rec.get("status") == "ok" and area is not None and m.get("status") == "ok" and area > 0:
                baseline = float(area)
                baseline_year = rec["year"]
                break
        for rec in records:
            m = rec.get("measurements", {}).get(body_key)
            if not m:
                continue
            area = m.get("area_m2")
            m["baseline_year"] = baseline_year
            if baseline is None or area is None:
                m["change_vs_baseline_m2"] = None
                m["change_vs_baseline_percent"] = None
            else:
                m["change_vs_baseline_m2"] = float(area - baseline)
                m["change_vs_baseline_percent"] = float((area - baseline) / baseline * 100.0) if baseline else None


def write_measurements_csv(records: list[dict]) -> Path:
    path = ROOT / "measurements_open_water_radar.csv"
    fields = [
        "year", "date_start", "date_end", "platforms", "orbit_state", "relative_orbit",
        "acquisitions_used", "selection_mode", "body", "body_label", "area_m2", "area_ha",
        "change_vs_baseline_m2", "change_vs_baseline_percent", "baseline_year",
        "water_pixels", "seed_distance_m", "vv_threshold_db", "vh_threshold_db",
        "edge_pixel_uncertainty_m2", "confidence", "measurement_status", "record_status",
    ]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for rec in records:
            for key, body in WATER_BODIES.items():
                m = rec.get("measurements", {}).get(key, {})
                writer.writerow({
                    "year": rec["year"],
                    "date_start": rec.get("date_start"),
                    "date_end": rec.get("date_end"),
                    "platforms": ";".join(rec.get("platforms", [])),
                    "orbit_state": rec.get("orbit_state"),
                    "relative_orbit": rec.get("relative_orbit"),
                    "acquisitions_used": rec.get("acquisitions_used", 0),
                    "selection_mode": rec.get("selection_mode"),
                    "body": key,
                    "body_label": body["label"],
                    "area_m2": m.get("area_m2"),
                    "area_ha": m.get("area_ha"),
                    "change_vs_baseline_m2": m.get("change_vs_baseline_m2"),
                    "change_vs_baseline_percent": m.get("change_vs_baseline_percent"),
                    "baseline_year": m.get("baseline_year"),
                    "water_pixels": m.get("water_pixels"),
                    "seed_distance_m": m.get("seed_distance_m"),
                    "vv_threshold_db": m.get("vv_threshold_db"),
                    "vh_threshold_db": m.get("vh_threshold_db"),
                    "edge_pixel_uncertainty_m2": m.get("edge_pixel_uncertainty_m2"),
                    "confidence": m.get("confidence"),
                    "measurement_status": m.get("status"),
                    "record_status": rec.get("status"),
                })
    return path


def make_zip() -> Path:
    path = ROOT / "THIRD_SOURCE_SENTINEL1_RTC_MAY_2015_2025_WATER_2km_53.591400_19.010717.zip"
    if path.exists():
        path.unlink()
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in sorted(ROOT.rglob("*")):
            if p.is_file() and p != path:
                z.write(p, p.relative_to(ROOT))
    return path


def main() -> None:
    client = catalog_client()
    items_by_year = {year: search_year(client, year) for year in YEARS}
    preferred_track = choose_preferred_track(items_by_year)
    records: list[dict] = []

    for year in YEARS:
        print("\n===== SENTINEL-1 RTC MAY", year, "=====", flush=True)
        items = items_by_year[year]
        if not items:
            records.append({"year": year, "status": "not_found", "reason": "No May Sentinel-1 RTC IW VV/VH scene"})
            continue
        selected, selection_mode = select_items_for_year(items, preferred_track, year)
        vv_scenes: list[np.ndarray] = []
        vh_scenes: list[np.ndarray] = []
        used = []
        for item in selected:
            try:
                vv = read_rtc_asset(item, "vv")
                vh = read_rtc_asset(item, "vh")
                valid_fraction = float(np.mean(np.isfinite(vv) & np.isfinite(vh)))
                if valid_fraction < 0.85:
                    print("SKIP_LOW_VALID", item.id, valid_fraction, flush=True)
                    continue
                vv_scenes.append(linear_to_db(vv))
                vh_scenes.append(linear_to_db(vh))
                used.append({
                    "id": item.id,
                    "date": item_date(item),
                    "platform": str(item.properties.get("platform") or ""),
                    "orbit_state": str(item.properties.get("sat:orbit_state") or ""),
                    "relative_orbit": item.properties.get("sat:relative_orbit"),
                    "valid_fraction": valid_fraction,
                })
            except Exception as exc:
                print("SCENE_FAIL", year, item.id, repr(exc), flush=True)
        if not used:
            records.append({"year": year, "status": "read_failed", "reason": "No selected RTC scene could be read"})
            continue

        vv_db = robust_median_stack(vv_scenes)
        vh_db = robust_median_stack(vh_scenes)
        # 3x3 median filter on the annual composite reduces residual SAR speckle.
        vv_fill = np.where(np.isfinite(vv_db), vv_db, 0)
        vh_fill = np.where(np.isfinite(vh_db), vh_db, 0)
        valid = np.isfinite(vv_db) & np.isfinite(vh_db)
        vv_db = np.where(valid, median_filter(vv_fill, size=3, mode="nearest"), np.nan)
        vh_db = np.where(valid, median_filter(vh_fill, size=3, mode="nearest"), np.nan)

        measurements = {}
        masks = {}
        for key, body in WATER_BODIES.items():
            m, mask = measure_water(vv_db, vh_db, body)
            measurements[key] = m
            masks[key] = mask
            print("MEASURE", year, key, json.dumps(m, ensure_ascii=False), flush=True)

        composite = radar_rgb(vv_db, vh_db)
        overlay = overlay_water(composite, masks)
        base = f"{year}_S1_RTC_MAY_MEDIAN_10m_2km"
        files = {
            "vv_native": f"images/{base}_VV_native.png",
            "vh_native": f"images/{base}_VH_native.png",
            "falsecolor_native": f"images/{base}_VV_VH_RATIO_falsecolor_native.png",
            "falsecolor_display": f"images/{base}_VV_VH_RATIO_falsecolor_display1024.png",
            "water_overlay_native": f"images/{base}_WATER_OVERLAY_native.png",
            "water_overlay_display": f"images/{base}_WATER_OVERLAY_display1024.png",
        }
        save_img(grayscale_rgb(vv_db, -25, 2), ROOT / files["vv_native"])
        save_img(grayscale_rgb(vh_db, -32, -5), ROOT / files["vh_native"])
        save_img(composite, ROOT / files["falsecolor_native"])
        save_img(composite, ROOT / files["falsecolor_display"], display_size=1024)
        save_img(overlay, ROOT / files["water_overlay_native"])
        save_img(overlay, ROOT / files["water_overlay_display"], display_size=1024)

        dates = sorted(u["date"] for u in used)
        track = orbit_key(selected[0]) if selected else preferred_track
        rec = {
            "year": year,
            "date_start": dates[0],
            "date_end": dates[-1],
            "source": "ESA/Copernicus Sentinel-1 RTC, delivered by Microsoft Planetary Computer",
            "collection": COLLECTION,
            "sensor_type": "C-band SAR radar",
            "processing_level": "radiometrically terrain-corrected (RTC)",
            "native_pixel_spacing_m": 10,
            "analysis_grid": {"crs": TARGET_CRS, "resolution_m": RESOLUTION_M, "width": N, "height": N, "pixel_area_m2": PIXEL_AREA_M2},
            "crop": "2 km x 2 km centered on 53.591400, 19.010717",
            "platforms": sorted({u["platform"] for u in used}),
            "orbit_state": track[0],
            "relative_orbit": track[1],
            "preferred_track": {"orbit_state": preferred_track[0], "relative_orbit": preferred_track[1]},
            "selection_mode": selection_mode,
            "acquisitions_used": len(used),
            "acquisitions": used,
            "composite_method": "per-pixel temporal median in dB across up to 3 May acquisitions on the preferred repeat track, then 3x3 median speckle filter",
            "measurements": measurements,
            "files": files,
            "status": "ok",
        }
        records.append(rec)

    add_baseline_changes(records)
    csv_path = write_measurements_csv(records)
    sheet_path = build_contact_sheet(records)

    manifest = {
        "title": "Third independent sensor verification - Sentinel-1 RTC May 2015-2025",
        "center": {"lat": LAT, "lon": LON},
        "secondary_seed": {"name": "Staw w lesie", "lat": WATER_BODIES["staw_w_lesie"]["lat"], "lon": WATER_BODIES["staw_w_lesie"]["lon"]},
        "years_requested": YEARS,
        "count_requested": len(YEARS),
        "count_ok": sum(1 for r in records if r.get("status") == "ok"),
        "source": "ESA/Copernicus Sentinel-1 C-band SAR RTC",
        "delivery": "Microsoft Planetary Computer STAC/API",
        "preferred_track": {"orbit_state": preferred_track[0], "relative_orbit": preferred_track[1]},
        "resolution": "10 m analysis grid; 100 m2 per pixel",
        "integrity": "Real radar pixels only. No generative AI, no synthetic filling, no AI super-resolution.",
        "measurement_definition": "Radar-dark, connected open-water proxy around fixed seed coordinates. This is an independent SAR verification, not a cadastral/survey measurement.",
        "measurement_method": {
            "channels": "RTC VV and VH converted to dB",
            "temporal": "May temporal median from up to 3 acquisitions on the most consistent repeat orbit track",
            "speckle_reduction": "3x3 median filter",
            "segmentation": "adaptive Otsu threshold in a fixed local ROI with conservative radar-dark caps (VV <= min(Otsu,-12 dB), VH <= min(Otsu,-17 dB))",
            "object_selection": "8-connected component nearest each fixed water-body seed; maximum seed distance and component size guards",
            "pixel_area": "100 m2 at 10 m grid",
            "reported_uncertainty": "edge_pixel_uncertainty_m2 is a pixel-edge discretization indicator only; it does not include all SAR classification uncertainty",
        },
        "important_limitations": [
            "Sentinel-1 does not provide this May time series back to 1990; this independent sensor check starts in 2015.",
            "SAR open-water detection can be affected by wind roughening, emergent/flooded vegetation, forest canopy, speckle, incidence geometry and very small water bodies.",
            "A zero result means no connected radar-dark open-water component was detected at the fixed seed under this method; it is not proof that the ground contained absolutely no moisture or water under vegetation.",
            "Percent changes use the first year with a positive, confidently connected radar-open-water result for each body as its SAR baseline.",
        ],
        "outputs": {
            "measurements_csv": csv_path.name,
            "contact_sheet": sheet_path.name,
            "images_directory": "images",
        },
        "records": records,
    }
    manifest_path = ROOT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    zip_path = make_zip()
    print("COUNT_OK", manifest["count_ok"], "OF", manifest["count_requested"], flush=True)
    print("CSV", csv_path, csv_path.stat().st_size, flush=True)
    print("CONTACT", sheet_path, sheet_path.stat().st_size, flush=True)
    print("ZIP", zip_path, zip_path.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
