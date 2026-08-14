from __future__ import annotations

import json
import math
import shutil
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw
from rasterio.transform import from_bounds

import build_annual_best_53_591400_19_010717 as base
import build_experiment_001_seasonal_evidence as exp1

LAT = 53.578593
LON = 19.068364
YEARS = list(range(1990, 2027))
BRANCH = "experiment-003-jezioro-nogat-53-578593-19-068364"
EXP = Path("experiments/experiment_003_jezioro_nogat")
SEASONS = EXP / "seasonal_evidence"

# Corrected Test 003 frame. The earlier 2 km x 2 km square cropped Jezioro Nogat.
# The replacement frame is deliberately portrait-oriented, matching the user's
# full-lake reference view: the whole lake plus surrounding fields/wetlands must
# be visible in every year with one fixed north-up footprint.
FRAME_WIDTH_M = 4000.0
FRAME_HEIGHT_M = 6000.0
FRAME_LABEL = "4x6km"
DISPLAY_WIDTH = 800
DISPLAY_HEIGHT = 1200

_ORIGINAL_RENDER_LANDSAT = base.render_landsat
_ORIGINAL_RENDER_LANDSAT_L2 = base.render_landsat_l2
_ORIGINAL_RENDER_SENTINEL = base.render_sentinel


def rectangular_target_grid(resolution_m: float):
    width = max(1, int(round(FRAME_WIDTH_M / resolution_m)))
    height = max(1, int(round(FRAME_HEIGHT_M / resolution_m)))
    transform = from_bounds(*base.TARGET_BOUNDS, width=width, height=height)
    return width, height, transform


def save_native_and_display_rectangular(rgb, base_path: Path) -> tuple[str, str]:
    native = base_path.with_name(base_path.stem + "_native.png")
    display = base_path.with_name(base_path.stem + "_display800x1200.jpg")
    img = Image.fromarray(rgb, mode="RGB")
    img.save(native, optimize=True)
    # Viewing copy only. JPEG + deterministic resize keeps the downloadable
    # package compact; it does not create additional ground detail.
    img.resize((DISPLAY_WIDTH, DISPLAY_HEIGHT), Image.Resampling.LANCZOS).save(
        display, quality=88, optimize=True
    )
    return native.name, display.name


def normalize_render_record(rec: dict) -> dict:
    renamed: list[str] = []
    for name in rec.get("files", []):
        old = base.IMG_DIR / name
        new_name = name.replace("_2km_", f"_{FRAME_LABEL}_")
        new = base.IMG_DIR / new_name
        if old.exists() and old != new:
            if new.exists():
                new.unlink()
            old.rename(new)
        renamed.append(new_name)
    rec["files"] = renamed
    rec.pop("crop_m", None)
    rec["crop_width_m"] = int(FRAME_WIDTH_M)
    rec["crop_height_m"] = int(FRAME_HEIGHT_M)
    rec["frame_orientation"] = "portrait_north_up"
    rec["display_copy"] = "800x1200 JPEG viewing copy; native-resolution PNG retained"
    return rec


def render_landsat_full_lake(year: int, item: dict, meta: dict) -> dict:
    return normalize_render_record(_ORIGINAL_RENDER_LANDSAT(year, item, meta))


def render_landsat_l2_full_lake(year: int, item: dict, meta: dict) -> dict:
    return normalize_render_record(_ORIGINAL_RENDER_LANDSAT_L2(year, item, meta))


def render_sentinel_full_lake(year: int, item: dict, meta: dict) -> dict:
    return normalize_render_record(_ORIGINAL_RENDER_SENTINEL(year, item, meta))


