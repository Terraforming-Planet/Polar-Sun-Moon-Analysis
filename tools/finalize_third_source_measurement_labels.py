from __future__ import annotations

import csv
import json
import zipfile
from pathlib import Path

ROOT = Path("satellite_third_source_sentinel1_rtc_may_2015_2025/53.591400_19.010717")
MANIFEST = ROOT / "manifest.json"
CSV_PATH = ROOT / "measurements_open_water_radar_refined.csv"
NOTES_PATH = ROOT / "MEASUREMENT_NOTES.md"
ZIP_PATH = ROOT / "THIRD_SOURCE_SENTINEL1_RTC_MAY_2015_2025_WATER_2km_53.591400_19.010717.zip"

FIELDS = [
    "year", "date_start", "date_end", "platforms", "orbit_state", "relative_orbit", "acquisitions_used",
    "body", "body_label", "area_m2", "area_ha", "change_vs_baseline_m2", "change_vs_baseline_percent",
    "baseline_year", "water_pixels", "seed_distance_m", "fixed_vv_threshold_db", "fixed_vh_threshold_db",
    "very_dark_vv_override_db", "median_water_vv_db", "median_water_vh_db", "stable_core_overlap_fraction",
    "edge_pixel_uncertainty_m2", "confidence", "measurement_status", "recommended_use", "interpretation",
]


def recommendation(body: str, m: dict) -> tuple[str, str]:
    status = str(m.get("status") or "unknown")
    confidence = str(m.get("confidence") or "unknown")
    if body == "jezioro_kuchnia":
        if status == "ok" and confidence == "high":
            return (
                "quantitative_trend_proxy",
                "High-confidence Sentinel-1 RTC open-water area proxy. Suitable for year-to-year trend cross-checking; not a cadastral or field-survey area.",
            )
        return (
            "review_before_quantitative_use",
            "Lake radar result needs manual review before quantitative use.",
        )
    if status == "ok" and confidence == "high":
        return (
            "qualitative_cross_check_only",
            "Connected radar-dark feature detected at the forest-pond seed, but the object is too small/wooded for an exact 10 m C-band SAR area. Use only as an independent qualitative cross-check.",
        )
    return (
        "do_not_use_as_exact_area",
        "Low-confidence/anomalous forest-pond SAR classification. Forest canopy, wet soil and 10 m mixed pixels can dominate; do not interpret this row as exact pond area.",
    )


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    records = {int(r["year"]): r for r in data["records"] if r.get("status") == "ok"}

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for year in sorted(records):
            rec = records[year]
            for body, body_label in (("jezioro_kuchnia", "Jezioro Kuchnia"), ("staw_w_lesie", "Staw w lesie")):
                m = rec["measurements"][body]
                recommended_use, interpretation = recommendation(body, m)
                writer.writerow({
                    "year": year,
                    "date_start": rec.get("date_start"),
                    "date_end": rec.get("date_end"),
                    "platforms": ";".join(rec.get("platforms", [])),
                    "orbit_state": rec.get("orbit_state"),
                    "relative_orbit": rec.get("relative_orbit"),
                    "acquisitions_used": rec.get("acquisitions_used"),
                    "body": body,
                    "body_label": body_label,
                    "area_m2": m.get("area_m2"),
                    "area_ha": m.get("area_ha"),
                    "change_vs_baseline_m2": m.get("change_vs_baseline_m2"),
                    "change_vs_baseline_percent": m.get("change_vs_baseline_percent"),
                    "baseline_year": m.get("baseline_year"),
                    "water_pixels": m.get("water_pixels"),
                    "seed_distance_m": m.get("seed_distance_m"),
                    "fixed_vv_threshold_db": m.get("fixed_vv_threshold_db"),
                    "fixed_vh_threshold_db": m.get("fixed_vh_threshold_db"),
                    "very_dark_vv_override_db": m.get("very_dark_vv_override_db"),
                    "median_water_vv_db": m.get("median_water_vv_db"),
                    "median_water_vh_db": m.get("median_water_vh_db"),
                    "stable_core_overlap_fraction": m.get("stable_core_overlap_fraction"),
                    "edge_pixel_uncertainty_m2": m.get("edge_pixel_uncertainty_m2"),
                    "confidence": m.get("confidence"),
                    "measurement_status": m.get("status"),
                    "recommended_use": recommended_use,
                    "interpretation": interpretation,
                })

    notes = "# Sentinel-1 RTC measurement notes\n\n"
    notes += "This package is the third independent sensor check. It uses real ESA/Copernicus Sentinel-1 C-band SAR RTC pixels on a fixed 10 m grid (100 m²/pixel), May 2015-2025, preferred descending relative orbit 124. No generative AI, synthetic filling or AI super-resolution is used.\n\n"
    notes += "## Jezioro Kuchnia\n"
    notes += "The refined series is stable and high-confidence in every year. Treat the reported area as a Sentinel-1 radar open-water **proxy** suitable for trend verification against the optical sources, not as a cadastral or field-survey boundary.\n\n"
    notes += "## Staw w lesie\n"
    notes += "The object is small and surrounded/partly obscured by forest. At 10 m C-band SAR, canopy, wet soil, emergent vegetation and mixed pixels can look radar-dark. Rows marked `classification_anomaly` or `low` confidence must **not** be used as exact pond-area measurements. Even high-confidence rows are retained only as qualitative independent evidence until checked against high-resolution optical imagery.\n\n"
    notes += "## Measurement uncertainty\n"
    notes += "`edge_pixel_uncertainty_m2` is only a pixel-edge discretization indicator. It does not include all SAR classification uncertainty. One 10 m analysis pixel equals 100 m².\n"
    NOTES_PATH.write_text(notes, encoding="utf-8")

    data["measurement_reporting_policy"] = {
        "jezioro_kuchnia": "High-confidence refined Sentinel-1 RTC open-water proxy; suitable for quantitative trend cross-checking, not a survey/cadastral area.",
        "staw_w_lesie": "Small forest pond: SAR values are qualitative cross-checks only; low/anomalous rows must not be used as exact area measurements.",
        "csv_status_fix": "measurement_status now maps directly from each refined measurement status.",
    }
    data["outputs"]["measurement_notes"] = NOTES_PATH.name
    MANIFEST.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in sorted(ROOT.rglob("*")):
            if path.is_file() and path != ZIP_PATH:
                zf.write(path, path.relative_to(ROOT))

    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8")))
    anomalies = [r for r in rows if r["measurement_status"] == "classification_anomaly"]
    lake_high = [r for r in rows if r["body"] == "jezioro_kuchnia" and r["confidence"] == "high" and r["measurement_status"] == "ok"]
    print("ROWS", len(rows))
    print("LAKE_HIGH_OK", len(lake_high), "OF", len([r for r in rows if r['body'] == 'jezioro_kuchnia']))
    print("CLASSIFICATION_ANOMALIES", len(anomalies))
    print("ZIP", ZIP_PATH, ZIP_PATH.stat().st_size)


if __name__ == "__main__":
    main()
