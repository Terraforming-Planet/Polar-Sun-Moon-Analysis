from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

from PIL import Image
from pyproj import Transformer
from rasterio.transform import from_bounds

import build_experiment_004_seasonal_evidence as m

TEST = 12
LAT = 41.150000
LON = -112.600000
LAT_STR = "41.150000"
LON_STR = "-112.600000"
YEARS = list(range(1990, 2027))
BRANCH = "experiment-012-great-salt-lake-41-150000--112-600000"
EXP = Path("experiments/experiment_012_great_salt_lake")
SEASONS = EXP / "seasonal_evidence"
FRAME_WIDTH_M = 120000.0
FRAME_HEIGHT_M = 160000.0
FRAME_LABEL = "120x160km"
OUTPUT_GSD_M = 60.0
DISPLAY_WIDTH = 900
DISPLAY_HEIGHT = 1200
TARGET_CRS = "EPSG:32612"
TARGETS = [
    {"name": "Great Salt Lake", "lat": LAT, "lon": LON},
    {"name": "Gunnison Bay / north arm", "lat": 41.42, "lon": -112.75},
    {"name": "Gilbert Bay / south arm", "lat": 40.95, "lon": -112.55},
]


def fixed_regional_grid(_requested_resolution_m: float):
    width = max(1, int(round(FRAME_WIDTH_M / OUTPUT_GSD_M)))
    height = max(1, int(round(FRAME_HEIGHT_M / OUTPUT_GSD_M)))
    transform = from_bounds(*m.base.TARGET_BOUNDS, width=width, height=height)
    return width, height, transform


def save_regional(rgb, base_path: Path) -> tuple[str, str]:
    evidence = base_path.with_name(base_path.stem + "_regional60m.png")
    display = base_path.with_name(base_path.stem + "_display900x1200.jpg")
    img = Image.fromarray(rgb, mode="RGB")
    img.save(evidence, optimize=True)
    img.resize((DISPLAY_WIDTH, DISPLAY_HEIGHT), Image.Resampling.LANCZOS).save(display, quality=90, optimize=True)
    return evidence.name, display.name


def configure_globals() -> None:
    m.LAT = LAT
    m.LON = LON
    m.YEARS = YEARS
    m.BRANCH = BRANCH
    m.EXP = EXP
    m.SEASONS = SEASONS
    m.TARGETS = TARGETS
    m.FRAME_WIDTH_M = FRAME_WIDTH_M
    m.FRAME_HEIGHT_M = FRAME_HEIGHT_M
    m.FRAME_LABEL = FRAME_LABEL
    m.DISPLAY_WIDTH = DISPLAY_WIDTH
    m.DISPLAY_HEIGHT = DISPLAY_HEIGHT
    m.base.TARGET_CRS = TARGET_CRS
    m.base.transformer = Transformer.from_crs("EPSG:4326", TARGET_CRS, always_xy=True)
    m.configure()
    m.base.target_grid = fixed_regional_grid
    m.base.save_native_and_display = save_regional


def normalize_season_output(name: str, result: dict) -> dict:
    root = SEASONS / name
    old = root / f"EXPERIMENT_001_{name.upper()}_1990_2026_37_YEARS_2km_53.591400_19.010717.zip"
    if old.exists():
        old.unlink()
    new = root / f"TEST012_{name.upper()}_1990_2026_37_YEARS_{FRAME_LABEL}_{LAT_STR}_{LON_STR}.zip"
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest.update({
        "experiment": "Experiment 012 - Great Salt Lake Utah USA water-loss reference",
        "test_number": TEST,
        "center": {"lat": LAT, "lon": LON},
        "targets": TARGETS,
        "aoi": {
            "width_m": int(FRAME_WIDTH_M),
            "height_m": int(FRAME_HEIGHT_M),
            "orientation": "north_up",
            "output_grid_m": OUTPUT_GSD_M,
            "crs": TARGET_CRS,
            "purpose": "full regional Great Salt Lake reference frame for long-term shoreline and exposed-lakebed comparison",
        },
        "dataset_role": "TerraWater USA control case with documented large water-level and areal-extent variability",
        "object_name": "Great Salt Lake, Utah, USA",
        "zip": str(new),
        "source_policy": "real public satellite pixels only; USGS Landsat Collection 2 and ESA/Copernicus Sentinel-2 products; no generative fill or AI super-resolution",
    })
    for rec in manifest.get("records", []):
        if rec.get("status") == "ok":
            rec["output_grid_m"] = OUTPUT_GSD_M
            rec["regional_frame"] = FRAME_LABEL
            rec["target_crs"] = TARGET_CRS
    manifest.pop("zip_bytes", None)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    m.write_contact_sheet(name, manifest)
    m.rebuild_season_zip(name, new)
    result.update({"zip": str(new), "zip_bytes": new.stat().st_size})
    return result


def accepted_years(manifest: dict) -> list[int]:
    return [int(r["year"]) for r in manifest["records"] if r.get("status") == "ok"]


def platforms(*manifests: dict) -> list[str]:
    out = set()
    for manifest in manifests:
        for rec in manifest["records"]:
            if rec.get("status") == "ok" and rec.get("platform"):
                out.add(str(rec["platform"]))
    return sorted(out)