def configure() -> None:
    # Reuse only the validated acquisition/QA logic. Experiment 002 imagery is
    # never read or copied. The AOI and all output paths are replaced here.
    exp1.LAT = LAT
    exp1.LON = LON
    exp1.YEARS = YEARS
    exp1.BRANCH = BRANCH
    exp1.EXP = EXP
    exp1.ERRORS = EXP / "errors" / "do_wyjasnienia"
    exp1.SEASONS = SEASONS
    exp1.KNOWN_REVIEW = {}

    base.LAT = LAT
    base.LON = LON
    base.YEARS = YEARS
    base.CX, base.CY = base.transformer.transform(LON, LAT)
    half_w = FRAME_WIDTH_M / 2.0
    half_h = FRAME_HEIGHT_M / 2.0
    base.TARGET_BOUNDS = (
        base.CX - half_w,
        base.CY - half_h,
        base.CX + half_w,
        base.CY + half_h,
    )
    # Search region must fully cover the corrected frame with margin.
    base.SEARCH_BBOX = [LON - 0.06, LAT - 0.05, LON + 0.06, LAT + 0.05]
    base.target_grid = rectangular_target_grid
    base.save_native_and_display = save_native_and_display_rectangular
    base.render_landsat = render_landsat_full_lake
    base.render_landsat_l2 = render_landsat_l2_full_lake
    base.render_sentinel = render_sentinel_full_lake
    base.ROOT = EXP
    base.IMG_DIR = EXP / "images"
    base.IMG_DIR.mkdir(parents=True, exist_ok=True)


