from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

import build_experiment_004_seasonal_evidence as m

LAT = 53.5639201
LON = 19.4706276
LAT_STR = "53.5639201"
LON_STR = "19.4706276"
YEARS = list(range(1990, 2027))
BRANCH = "experiment-007-karas-ilawa-53-5639201-19-4706276"
EXP = Path("experiments/experiment_007_karas_ilawa")
SEASONS = EXP / "seasonal_evidence"
TARGET = {"name": "Karas / Ilawa wide frame", "lat": LAT, "lon": LON}
FRAME_WIDTH_M = 18000.0
FRAME_HEIGHT_M = 24000.0
FRAME_LABEL = "18x24km"


def configure_globals() -> None:
    m.LAT = LAT; m.LON = LON; m.YEARS = YEARS; m.BRANCH = BRANCH; m.EXP = EXP; m.SEASONS = SEASONS
    m.TARGETS = [TARGET]; m.FRAME_WIDTH_M = FRAME_WIDTH_M; m.FRAME_HEIGHT_M = FRAME_HEIGHT_M; m.FRAME_LABEL = FRAME_LABEL
    m.DISPLAY_WIDTH = 1000; m.DISPLAY_HEIGHT = 1333


def normalize_season_output(name: str, result: dict) -> dict:
    root = SEASONS / name
    old = root / f"EXPERIMENT_001_{name.upper()}_1990_2026_37_YEARS_2km_53.591400_19.010717.zip"
    if old.exists(): old.unlink()
    new = root / f"TEST007_{name.upper()}_1990_2026_37_YEARS_{FRAME_LABEL}_{LAT_STR}_{LON_STR}.zip"
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest.update({
        "experiment": "Experiment 007 - Karas / Ilawa wide-view monitoring",
        "center": {"lat": LAT, "lon": LON}, "targets": [TARGET],
        "aoi": {"width_m": 18000, "height_m": 24000, "orientation": "portrait_north_up", "purpose": "wide reference-height view covering the Karas/Ilawa area, nearby lakes, wetlands, forest and agricultural context in every annual frame"},
        "dataset_role": "independent TerraWater wide-view comparison case", "test_number": 7,
        "object_name": "Karas / Ilawa wide frame", "zip": str(new),
    })
    manifest.pop("zip_bytes", None)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    m.write_contact_sheet(name, manifest); m.rebuild_season_zip(name, new)
    result.update({"zip": str(new), "zip_bytes": new.stat().st_size}); return result


def write_metadata(spring: dict, autumn: dict) -> None:
    sm = json.loads((SEASONS / "spring" / "manifest.json").read_text(encoding="utf-8")); am = json.loads((SEASONS / "autumn" / "manifest.json").read_text(encoding="utf-8"))
    sy = m.accepted_years(sm); ay = m.accepted_years(am); sp = [y for y in YEARS if y not in sy]; ap = [y for y in YEARS if y not in ay]; platforms = m.platform_list(sm, am)
    policy = {"experiment_id":"007","object":"Karas / Ilawa wide frame","center":{"lat":LAT,"lon":LON},"target":TARGET,"frame":{"width_m":18000,"height_m":24000,"orientation":"portrait_north_up"},"years":{"start":1990,"end":2026,"count":37},"season_policy":{"spring":{"preferred_month":5,"fallback_months":[4,6]},"autumn":{"preferred_month":9,"fallback_months":[10,11]}},"rules":{"real_acquisition_date_required":True,"fallback_must_be_labeled":True,"future_observations_never_invented":True,"autumn_2026_must_remain_missing_until_observed":True,"same_frame_for_every_year":True,"full_reference_view_and_context_must_be_inside_frame":True,"google_maps_reference_not_measurement_evidence":True,"generative_fill_forbidden":True,"ai_super_resolution_forbidden":True,"cross_year_exact_duplicate_rejected":True},"primary_sources":["USGS Landsat Collection 2","ESA/Copernicus Sentinel-2 Level-2A"],"radar_control_planned":"ESA/Copernicus Sentinel-1 RTC","measurement_status":"not_started; evidence acquisition only"}
    (EXP / "EVIDENCE_POLICY.json").write_text(json.dumps(policy, indent=2, ensure_ascii=False), encoding="utf-8")
    (EXP / "experiment.json").write_text(json.dumps({"experiment_id":"007","name":"Karas / Ilawa wide frame","center":{"lat":LAT,"lon":LON},"target":TARGET,"frame":{"width_m":18000,"height_m":24000,"orientation":"portrait_north_up"},"years":YEARS,"spring_missing_years":sp,"autumn_missing_years":ap,"platforms_used":platforms}, indent=2, ensure_ascii=False), encoding="utf-8")
    report=f"""# Experiment 007 — Karaś / Iława wide-view satellite evidence 1990–2026

- Center: **{LAT_STR}, {LON_STR}**
- Frame: **18 km × 24 km**, portrait, north-up
- Wide reference-height view matching the supplied map scale as closely as practical.
- Spring: May preferred; fallback April/June.
- Autumn: September preferred; fallback October/November.
- Spring accepted: **{len(sy)} / 37**, missing: **{sp or 'none'}**
- Autumn accepted: **{len(ay)} / 37**, missing: **{ap or 'none'}**
- Platforms: **{', '.join(platforms)}**

Evidence acquisition only; no water-loss conclusion before QA and measurement.
"""
    (EXP / "EXPERIMENT_007_REPORT.md").write_text(report, encoding="utf-8")


def build_combined_zip() -> Path:
    out = EXP / f"TEST007_KARAS_ILAWA_1990_2026_FULL_VIEW_{FRAME_LABEL}_{LAT_STR}_{LON_STR}.zip"
    if out.exists(): out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for season in ("spring","autumn"):
            root=SEASONS/season
            for p in sorted(root.rglob("*")):
                if p.is_file() and p.suffix.lower() != ".zip": zf.write(p, Path(season)/p.relative_to(root))
        for extra in ("EXPERIMENT_007_REPORT.md","experiment.json","EVIDENCE_POLICY.json"):
            p=EXP/extra
            if p.exists(): zf.write(p,p.name)
    return out


def main() -> None:
    configure_globals()
    if EXP.exists(): shutil.rmtree(EXP)
    m.configure(); SEASONS.mkdir(parents=True, exist_ok=True)
    spring=normalize_season_output("spring", m.exp1.build_season("spring", [5,4,6])); autumn=normalize_season_output("autumn", m.exp1.build_season("autumn", [9,10,11]))
    write_metadata(spring, autumn); combined=build_combined_zip()
    sm=json.loads((SEASONS/"spring"/"manifest.json").read_text()); am=json.loads((SEASONS/"autumn"/"manifest.json").read_text()); sy=m.accepted_years(sm); ay=m.accepted_years(am)
    summary={"experiment":7,"object":"Karas / Ilawa wide frame","target":TARGET,"center":{"lat":LAT,"lon":LON},"frame_width_m":18000,"frame_height_m":24000,"frame_orientation":"portrait_north_up","spring_count_ok":len(sy),"autumn_count_ok":len(ay),"spring_missing_years":[y for y in YEARS if y not in sy],"autumn_missing_years":[y for y in YEARS if y not in ay],"platforms_used":m.platform_list(sm,am),"combined_zip":str(combined),"combined_zip_bytes":combined.stat().st_size}
    (EXP/"BUILD_SUMMARY.json").write_text(json.dumps(summary,indent=2,ensure_ascii=False),encoding="utf-8"); print(json.dumps(summary,indent=2,ensure_ascii=False))

if __name__ == "__main__": main()