def write_metadata() -> None:
    sm = json.loads((SEASONS / "spring" / "manifest.json").read_text(encoding="utf-8"))
    am = json.loads((SEASONS / "autumn" / "manifest.json").read_text(encoding="utf-8"))
    sy, ay = accepted_years(sm), accepted_years(am)
    policy = {
        "experiment_id": "012",
        "name": "Great Salt Lake, Utah, USA",
        "center": {"lat": LAT, "lon": LON},
        "targets": TARGETS,
        "frame": {"width_m": int(FRAME_WIDTH_M), "height_m": int(FRAME_HEIGHT_M), "orientation": "north_up", "output_grid_m": OUTPUT_GSD_M, "crs": TARGET_CRS},
        "years": {"start": 1990, "end": 2026, "count": 37},
        "seasons": {"spring": {"preferred": 5, "fallback": [4, 6]}, "autumn": {"preferred": 9, "fallback": [10, 11]}},
        "rules": {
            "real_acquisition_date_required": True,
            "same_footprint_every_year": True,
            "future_observations_never_invented": True,
            "autumn_2026_missing_until_observed": True,
            "generative_fill_forbidden": True,
            "ai_super_resolution_forbidden": True,
            "cross_year_exact_duplicate_rejected": True,
            "cross_season_duplicate_checked_in_ci": True,
            "product_id_duplicate_checked_in_ci": True,
        },
        "external_reference": "USGS Great Salt Lake elevation/areal-extent and Landsat historical records",
    }
    (EXP / "EVIDENCE_POLICY.json").write_text(json.dumps(policy, indent=2, ensure_ascii=False), encoding="utf-8")
    cfg = {
        "experiment_id": "012", "center": {"lat": LAT, "lon": LON}, "targets": TARGETS,
        "frame": policy["frame"], "years": YEARS,
        "spring_missing_years": [y for y in YEARS if y not in sy],
        "autumn_missing_years": [y for y in YEARS if y not in ay],
        "platforms_used": platforms(sm, am),
    }
    (EXP / "experiment.json").write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    report = f"""# Experiment 012 — Great Salt Lake, Utah, USA, 1990–2026

- Fixed frame: **120 km × 160 km**, north-up, UTM 12N.
- Center: **{LAT_STR}, {LON_STR}**.
- Uniform rendered grid: **60 m/pixel** for regional cross-year visual comparison.
- Spring: May preferred; fallback April/June.
- Autumn: September preferred; fallback October/November.
- Spring accepted: **{len(sy)}/37**.
- Autumn accepted: **{len(ay)}/37**.
- Platforms: **{', '.join(platforms(sm, am))}**.

Great Salt Lake is used as an external control case because USGS independently documents large changes in lake elevation and areal extent. Satellite imagery is evidence; quantitative area/volume calculations will be a separate measurement stage.
"""
    (EXP / "EXPERIMENT_012_REPORT.md").write_text(report, encoding="utf-8")


def build_combined_zip() -> Path:
    out = EXP / f"TEST012_GREAT_SALT_LAKE_1990_2026_SPRING_AUTUMN_{FRAME_LABEL}_{LAT_STR}_{LON_STR}.zip"
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for season in ("spring", "autumn"):
            root = SEASONS / season
            for p in sorted(root.rglob("*")):
                if p.is_file() and p.suffix.lower() != ".zip":
                    zf.write(p, Path(season) / p.relative_to(root))
        for extra in ("EXPERIMENT_012_REPORT.md", "experiment.json", "EVIDENCE_POLICY.json"):
            p = EXP / extra
            if p.exists():
                zf.write(p, p.name)
    return out


def main() -> None:
    if EXP.exists():
        shutil.rmtree(EXP)
    configure_globals()
    SEASONS.mkdir(parents=True, exist_ok=True)
    spring = normalize_season_output("spring", m.exp1.build_season("spring", [5, 4, 6]))
    autumn = normalize_season_output("autumn", m.exp1.build_season("autumn", [9, 10, 11]))
    write_metadata()
    combined = build_combined_zip()
    sm = json.loads((SEASONS / "spring" / "manifest.json").read_text())
    am = json.loads((SEASONS / "autumn" / "manifest.json").read_text())
    sy, ay = accepted_years(sm), accepted_years(am)
    summary = {
        "experiment": TEST, "object": "Great Salt Lake, Utah, USA",
        "center": {"lat": LAT, "lon": LON},
        "frame_width_m": int(FRAME_WIDTH_M), "frame_height_m": int(FRAME_HEIGHT_M),
        "output_grid_m": OUTPUT_GSD_M, "target_crs": TARGET_CRS,
        "spring_count_ok": len(sy), "autumn_count_ok": len(ay),
        "spring_missing_years": [y for y in YEARS if y not in sy],
        "autumn_missing_years": [y for y in YEARS if y not in ay],
        "platforms_used": platforms(sm, am),
        "combined_zip": str(combined), "combined_zip_bytes": combined.stat().st_size,
    }
    (EXP / "BUILD_SUMMARY.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