def write_contact_sheet(name: str, manifest: dict) -> None:
    root = SEASONS / name
    img_dir = root / "images"
    tiles: list[Image.Image] = []
    for rec in manifest["records"]:
        if rec.get("status") != "ok":
            continue
        display_name = rec["files"][1]
        src = Image.open(img_dir / display_name).convert("RGB")
        preview = src.resize((180, 270), Image.Resampling.LANCZOS)
        tile = Image.new("RGB", (180, 320), "white")
        tile.paste(preview, (0, 0))
        draw = ImageDraw.Draw(tile)
        fallback = " FALLBACK" if rec.get("is_fallback_month") else ""
        draw.text(
            (5, 274),
            f"{rec['year']} {rec.get('date')}\n{rec.get('platform')} {rec.get('native_resolution_m')}m{fallback}",
            fill="black",
        )
        tiles.append(tile)

    cols = 6
    rows = max(1, math.ceil(len(tiles) / cols))
    sheet = Image.new("RGB", (cols * 180, rows * 320), "white")
    for idx, tile in enumerate(tiles):
        sheet.paste(tile, ((idx % cols) * 180, (idx // cols) * 320))
    sheet.save(root / f"CONTACT_SHEET_{name.upper()}_1990_2026.jpg", quality=92, optimize=True)


def rebuild_season_zip(name: str, zip_path: Path) -> None:
    root = SEASONS / name
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for p in sorted(root.rglob("*")):
            if p.is_file() and p != zip_path and p.suffix.lower() != ".zip":
                zf.write(p, p.relative_to(root))


def normalize_season_output(name: str, result: dict) -> dict:
    root = SEASONS / name
    historical = root / f"EXPERIMENT_001_{name.upper()}_1990_2026_37_YEARS_2km_53.591400_19.010717.zip"
    if historical.exists():
        historical.unlink()

    new = root / f"TEST003_{name.upper()}_1990_2026_37_YEARS_{FRAME_LABEL}_53.578593_19.068364.zip"
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["experiment"] = "Experiment 003 - Jezioro Nogat full-lake water and shoreline monitoring"
    manifest["center"] = {"lat": LAT, "lon": LON}
    manifest["aoi"] = {
        "width_m": int(FRAME_WIDTH_M),
        "height_m": int(FRAME_HEIGHT_M),
        "orientation": "portrait_north_up",
        "purpose": "whole Jezioro Nogat plus surrounding landscape visible in every annual frame",
    }
    manifest["previous_frame_rejected"] = "2 km x 2 km cropped the lake and is superseded"
    manifest["dataset_role"] = "independent TerraWater lake comparison case"
    manifest["test_number"] = 3
    manifest["object_name"] = "Jezioro Nogat"
    manifest["no_experiment_002_imagery_reused"] = True
    manifest["zip"] = str(new)
    manifest.pop("zip_bytes", None)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    write_contact_sheet(name, manifest)
    rebuild_season_zip(name, new)
    result.update({"zip": str(new), "zip_bytes": new.stat().st_size})
    return result


def build_combined_zip() -> Path:
    out = EXP / "TEST003_JEZIORO_NOGAT_1990_2026_FULL_LAKE_4x6km_53.578593_19.068364.zip"
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for season in ("spring", "autumn"):
            root = SEASONS / season
            for p in sorted(root.rglob("*")):
                if not p.is_file() or p.suffix.lower() == ".zip":
                    continue
                zf.write(p, Path(season) / p.relative_to(root))
        for extra in ("EXPERIMENT_003_REPORT.md", "experiment.json", "EVIDENCE_POLICY.json"):
            p = EXP / extra
            if p.exists():
                zf.write(p, p.name)
    return out


def accepted_years(manifest: dict) -> list[int]:
    return [int(r["year"]) for r in manifest["records"] if r.get("status") == "ok"]


def platform_list(*manifests: dict) -> list[str]:
    values: set[str] = set()
    for manifest in manifests:
        for rec in manifest["records"]:
            if rec.get("status") == "ok" and rec.get("platform"):
                values.add(str(rec["platform"]))
    return sorted(values)


def write_metadata(spring: dict, autumn: dict) -> None:
    EXP.mkdir(parents=True, exist_ok=True)
    spring_manifest = json.loads((SEASONS / "spring" / "manifest.json").read_text(encoding="utf-8"))
    autumn_manifest = json.loads((SEASONS / "autumn" / "manifest.json").read_text(encoding="utf-8"))
    spring_ok = accepted_years(spring_manifest)
    autumn_ok = accepted_years(autumn_manifest)
    spring_missing = [y for y in YEARS if y not in spring_ok]
    autumn_missing = [y for y in YEARS if y not in autumn_ok]

    policy = {
        "experiment_id": "003",
        "object": "Jezioro Nogat",
        "center": {"lat": LAT, "lon": LON},
        "frame": {
            "width_m": int(FRAME_WIDTH_M),
            "height_m": int(FRAME_HEIGHT_M),
            "label": FRAME_LABEL,
            "orientation": "portrait_north_up",
            "supersedes": "rejected 2 km x 2 km crop",
        },
        "years": {"start": 1990, "end": 2026, "count": 37},
        "season_policy": {
            "spring": {"preferred_month": 5, "fallback_months": [4, 6]},
            "autumn": {"preferred_month": 9, "fallback_months": [10, 11]},
        },
        "rules": {
            "real_acquisition_date_required": True,
            "fallback_must_be_labeled": True,
            "future_observations_never_invented": True,
            "autumn_2026_must_remain_missing_until_observed": True,
            "google_maps_reference_not_measurement_evidence": True,
            "generative_fill_forbidden": True,
            "ai_super_resolution_forbidden": True,
            "cross_year_exact_duplicate_rejected": True,
            "experiment_002_imagery_must_not_be_reused": True,
            "whole_lake_frame_required": True,
        },
        "primary_sources": [
            "USGS Landsat Collection 2",
            "ESA/Copernicus Sentinel-2 Level-2A",
        ],
        "radar_control_planned": "ESA/Copernicus Sentinel-1 RTC",
        "supplementary_candidates": ["NASA ASTER", "JAXA ALOS"],
        "measurement_status": "not_started; this build is evidence acquisition only",
    }
    (EXP / "EVIDENCE_POLICY.json").write_text(json.dumps(policy, indent=2, ensure_ascii=False), encoding="utf-8")

    config = {
        "experiment_id": "003",
        "name": "Jezioro Nogat",
        "center": {"lat": LAT, "lon": LON},
        "frame_width_m": int(FRAME_WIDTH_M),
        "frame_height_m": int(FRAME_HEIGHT_M),
        "frame_orientation": "portrait_north_up",
        "years": YEARS,
        "seasons": {
            "spring": {"preferred": 5, "fallback": [4, 6]},
            "autumn": {"preferred": 9, "fallback": [10, 11]},
        },
        "spring_missing_years": spring_missing,
        "autumn_missing_years": autumn_missing,
        "platforms_used": platform_list(spring_manifest, autumn_manifest),
    }
    (EXP / "experiment.json").write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")

    report = f"""# Experiment 003 — Jezioro Nogat satellite evidence 1990–2026

## Corrected AOI

- Object: **Jezioro Nogat**
- Center: **{LAT:.6f}, {LON:.6f}**
- Corrected fixed frame: **4 km × 6 km, portrait, north-up**
- Years requested: **1990–2026 (37 years)**
- The previous 2 km × 2 km Test 003 dataset is rejected because it cropped the lake.
- The corrected dataset is rebuilt from source satellite products; Experiment 002 imagery is not reused.

## Seasonal acquisition policy

- Spring: May preferred; fallback April, then June.
- Autumn: September preferred; fallback October, then November.
- Every accepted image keeps its real acquisition date and product ID in the manifest.
- A fallback month is explicitly labeled and is never renamed as the preferred month.
- Autumn 2026 is not fabricated before the season occurs.

## Current evidence build

- Spring accepted scenes: **{spring.get('count_ok', 0)} / 37**
- Spring missing years: **{spring_missing or 'none'}**
- Autumn accepted scenes: **{autumn.get('count_ok', 0)} / 37**
- Autumn missing years: **{autumn_missing or 'none'}**
- Platforms used: **{', '.join(platform_list(spring_manifest, autumn_manifest))}**

## Scientific status

This is an evidence-acquisition package only. It does **not** yet claim water loss, shoreline retreat or a causal mechanism. Quantitative comparison is a separate measurement stage after image/spectral QA.
"""
    (EXP / "EXPERIMENT_003_REPORT.md").write_text(report, encoding="utf-8")


def main() -> None:
    # Remove the entire incorrect 2 km x 2 km evidence set before redownloading.
    if EXP.exists():
        shutil.rmtree(EXP)

    configure()
    SEASONS.mkdir(parents=True, exist_ok=True)

    spring = normalize_season_output("spring", exp1.build_season("spring", [5, 4, 6]))
    autumn = normalize_season_output("autumn", exp1.build_season("autumn", [9, 10, 11]))

    write_metadata(spring, autumn)
    # Rebuild the seasonal archives once more so they include the final metadata files.
    for name in ("spring", "autumn"):
        root = SEASONS / name
        zips = list(root.glob("TEST003_*.zip"))
        if zips:
            rebuild_season_zip(name, zips[0])

    combined = build_combined_zip()

    spring_manifest = json.loads((SEASONS / "spring" / "manifest.json").read_text(encoding="utf-8"))
    autumn_manifest = json.loads((SEASONS / "autumn" / "manifest.json").read_text(encoding="utf-8"))
    spring_ok = accepted_years(spring_manifest)
    autumn_ok = accepted_years(autumn_manifest)
    summary = {
        "experiment": 3,
        "object": "Jezioro Nogat",
        "center": {"lat": LAT, "lon": LON},
        "frame_width_m": int(FRAME_WIDTH_M),
        "frame_height_m": int(FRAME_HEIGHT_M),
        "frame_orientation": "portrait_north_up",
        "previous_2km_dataset": "deleted_and_rejected",
        "spring_count_ok": len(spring_ok),
        "autumn_count_ok": len(autumn_ok),
        "spring_missing_years": [y for y in YEARS if y not in spring_ok],
        "autumn_missing_years": [y for y in YEARS if y not in autumn_ok],
        "platforms_used": platform_list(spring_manifest, autumn_manifest),
        "combined_zip": str(combined),
        "combined_zip_bytes": combined.stat().st_size,
    }
    (EXP / "BUILD_SUMMARY.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
