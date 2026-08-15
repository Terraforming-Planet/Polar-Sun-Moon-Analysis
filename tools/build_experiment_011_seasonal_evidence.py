from __future__ import annotations

# TEST011_TRIGGER_BUILD_2026_08_15
import json
import shutil
import zipfile
from pathlib import Path

from PIL import Image
from pyproj import Transformer
from rasterio.transform import from_bounds

import build_experiment_004_seasonal_evidence as m

TEST = 11
LAT = 53.760000
LON = 19.590000
LAT_STR = "53.760000"
LON_STR = "19.590000"
YEARS = list(range(1990, 2027))
BRANCH = "experiment-011-ilawa-zalewo-regional-53-760000-19-590000"
EXP = Path("experiments/experiment_011_ilawa_zalewo_regional")
SEASONS = EXP / "seasonal_evidence"
FRAME_WIDTH_M = 65000.0
FRAME_HEIGHT_M = 60000.0
FRAME_LABEL = "65x60km"
OUTPUT_GSD_M = 30.0
DISPLAY_WIDTH = 1300
DISPLAY_HEIGHT = 1200
TARGET_CRS = "EPSG:32634"
TARGETS = [
    {"name": "Ilawa", "lat": 53.5976, "lon": 19.5612},
    {"name": "Susz", "lat": 53.7200, "lon": 19.3372},
    {"name": "Zalewo", "lat": 53.8443, "lon": 19.6053},
    {"name": "Milomlyn", "lat": 53.7667, "lon": 19.8333},
    {"name": "Maldyty", "lat": 53.9203, "lon": 19.7417},
]


def fixed_regional_grid(_requested_resolution_m: float):
    width = max(1, int(round(FRAME_WIDTH_M / OUTPUT_GSD_M)))
    height = max(1, int(round(FRAME_HEIGHT_M / OUTPUT_GSD_M)))
    transform = from_bounds(*m.base.TARGET_BOUNDS, width=width, height=height)
    return width, height, transform


def save_regional(rgb, base_path: Path) -> tuple[str, str]:
    evidence = base_path.with_name(base_path.stem + "_regional30m.png")
    display = base_path.with_name(base_path.stem + "_display1300x1200.jpg")
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
    new = root / f"TEST011_{name.upper()}_1990_2026_37_YEARS_{FRAME_LABEL}_{LAT_STR}_{LON_STR}.zip"
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest.update({
        "experiment": "Experiment 011 - Ilawa-Susz-Zalewo-Milomlyn-Maldyty regional water-system screening",
        "test_number": TEST,
        "center": {"lat": LAT, "lon": LON},
        "targets": TARGETS,
        "aoi": {"width_m": int(FRAME_WIDTH_M), "height_m": int(FRAME_HEIGHT_M), "orientation": "north_up", "output_grid_m": OUTPUT_GSD_M, "purpose": "wide regional view approximating the supplied map altitude while keeping the same footprint for every year"},
        "dataset_role": "TerraWater regional water-system screening; visual evidence before quantitative measurement",
        "object_name": "Ilawa-Zalewo regional water system",
        "zip": str(new),
        "source_policy": "real public satellite pixels only; USGS Landsat Collection 2 and ESA/Copernicus Sentinel-2 products; no generative fill or AI super-resolution",
    })
    for rec in manifest.get("records", []):
        if rec.get("status") == "ok":
            rec["output_grid_m"] = OUTPUT_GSD_M
            rec["regional_frame"] = FRAME_LABEL
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
    policy = {"experiment_id": "011", "name": "Ilawa-Zalewo regional water system", "center": {"lat": LAT, "lon": LON}, "targets": TARGETS, "frame": {"width_m": int(FRAME_WIDTH_M), "height_m": int(FRAME_HEIGHT_M), "orientation": "north_up", "output_grid_m": OUTPUT_GSD_M}, "years": {"start": 1990, "end": 2026, "count": 37}, "seasons": {"spring": {"preferred": 5, "fallback": [4, 6]}, "autumn": {"preferred": 9, "fallback": [10, 11]}}, "rules": {"real_acquisition_date_required": True, "same_footprint_every_year": True, "future_observations_never_invented": True, "autumn_2026_missing_until_observed": True, "generative_fill_forbidden": True, "ai_super_resolution_forbidden": True, "cross_year_exact_duplicate_rejected": True, "cross_season_duplicate_checked_in_ci": True, "product_id_duplicate_checked_in_ci": True}}
    (EXP / "EVIDENCE_POLICY.json").write_text(json.dumps(policy, indent=2, ensure_ascii=False), encoding="utf-8")
    cfg = {"experiment_id": "011", "center": {"lat": LAT, "lon": LON}, "targets": TARGETS, "frame": policy["frame"], "years": YEARS, "spring_missing_years": [y for y in YEARS if y not in sy], "autumn_missing_years": [y for y in YEARS if y not in ay], "platforms_used": platforms(sm, am)}
    (EXP / "experiment.json").write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    report = f"""# Experiment 011 — Iława–Zalewo regional satellite evidence, 1990–2026

- Fixed frame: **65 km × 60 km**, north-up.
- Center: **{LAT_STR}, {LON_STR}**.
- Uniform rendered grid: **30 m/pixel** for cross-year regional visual comparison.
- Spring: May preferred; fallback April/June.
- Autumn: September preferred; fallback October/November.
- Spring accepted: **{len(sy)}/37**.
- Autumn accepted: **{len(ay)}/37**.
- Platforms: **{', '.join(platforms(sm, am))}**.

This package is evidence acquisition. Quantitative shoreline/area/volume conclusions require the later spectral-water measurement stage and hydrological data.
"""
    (EXP / "EXPERIMENT_011_REPORT.md").write_text(report, encoding="utf-8")


def build_combined_zip() -> Path:
    out = EXP / f"TEST011_ILAWA_ZALEWO_1990_2026_SPRING_AUTUMN_{FRAME_LABEL}_{LAT_STR}_{LON_STR}.zip"
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for season in ("spring", "autumn"):
            root = SEASONS / season
            for p in sorted(root.rglob("*")):
                if p.is_file() and p.suffix.lower() != ".zip":
                    zf.write(p, Path(season) / p.relative_to(root))
        for extra in ("EXPERIMENT_011_REPORT.md", "experiment.json", "EVIDENCE_POLICY.json"):
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
    summary = {"experiment": TEST, "object": "Ilawa-Zalewo regional water system", "center": {"lat": LAT, "lon": LON}, "frame_width_m": int(FRAME_WIDTH_M), "frame_height_m": int(FRAME_HEIGHT_M), "output_grid_m": OUTPUT_GSD_M, "spring_count_ok": len(sy), "autumn_count_ok": len(ay), "spring_missing_years": [y for y in YEARS if y not in sy], "autumn_missing_years": [y for y in YEARS if y not in ay], "platforms_used": platforms(sm, am), "combined_zip": str(combined), "combined_zip_bytes": combined.stat().st_size}
    (EXP / "BUILD_SUMMARY.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
