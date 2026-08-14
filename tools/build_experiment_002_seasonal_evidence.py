from __future__ import annotations

import json
import math
import zipfile
from pathlib import Path

import build_annual_best_53_591400_19_010717 as base
import build_experiment_001_seasonal_evidence as exp1

LAT = 53.609856
LON = 19.055751
YEARS = list(range(1990, 2027))
BRANCH = "experiment-002-water-change-53-609856-19-055751"
EXP = Path("experiments/experiment_002_czarne_dolne_wetland")
SEASONS = EXP / "seasonal_evidence"


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
    old = root / f"EXPERIMENT_001_{name.upper()}_1990_2026_37_YEARS_2km_53.591400_19.010717.zip"
    new = root / f"TEST002_{name.upper()}_1990_2026_37_YEARS_2km_53.609856_19.055751.zip"
    if old.exists():
        if new.exists():
            new.unlink()
        old.rename(new)

    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["experiment"] = "Experiment 002 - Czarne Dolne wetland / water-change monitoring"
    manifest["center"] = {"lat": LAT, "lon": LON}
    manifest["aoi"] = "2 km x 2 km centered on 53.609856, 19.055751"
    manifest["dataset_role"] = "independent TerraWater comparison case"
    manifest["zip"] = str(new)
    manifest["zip_bytes"] = new.stat().st_size if new.exists() else None
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    result.update({"zip": str(new), "zip_bytes": manifest["zip_bytes"]})
    return result


def build_combined_zip() -> Path:
    out = EXP / "TEST002_SPRING_AUTUMN_1990_2026_53.609856_19.055751.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for season in ("spring", "autumn"):
            root = SEASONS / season
            for p in sorted(root.rglob("*")):
                if not p.is_file() or p.suffix.lower() == ".zip":
                    continue
                zf.write(p, Path(season) / p.relative_to(root))
    return out


def write_report(spring: dict, autumn: dict, combined: Path) -> None:
    EXP.mkdir(parents=True, exist_ok=True)
    report = f"""# Experiment 002 — Czarne Dolne wetland / water-change monitoring

## AOI

- Center: **{LAT:.6f}, {LON:.6f}**
- Crop: **2 km × 2 km**
- Years: **1990–2026**
- Role: second independent TerraWater comparison case

## Evidence package

- Spring preferred month: May; fallback April then June.
- Autumn preferred month: September; fallback October then November.
- Real acquisition date is preserved in every filename and manifest record.
- Future observations are never invented. If autumn 2026 has not occurred yet, it remains missing.
- Real public satellite pixels only. No generative filling and no AI super-resolution.

## Current build

- Spring accepted scenes: **{spring.get('count_ok', 0)} / 37**
- Autumn accepted scenes: **{autumn.get('count_ok', 0)} / 37**
- Combined archive: `{combined.name}`

This is an evidence acquisition package. Quantitative water-loss conclusions must be produced in a separate measurement stage after image and spectral QA.
"""
    (EXP / "EXPERIMENT_002_REPORT.md").write_text(report, encoding="utf-8")
    config = {
        "experiment_id": "002",
        "center": {"lat": LAT, "lon": LON},
        "crop_m": 2000,
        "years": YEARS,
        "seasons": {
            "spring": {"preferred": 5, "fallback": [4, 6]},
            "autumn": {"preferred": 9, "fallback": [10, 11]},
        },
        "scientific_policy": {
            "real_acquisition_date_required": True,
            "fallback_must_be_labeled": True,
            "future_observations_never_invented": True,
            "generative_fill_forbidden": True,
            "ai_super_resolution_forbidden": True,
        },
        "combined_zip": str(combined),
    }
    (EXP / "experiment.json").write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    configure()
    SEASONS.mkdir(parents=True, exist_ok=True)

    spring = exp1.build_season("spring", [5, 4, 6])
    spring = normalize_season_output("spring", spring)

    autumn = exp1.build_season("autumn", [9, 10, 11])
    autumn = normalize_season_output("autumn", autumn)

    combined = build_combined_zip()
    write_report(spring, autumn, combined)

    summary = {
        "experiment": 2,
        "center": {"lat": LAT, "lon": LON},
        "spring_count_ok": spring.get("count_ok", 0),
        "autumn_count_ok": autumn.get("count_ok", 0),
        "combined_zip": str(combined),
        "combined_zip_bytes": combined.stat().st_size,
    }
    (EXP / "BUILD_SUMMARY.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
