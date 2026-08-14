from __future__ import annotations

import csv
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import (
    binary_closing,
    binary_dilation,
    binary_fill_holes,
    binary_opening,
    label,
    median_filter,
)

BASE_PATH = Path(__file__).with_name("build_third_source_sentinel1_rtc_water_2015_2025.py")
spec = importlib.util.spec_from_file_location("s1base", BASE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("Cannot import Sentinel-1 base builder")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

REFINED_CSV = base.ROOT / "measurements_open_water_radar_refined.csv"
REFINED_SHEET = base.ROOT / "CONTACT_SHEET_SENTINEL1_RTC_MAY_2015_2025_REFINED.jpg"


def clean_components(mask: np.ndarray, min_pixels: int = 3) -> np.ndarray:
    labs, n = label(mask, structure=np.ones((3, 3), dtype=np.uint8))
    out = np.zeros_like(mask, dtype=bool)
    for i in range(1, n + 1):
        c = labs == i
        if int(c.sum()) >= min_pixels:
            out |= c
    return out


def nearest_component(mask: np.ndarray, seed_rc: tuple[int, int], max_dist_m: float, max_area_m2: float) -> tuple[np.ndarray, float]:
    labs, n = label(mask, structure=np.ones((3, 3), dtype=np.uint8))
    sr, sc = seed_rc
    best = None
    best_d2 = math.inf
    for i in range(1, n + 1):
        coords = np.argwhere(labs == i)
        if coords.size == 0:
            continue
        area = coords.shape[0] * base.PIXEL_AREA_M2
        if area > max_area_m2:
            continue
        d2 = float(np.min((coords[:, 0] - sr) ** 2 + (coords[:, 1] - sc) ** 2))
        if d2 < best_d2:
            best_d2 = d2
            best = i
    if best is None:
        return np.zeros_like(mask, dtype=bool), math.inf
    dist = math.sqrt(best_d2) * base.RESOLUTION_M
    if dist > max_dist_m:
        return np.zeros_like(mask, dtype=bool), dist
    return labs == best, dist


def fixed_water_candidate(vv_db: np.ndarray, vh_db: np.ndarray, valid_roi: np.ndarray) -> np.ndarray:
    # Fixed, conservative radar-dark rule on one consistent RTC repeat track.
    # The second term keeps very dark VV water even if cross-pol is roughened by wind.
    return valid_roi & (((vv_db <= -12.0) & (vh_db <= -16.5)) | (vv_db <= -15.0))


def build_stable_envelope(annual: dict[int, dict], body: dict) -> tuple[np.ndarray, np.ndarray, dict]:
    seed = base.pixel_for_lonlat(body["lon"], body["lat"])
    roi = base.circle_mask(seed, body["roi_radius_m"])
    stack = []
    for year in base.YEARS:
        vv = annual[year]["vv_db"]
        vh = annual[year]["vh_db"]
        valid = roi & np.isfinite(vv) & np.isfinite(vh)
        # Slightly loose rule only for finding pixels repeatedly behaving like open water.
        cand = valid & (((vv <= -11.5) & (vh <= -16.0)) | (vv <= -14.5))
        cand = binary_closing(cand, structure=np.ones((3, 3), dtype=bool), iterations=1)
        stack.append(cand)
    frequency = np.sum(np.stack(stack, axis=0), axis=0)
    # A stable core must look radar-dark in at least 3 independent May annual composites.
    stable = roi & (frequency >= 3)
    stable = binary_closing(stable, structure=np.ones((3, 3), dtype=bool), iterations=1)
    stable = binary_fill_holes(stable)
    stable = clean_components(stable, min_pixels=3)
    core, dist = nearest_component(stable, seed, max_dist_m=140.0, max_area_m2=body["max_component_area_m2"])
    if not np.any(core):
        # Fallback to a two-year stable core for a very small/ephemeral pond.
        stable2 = roi & (frequency >= 2)
        stable2 = binary_closing(stable2, structure=np.ones((3, 3), dtype=bool), iterations=1)
        stable2 = clean_components(stable2, min_pixels=3)
        core, dist = nearest_component(stable2, seed, max_dist_m=140.0, max_area_m2=body["max_component_area_m2"])
    if not np.any(core):
        raise RuntimeError(f"Could not build stable radar-water core for {body['label']}")
    dilation_px = 6 if body["label"] == "Jezioro Kuchnia" else 4
    envelope = binary_dilation(core, structure=np.ones((3, 3), dtype=bool), iterations=dilation_px) & roi
    diagnostics = {
        "stable_core_pixels": int(core.sum()),
        "stable_core_area_m2": float(core.sum() * base.PIXEL_AREA_M2),
        "envelope_pixels": int(envelope.sum()),
        "envelope_area_m2": float(envelope.sum() * base.PIXEL_AREA_M2),
        "core_seed_distance_m": float(dist),
        "frequency_required": 3,
        "envelope_dilation_m": float(dilation_px * base.RESOLUTION_M),
    }
    return core, envelope, diagnostics


def measure_year(vv: np.ndarray, vh: np.ndarray, body: dict, core: np.ndarray, envelope: np.ndarray) -> tuple[dict, np.ndarray]:
    seed = base.pixel_for_lonlat(body["lon"], body["lat"])
    valid = envelope & np.isfinite(vv) & np.isfinite(vh)
    candidate = fixed_water_candidate(vv, vh, valid)
    close_size = 5 if body["label"] == "Jezioro Kuchnia" else 3
    candidate = binary_closing(candidate, structure=np.ones((close_size, close_size), dtype=bool), iterations=1)
    candidate = binary_fill_holes(candidate)
    candidate = binary_opening(candidate, structure=np.ones((2, 2), dtype=bool), iterations=1)
    candidate &= envelope
    candidate = clean_components(candidate, min_pixels=3)

    # Keep the connected water object nearest the fixed seed; the stable envelope prevents
    # unrelated dark fields/forest from becoming part of the water measurement.
    component, seed_dist = nearest_component(
        candidate,
        seed,
        max_dist_m=body["seed_search_radius_m"] + 35.0,
        max_area_m2=float(envelope.sum() * base.PIXEL_AREA_M2),
    )
    # If wind breaks the lake into nearby pieces, reconnect only pieces that intersect a
    # 20 m dilation of the chosen component, still inside the historical stable envelope.
    if np.any(component):
        reach = binary_dilation(component, structure=np.ones((3, 3), dtype=bool), iterations=2)
        labs, n = label(candidate, structure=np.ones((3, 3), dtype=np.uint8))
        merged = component.copy()
        for i in range(1, n + 1):
            c = labs == i
            if np.any(c & reach):
                merged |= c
        component = merged & envelope

    pixels = int(component.sum())
    area = float(pixels * base.PIXEL_AREA_M2)
    if pixels:
        inner = binary_opening(component, structure=np.ones((3, 3), dtype=bool), iterations=1)
        boundary = int(np.count_nonzero(component & ~inner))
        edge_unc = float(max(base.PIXEL_AREA_M2, boundary * base.PIXEL_AREA_M2 * 0.5))
        water_vv = float(np.nanmedian(vv[component]))
        water_vh = float(np.nanmedian(vh[component]))
        core_overlap = float(np.count_nonzero(component & core) / max(1, np.count_nonzero(core)))
    else:
        boundary = 0
        edge_unc = float(base.PIXEL_AREA_M2)
        water_vv = None
        water_vh = None
        core_overlap = 0.0

    if pixels == 0:
        confidence = "medium"
        status = "no_connected_open_water_detected"
    elif core_overlap >= 0.55 and seed_dist <= 40:
        confidence = "high"
        status = "ok"
    elif core_overlap >= 0.25:
        confidence = "medium"
        status = "ok"
    else:
        confidence = "low"
        status = "classification_anomaly"

    return {
        "area_m2": area,
        "area_ha": area / 10_000.0,
        "water_pixels": pixels,
        "seed_distance_m": None if not np.isfinite(seed_dist) else float(seed_dist),
        "fixed_vv_threshold_db": -12.0,
        "fixed_vh_threshold_db": -16.5,
        "very_dark_vv_override_db": -15.0,
        "median_water_vv_db": water_vv,
        "median_water_vh_db": water_vh,
        "stable_core_overlap_fraction": core_overlap,
        "boundary_pixels": boundary,
        "edge_pixel_uncertainty_m2": edge_unc,
        "confidence": confidence,
        "status": status,
    }, component


def add_changes(refined: dict[int, dict[str, dict]]) -> None:
    for body_key in base.WATER_BODIES:
        baseline_year = None
        baseline = None
        for year in base.YEARS:
            m = refined[year][body_key]
            if m["status"] == "ok" and m["area_m2"] > 0:
                baseline_year = year
                baseline = m["area_m2"]
                break
        for year in base.YEARS:
            m = refined[year][body_key]
            m["baseline_year"] = baseline_year
            if baseline is None:
                m["change_vs_baseline_m2"] = None
                m["change_vs_baseline_percent"] = None
            else:
                m["change_vs_baseline_m2"] = m["area_m2"] - baseline
                m["change_vs_baseline_percent"] = ((m["area_m2"] - baseline) / baseline * 100.0) if baseline else None


def write_csv(records_by_year: dict[int, dict], refined: dict[int, dict[str, dict]]) -> None:
    fields = [
        "year", "date_start", "date_end", "platforms", "orbit_state", "relative_orbit", "acquisitions_used",
        "body", "body_label", "area_m2", "area_ha", "change_vs_baseline_m2", "change_vs_baseline_percent",
        "baseline_year", "water_pixels", "seed_distance_m", "fixed_vv_threshold_db", "fixed_vh_threshold_db",
        "very_dark_vv_override_db", "median_water_vv_db", "median_water_vh_db", "stable_core_overlap_fraction",
        "edge_pixel_uncertainty_m2", "confidence", "measurement_status",
    ]
    with REFINED_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for year in base.YEARS:
            rec = records_by_year[year]
            for key, body in base.WATER_BODIES.items():
                m = refined[year][key]
                w.writerow({
                    "year": year,
                    "date_start": rec.get("date_start"),
                    "date_end": rec.get("date_end"),
                    "platforms": ";".join(rec.get("platforms", [])),
                    "orbit_state": rec.get("orbit_state"),
                    "relative_orbit": rec.get("relative_orbit"),
                    "acquisitions_used": rec.get("acquisitions_used"),
                    "body": key,
                    "body_label": body["label"],
                    **{k: m.get(k) for k in fields if k in m},
                })


def refined_overlay(rgb: np.ndarray, masks: dict[str, np.ndarray]) -> np.ndarray:
    return base.overlay_water(rgb, masks)


def make_contact(records_by_year: dict[int, dict]) -> None:
    cells = []
    size = 360
    for year in base.YEARS:
        rec = records_by_year[year]
        p = base.ROOT / rec["files"]["water_overlay_refined_display"]
        img = Image.open(p).convert("RGB").resize((size, size), Image.Resampling.NEAREST)
        canvas = Image.new("RGB", (size, size + 78), "white")
        canvas.paste(img, (0, 0))
        draw = ImageDraw.Draw(canvas)
        lk = rec["measurements"]["jezioro_kuchnia"]
        st = rec["measurements"]["staw_w_lesie"]
        draw.text((8, size + 5), f"{year}  S1 RTC refined", fill="black")
        draw.text((8, size + 28), f"Kuchnia: {lk['area_m2']:,.0f} m2  {lk['confidence']}", fill="black")
        draw.text((8, size + 51), f"Staw: {st['area_m2']:,.0f} m2  {st['confidence']}", fill="black")
        cells.append(canvas)
    cols = 3
    cw, ch = cells[0].size
    rows = math.ceil(len(cells) / cols)
    sheet = Image.new("RGB", (cw * cols, ch * rows), "white")
    for i, cell in enumerate(cells):
        sheet.paste(cell, ((i % cols) * cw, (i // cols) * ch))
    sheet.save(REFINED_SHEET, quality=93, optimize=True)


def main() -> None:
    manifest_path = base.ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    records_by_year = {int(r["year"]): r for r in manifest["records"] if r.get("status") == "ok"}

    client = base.catalog_client()
    items_by_year = {year: base.search_year(client, year) for year in base.YEARS}
    preferred = base.choose_preferred_track(items_by_year)
    annual: dict[int, dict] = {}
    for year in base.YEARS:
        items, selection_mode = base.select_items_for_year(items_by_year[year], preferred, year)
        vv_list = []
        vh_list = []
        used = []
        for item in items:
            try:
                vv = base.read_rtc_asset(item, "vv")
                vh = base.read_rtc_asset(item, "vh")
                valid = float(np.mean(np.isfinite(vv) & np.isfinite(vh)))
                if valid < 0.85:
                    continue
                vv_list.append(base.linear_to_db(vv))
                vh_list.append(base.linear_to_db(vh))
                used.append(item.id)
            except Exception as exc:
                print("REFINE_SCENE_FAIL", year, item.id, repr(exc), flush=True)
        if not vv_list:
            raise RuntimeError(f"No usable RTC scenes for refinement {year}")
        vv = base.robust_median_stack(vv_list)
        vh = base.robust_median_stack(vh_list)
        valid = np.isfinite(vv) & np.isfinite(vh)
        vv = np.where(valid, median_filter(np.where(valid, vv, 0), size=3, mode="nearest"), np.nan)
        vh = np.where(valid, median_filter(np.where(valid, vh, 0), size=3, mode="nearest"), np.nan)
        annual[year] = {"vv_db": vv, "vh_db": vh, "used": used, "selection_mode": selection_mode}

    envelopes = {}
    envelope_diag = {}
    for key, body in base.WATER_BODIES.items():
        core, env, diag = build_stable_envelope(annual, body)
        envelopes[key] = (core, env)
        envelope_diag[key] = diag
        print("ENVELOPE", key, json.dumps(diag), flush=True)

    refined: dict[int, dict[str, dict]] = {}
    masks_by_year = {}
    for year in base.YEARS:
        refined[year] = {}
        masks_by_year[year] = {}
        for key, body in base.WATER_BODIES.items():
            core, env = envelopes[key]
            m, mask = measure_year(annual[year]["vv_db"], annual[year]["vh_db"], body, core, env)
            refined[year][key] = m
            masks_by_year[year][key] = mask
            print("REFINED", year, key, json.dumps(m), flush=True)
    add_changes(refined)

    # Preserve v1 measurements in the manifest, then make refined v2 the primary measurement set.
    for year in base.YEARS:
        rec = records_by_year[year]
        rec["measurements_v1_adaptive"] = rec.get("measurements")
        rec["measurements"] = refined[year]
        rgb = base.radar_rgb(annual[year]["vv_db"], annual[year]["vh_db"])
        overlay = refined_overlay(rgb, masks_by_year[year])
        native_name = f"images/{year}_S1_RTC_MAY_MEDIAN_10m_2km_WATER_OVERLAY_REFINED_native.png"
        display_name = f"images/{year}_S1_RTC_MAY_MEDIAN_10m_2km_WATER_OVERLAY_REFINED_display1024.png"
        base.save_img(overlay, base.ROOT / native_name)
        base.save_img(overlay, base.ROOT / display_name, display_size=1024)
        rec["files"]["water_overlay_refined_native"] = native_name
        rec["files"]["water_overlay_refined_display"] = display_name

    write_csv(records_by_year, refined)
    make_contact(records_by_year)
    manifest["measurement_version"] = 2
    manifest["measurement_v2_name"] = "stable-envelope fixed-threshold RTC verification"
    manifest["measurement_v2_method"] = {
        "orbit": {"orbit_state": preferred[0], "relative_orbit": preferred[1]},
        "fixed_rule": "((VV <= -12.0 dB AND VH <= -16.5 dB) OR VV <= -15.0 dB)",
        "stable_core": "pixel must behave radar-dark in >=3 annual May composites (fallback >=2 only if required for a tiny water body)",
        "envelope": "stable multi-year core dilated by 60 m for Lake Kuchnia and 40 m for the forest pond, clipped to fixed local ROI",
        "purpose": "prevent year-specific Otsu threshold shifts and unrelated dark fields/forest from creating false area jumps",
    }
    manifest["stable_envelope_diagnostics"] = envelope_diag
    manifest["outputs"]["measurements_csv_refined"] = REFINED_CSV.name
    manifest["outputs"]["contact_sheet_refined"] = REFINED_SHEET.name
    manifest["records"] = [records_by_year[y] for y in base.YEARS]
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    z = base.make_zip()
    print("REFINED_CSV", REFINED_CSV, REFINED_CSV.stat().st_size, flush=True)
    print("REFINED_CONTACT", REFINED_SHEET, REFINED_SHEET.stat().st_size, flush=True)
    print("REFINED_ZIP", z, z.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
