from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

import build_experiment_004_seasonal_evidence as m

LAT = 53.270125
LON = 18.789994
YEARS = list(range(1990, 2027))
BRANCH = "experiment-006-jezioro-wieczno-53-270125-18-789994"
EXP = Path("experiments/experiment_006_jezioro_wieczno")
SEASONS = EXP / "seasonal_evidence"
TARGET = {"name": "Jezioro Wieczno", "lat": LAT, "lon": LON}
FRAME_WIDTH_M = 7000.0
FRAME_HEIGHT_M = 9000.0
FRAME_LABEL = "7x9km"


def configure_globals() -> None:
    m.LAT = LAT
    m.LON = LON
    m.YEARS = YEARS
    m.BRANCH = BRANCH
    m.EXP = EXP
    m.SEASONS = SEASONS
    m.TARGETS = [TARGET]
    m.FRAME_WIDTH_M = FRAME_WIDTH_M
    m.FRAME_HEIGHT_M = FRAME_HEIGHT_M
    m.FRAME_LABEL = FRAME_LABEL
    m.DISPLAY_WIDTH = 1000
    m.DISPLAY_HEIGHT = 1286


def normalize_season_output(name: str, result: dict) -> dict:
    root = SEASONS / name
    old = root / f"EXPERIMENT_001_{name.upper()}_1990_2026_37_YEARS_2km_53.591400_19.010717.zip"
    if old.exists():
        old.unlink()
    new = root / f"TEST006_{name.upper()}_1990_2026_37_YEARS_{FRAME_LABEL}_{LAT:.6f}_{LON:.6f}.zip"
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["experiment"] = "Experiment 006 - Jezioro Wieczno water and shoreline monitoring"
    manifest["center"] = {"lat": LAT, "lon": LON}
    manifest["targets"] = [TARGET]
    manifest["aoi"] = {
        "width_m": int(FRAME_WIDTH_M),
        "height_m": int(FRAME_HEIGHT_M),
        "orientation": "portrait_north_up",
        "purpose": "whole Jezioro Wieczno, northern basin near Pluznica, southern wetlands and surrounding landscape visible in every annual frame",
    }
    manifest["dataset_role"] = "independent TerraWater lake comparison case"
    manifest["test_number"] = 6
    manifest["object_name"] = "Jezioro Wieczno"
    manifest["zip"] = str(new)
    manifest.pop("zip_bytes", None)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    m.write_contact_sheet(name, manifest)
    m.rebuild_season_zip(name, new)
    result.update({"zip": str(new), "zip_bytes": new.stat().st_size})
    return result


def build_combined_zip() -> Path:
    out = EXP / f"TEST006_JEZIORO_WIECZNO_1990_2026_FULL_VIEW_{FRAME_LABEL}_{LAT:.6f}_{LON:.6f}.zip"
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for season in ("spring", "autumn"):
            root = SEASONS / season
            for p in sorted(root.rglob("*")):
                if p.is_file() and p.suffix.lower() != ".zip":
                    zf.write(p, Path(season) / p.relative_to(root))
        for extra in ("EXPERIMENT_006_REPORT.md", "experiment.json", "EVIDENCE_POLICY.json"):
            p = EXP / extra
            if p.exists():
                zf.write(p, p.name)
    return out


def write_metadata(spring: dict, autumn: dict) -> None:
    spring_manifest = json.loads((SEASONS / "spring" / "manifest.json").read_text(encoding="utf-8"))
    autumn_manifest = json.loads((SEASONS / "autumn" / "manifest.json").read_text(encoding="utf-8"))
    spring_ok = m.accepted_years(spring_manifest)
    autumn_ok = m.accepted_years(autumn_manifest)
    spring_missing = [y for y in YEARS if y not in spring_ok]
    autumn_missing = [y for y in YEARS if y not in autumn_ok]
    policy = {
        "experiment_id": "006",
        "object": "Jezioro Wieczno",
        "center": {"lat": LAT, "lon": LON},
        "target": TARGET,
        "frame": {"width_m": 7000, "height_m": 9000, "orientation": "portrait_north_up"},
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
            "whole_lake_and_context_must_be_inside_frame": True,
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
        "experiment_id": "006",
        "name": "Jezioro Wieczno",
        "center": {"lat": LAT, "lon": LON},
        "target": TARGET,
        "frame": {"width_m": 7000, "height_m": 9000, "orientation": "portrait_north_up"},
        "years": YEARS,
        "spring_missing_years": spring_missing,
        "autumn_missing_years": autumn_missing,
        "platforms_used": m.platform_list(spring_manifest, autumn_manifest),
    }
    (EXP / "experiment.json").write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")
    report = f"""# Experiment 006 — Jezioro Wieczno satellite evidence 1990–2026

## AOI
- Object: **Jezioro Wieczno**
- Center: **{LAT:.6f}, {LON:.6f}**
- Frame: **7 km × 9 km**, portrait, north-up
- Purpose: reproduce the wider reference view with the whole lake, northern basin near Płużnica, southern wetlands and surrounding agricultural landscape.

## Seasonal acquisition policy
- Spring: May preferred; fallback April, then June.
- Autumn: September preferred; fallback October, then November.
- Every record keeps the real acquisition date and product ID.
- Autumn 2026 is not fabricated before the season occurs.

## Current evidence build
- Spring accepted scenes: **{spring.get('count_ok', 0)} / 37**
- Spring missing years: **{spring_missing or 'none'}**
- Autumn accepted scenes: **{autumn.get('count_ok', 0)} / 37**
- Autumn missing years: **{autumn_missing or 'none'}**
- Platforms used: **{', '.join(m.platform_list(spring_manifest, autumn_manifest))}**

## Scientific status
Evidence acquisition only. No water-loss conclusion is claimed until image and spectral QA plus measurement are completed.
"""
    (EXP / "EXPERIMENT_006_REPORT.md").write_text(report, encoding="utf-8")


def main() -> None:
    configure_globals()
    if EXP.exists():
        shutil.rmtree(EXP)
    m.configure()
    SEASONS.mkdir(parents=True, exist_ok=True)
    spring = normalize_season_output("spring", m.exp1.build_season("spring", [5, 4, 6]))
    autumn = normalize_season_output("autumn", m.exp1.build_season("autumn", [9, 10, 11]))
    write_metadata(spring, autumn)
    combined = build_combined_zip()
    spring_manifest = json.loads((SEASONS / "spring" / "manifest.json").read_text(encoding="utf-8"))
    autumn_manifest = json.loads((SEASONS / "autumn" / "manifest.json").read_text(encoding="utf-8"))
    spring_ok = m.accepted_years(spring_manifest)
    autumn_ok = m.accepted_years(autumn_manifest)
    summary = {
        "experiment": 6,
        "object": "Jezioro Wieczno",
        "target": TARGET,
        "center": {"lat": LAT, "lon": LON},
        "frame_width_m": int(FRAME_WIDTH_M),
        "frame_height_m": int(FRAME_HEIGHT_M),
        "frame_orientation": "portrait_north_up",
        "spring_count_ok": len(spring_ok),
        "autumn_count_ok": len(autumn_ok),
        "spring_missing_years": [y for y in YEARS if y not in spring_ok],
        "autumn_missing_years": [y for y in YEARS if y not in autumn_ok],
        "platforms_used": m.platform_list(spring_manifest, autumn_manifest),
        "combined_zip": str(combined),
        "combined_zip_bytes": combined.stat().st_size,
    }
    (EXP / "BUILD_SUMMARY.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
