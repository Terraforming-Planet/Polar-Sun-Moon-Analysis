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

# TEST 004: one fixed frame containing both target lakes and their surroundings.
KACZE = {"name": "Jezioro Kacze", "lat": 53.613918, "lon": 18.892053}
GLEBOCZEK = {"name": "Jezioro Głęboczek", "lat": 53.609520, "lon": 18.872589}
TARGETS = [KACZE, GLEBOCZEK]

LAT = round((KACZE["lat"] + GLEBOCZEK["lat"]) / 2.0, 6)
LON = round((KACZE["lon"] + GLEBOCZEK["lon"]) / 2.0, 6)
YEARS = list(range(1990, 2027))
BRANCH = "experiment-004-kacze-gleboczek-53-611719-18-882321"
EXP = Path("experiments/experiment_004_kacze_gleboczek_cluster")
SEASONS = EXP / "seasonal_evidence"

# The two targets are about 1.29 km apart east-west. A 4 km x 4 km frame gives
# more than 1 km of landscape margin around both lakes and keeps every year
# directly comparable with one north-up footprint.
FRAME_WIDTH_M = 4000.0
FRAME_HEIGHT_M = 4000.0
FRAME_LABEL = "4x4km"
DISPLAY_WIDTH = 1000
DISPLAY_HEIGHT = 1000

_ORIGINAL_RENDER_LANDSAT = base.render_landsat
_ORIGINAL_RENDER_LANDSAT_L2 = base.render_landsat_l2
_ORIGINAL_RENDER_SENTINEL = base.render_sentinel


def rectangular_target_grid(resolution_m: float):
    width = max(1, int(round(FRAME_WIDTH_M / resolution_m)))
    height = max(1, int(round(FRAME_HEIGHT_M / resolution_m)))
    transform = from_bounds(*base.TARGET_BOUNDS, width=width, height=height)
    return width, height, transform


def save_native_and_display_shared(rgb, base_path: Path) -> tuple[str, str]:
    native = base_path.with_name(base_path.stem + "_native.png")
    display = base_path.with_name(base_path.stem + "_display1000x1000.jpg")
    img = Image.fromarray(rgb, mode="RGB")
    img.save(native, optimize=True)
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
    rec["frame_orientation"] = "north_up"
    rec["display_copy"] = "1000x1000 JPEG viewing copy; native-resolution PNG retained"
    rec["targets_in_frame"] = TARGETS
    return rec


def render_landsat_shared(year: int, item: dict, meta: dict) -> dict:
    return normalize_render_record(_ORIGINAL_RENDER_LANDSAT(year, item, meta))


def render_landsat_l2_shared(year: int, item: dict, meta: dict) -> dict:
    return normalize_render_record(_ORIGINAL_RENDER_LANDSAT_L2(year, item, meta))


def render_sentinel_shared(year: int, item: dict, meta: dict) -> dict:
    return normalize_render_record(_ORIGINAL_RENDER_SENTINEL(year, item, meta))


