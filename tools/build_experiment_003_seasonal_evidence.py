from __future__ import annotations

import json
import zipfile
from pathlib import Path

import build_annual_best_53_591400_19_010717 as base
import build_experiment_001_seasonal_evidence as exp1

LAT = 53.578593
LON = 19.068364
YEARS = list(range(1990, 2027))
BRANCH = "experiment-003-jezioro-nogat-53-578593-19-068364"
EXP = Path("experiments/experiment_003_jezioro_nogat")
SEASONS = EXP / "seasonal_evidence"


def configure() -> None:
    # Reuse the validated generic acquisition/rendering functions from Experiment 001,
    # but fully replace the AOI, output paths and review registry. No Experiment 002
    # imagery or output is read or copied by this generator.
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
    base.TARGET_BOUNDS = (
        base.CX - base.HALF_SIZE_M,
        base.CY - base.HALF_SIZE_M,
        base.CX + base.HALF_SIZE_M,
        base.CY + base.HALF_SIZE_M,
    )
    base.SEARCH_BBOX = [LON - 0.04, LAT - 0.03, LON + 0.04, LAT + 0.03]
    base.ROOT = EXP
    base.IMG_DIR = EXP / "images"
    base.IMG_DIR.mkdir(parents=True, exist_ok=True)


def normalize_season_output(name: str, result: dict) -> dict:
    root = SEASONS / name
    # build_season comes from Experiment 001 and initially uses its historical ZIP
    # filename template. Rename the newly generated file immediately for Test 003.
    old = root / f"EXPERIMENT_001_{name.upper()}_1990_2026_37_YEARS_2km_53.591400_19.010717.zip"
    new = root / f"TEST003_{name.upper()}_1990_2026_37_YEARS_2km_53.578593_19.068364.zip"
    if old.exists():
        if new.exists():
            new.unlink()
        old.rename(new)

    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["experiment"] = "Experiment 003 - Jezioro Nogat water and shoreline monitoring"
    manifest["center"] = {"lat": LAT, "lon": LON}
    manifest["aoi"] = "2 km x 2 km centered exactly on 53.578593, 19.068364"
    manifest["dataset_role"] = "independent TerraWater lake comparison case"
    manifest["test_number"] = 3
    manifest["object_name"] = "Jezioro Nogat"
    manifest["no_experiment_002_imagery_reused"] = True
    manifest["zip"] = str(new)
    manifest["zip_bytes"] = new.stat().st_size if new.exists() else None
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    result.update({"zip": str(new), "zip_bytes": manifest["zip_bytes"]})
    return result


def build_combined_zip() -> Path:
    out = EXP / "TEST003_JEZIORO_NOGAT_1990_2026_53.578593_19.068364.zip"
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
        "crop_m": 2000,
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
        "crop_m": 2000,
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

## AOI

- Object: **Jezioro Nogat**
- Center: **{LAT:.6f}, {LON:.6f}**
- Crop: **2 km × 2 km**
- Years requested: **1990–2026 (37 years)**
- This experiment is independent from Experiment 002 and does not reuse its imagery.

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
        "experiment": 3,
        "object": "Jezioro Nogat",
        "center": {"lat": LAT, "lon": LON},
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