def configure() -> None:
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
    # Wider search box than the final crop to ensure candidate coverage.
    base.SEARCH_BBOX = [LON - 0.06, LAT - 0.05, LON + 0.06, LAT + 0.05]
    base.target_grid = rectangular_target_grid
    base.save_native_and_display = save_native_and_display_shared
    base.render_landsat = render_landsat_shared
    base.render_landsat_l2 = render_landsat_l2_shared
    base.render_sentinel = render_sentinel_shared
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
        preview = src.resize((240, 240), Image.Resampling.LANCZOS)
        tile = Image.new("RGB", (240, 292), "white")
        tile.paste(preview, (0, 0))
        draw = ImageDraw.Draw(tile)
        fallback = " FALLBACK" if rec.get("is_fallback_month") else ""
        draw.text(
            (5, 245),
            f"{rec['year']} {rec.get('date')}\n{rec.get('platform')} {rec.get('native_resolution_m')}m{fallback}",
            fill="black",
        )
        tiles.append(tile)

    cols = 5
    rows = max(1, math.ceil(len(tiles) / cols))
    sheet = Image.new("RGB", (cols * 240, rows * 292), "white")
    for idx, tile in enumerate(tiles):
        sheet.paste(tile, ((idx % cols) * 240, (idx // cols) * 292))
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

    new = root / f"TEST004_{name.upper()}_1990_2026_37_YEARS_{FRAME_LABEL}_{LAT:.6f}_{LON:.6f}.zip"
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["experiment"] = "Experiment 004 - Jezioro Kacze + Jezioro Głęboczek shared-frame monitoring"
    manifest["center"] = {"lat": LAT, "lon": LON}
    manifest["targets"] = TARGETS
    manifest["aoi"] = {
        "width_m": int(FRAME_WIDTH_M),
        "height_m": int(FRAME_HEIGHT_M),
        "orientation": "north_up",
        "purpose": "both target lakes and surrounding landscape visible in every annual frame",
    }
    manifest["dataset_role"] = "independent TerraWater multi-location comparison case"
    manifest["test_number"] = 4
    manifest["object_name"] = "Jezioro Kacze + Jezioro Głęboczek"
    manifest["zip"] = str(new)
    manifest.pop("zip_bytes", None)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    write_contact_sheet(name, manifest)
    rebuild_season_zip(name, new)
    result.update({"zip": str(new), "zip_bytes": new.stat().st_size})
    return result


def build_combined_zip() -> Path:
    out = EXP / f"TEST004_KACZE_GLEBOCZEK_1990_2026_SHARED_FRAME_{FRAME_LABEL}_{LAT:.6f}_{LON:.6f}.zip"
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for season in ("spring", "autumn"):
            root = SEASONS / season
            for p in sorted(root.rglob("*")):
                if not p.is_file() or p.suffix.lower() == ".zip":
                    continue
                zf.write(p, Path(season) / p.relative_to(root))
        for extra in ("EXPERIMENT_004_REPORT.md", "experiment.json", "EVIDENCE_POLICY.json"):
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
    spring_manifest = json.loads((SEASONS / "spring" / "manifest.json").read_text(encoding="utf-8"))
    autumn_manifest = json.loads((SEASONS / "autumn" / "manifest.json").read_text(encoding="utf-8"))
    spring_ok = accepted_years(spring_manifest)
    autumn_ok = accepted_years(autumn_manifest)
    spring_missing = [y for y in YEARS if y not in spring_ok]
    autumn_missing = [y for y in YEARS if y not in autumn_ok]

    policy = {
        "experiment_id": "004",
        "objects": [t["name"] for t in TARGETS],
        "center": {"lat": LAT, "lon": LON},
        "targets": TARGETS,
        "frame": {"width_m": 4000, "height_m": 4000, "orientation": "north_up"},
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
            "same_frame_for_every_year": True,
            "both_targets_must_be_inside_frame": True,
            "google_maps_reference_not_measurement_evidence": True,
            "generative_fill_forbidden": True,
            "ai_super_resolution_forbidden": True,
            "cross_year_exact_duplicate_rejected": True,
        },
        "primary_sources": ["USGS Landsat Collection 2", "ESA/Copernicus Sentinel-2 Level-2A"],
        "radar_control_planned": "ESA/Copernicus Sentinel-1 RTC",
        "measurement_status": "not_started; this build is evidence acquisition only",
    }
    (EXP / "EVIDENCE_POLICY.json").write_text(json.dumps(policy, indent=2, ensure_ascii=False), encoding="utf-8")

    config = {
        "experiment_id": "004",
        "name": "Jezioro Kacze + Jezioro Głęboczek",
        "center": {"lat": LAT, "lon": LON},
        "targets": TARGETS,
        "frame": {"width_m": 4000, "height_m": 4000, "orientation": "north_up"},
        "years": YEARS,
        "spring_missing_years": spring_missing,
        "autumn_missing_years": autumn_missing,
        "platforms_used": platform_list(spring_manifest, autumn_manifest),
    }
    (EXP / "experiment.json").write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")

    report = f"""# Experiment 004 — Jezioro Kacze + Jezioro Głęboczek, shared frame 1990–2026

## Targets
- Jezioro Kacze: **53.613918, 18.892053**
- Jezioro Głęboczek: **53.609520, 18.872589**

## Fixed shared AOI
- Center: **{LAT:.6f}, {LON:.6f}**
- Frame: **4 km × 4 km**
- Orientation: **north-up**
- Every annual image uses the same footprint so both lakes and their surroundings remain visible.

## Seasonal acquisition policy
- Spring: May preferred; fallback April, then June.
- Autumn: September preferred; fallback October, then November.
- Real acquisition dates and product IDs are preserved.
- Autumn 2026 is never fabricated before the season occurs.

## Current evidence build
- Spring accepted scenes: **{spring.get('count_ok', 0)} / 37**
- Spring missing years: **{spring_missing or 'none'}**
- Autumn accepted scenes: **{autumn.get('count_ok', 0)} / 37**
- Autumn missing years: **{autumn_missing or 'none'}**
- Platforms used: **{', '.join(platform_list(spring_manifest, autumn_manifest))}**

## Scientific status
Evidence acquisition only. No water-loss conclusion is claimed until the imagery is reviewed and measured.
"""
    (EXP / "EXPERIMENT_004_REPORT.md").write_text(report, encoding="utf-8")


def main() -> None:
    # Never mix a previous partial Test 004 build with the current fixed-frame build.
    if EXP.exists():
        shutil.rmtree(EXP)
    configure()
    SEASONS.mkdir(parents=True, exist_ok=True)

    spring = normalize_season_output("spring", exp1.build_season("spring", [5, 4, 6]))
    autumn = normalize_season_output("autumn", exp1.build_season("autumn", [9, 10, 11]))
    write_metadata(spring, autumn)
    combined = build_combined_zip()

    spring_manifest = json.loads((SEASONS / "spring" / "manifest.json").read_text(encoding="utf-8"))
    autumn_manifest = json.loads((SEASONS / "autumn" / "manifest.json").read_text(encoding="utf-8"))
    spring_ok = accepted_years(spring_manifest)
    autumn_ok = accepted_years(autumn_manifest)
    summary = {
        "experiment": 4,
        "objects": ["Jezioro Kacze", "Jezioro Głęboczek"],
        "targets": TARGETS,
        "center": {"lat": LAT, "lon": LON},
        "frame_width_m": int(FRAME_WIDTH_M),
        "frame_height_m": int(FRAME_HEIGHT_M),
        "frame_orientation": "north_up",
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
