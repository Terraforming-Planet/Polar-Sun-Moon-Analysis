from __future__ import annotations

import csv
import hashlib
import json
import math
import shutil
import zipfile
from datetime import date, datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import build_annual_best_53_591400_19_010717 as base

LAT = 53.591400
LON = 19.010717
YEARS = list(range(1990, 2027))
BRANCH = "annual-best-53-591400-19-010717"
EXP = Path("experiments/experiment_001_pond_forest_kuchnia")
ERRORS = EXP / "errors" / "do_wyjasnienia"
SEASONS = EXP / "seasonal_evidence"

PRIMARY = Path("satellite_may_1990_2026/53.591400_19.010717")
ALT = Path("satellite_alternate_source_may_1990_2025/53.591400_19.010717")
AUDIT = Path("satellite_three_source_forensic_audit/53.591400_19.010717")

KNOWN_REVIEW = {
    "source1": {
        1995: "provider QA local_clear=0.0; unsuitable for quantitative water measurement",
        1997: "provider QA disagreement across delivery paths; preserve for review",
        2010: "image-first audit flagged blank/broken pattern and low clear fraction",
    },
    "source2": {
        1993: "image-first audit flagged blank/broken pattern and path/row conflict",
        1995: "low clear fraction; unsuitable for quantitative water measurement",
        2002: "exact byte-for-byte duplicate with 2012 and 2013 in generated alternate pack",
        2010: "low clear fraction",
        2012: "exact byte-for-byte duplicate with 2002 and 2013 in generated alternate pack",
        2013: "exact byte-for-byte duplicate with 2002 and 2012 in generated alternate pack",
    },
}


def month_range(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    if month == 12:
        stop = date(year, 12, 31)
    else:
        stop = date(year, month + 1, 1) - __import__("datetime").timedelta(days=1)
    if year == date.today().year:
        stop = min(stop, date.today())
    return start, stop


def search_month(collection: str, year: int, month: int, limit: int = 200) -> list[dict]:
    start, stop = month_range(year, month)
    if stop < start:
        return []
    payload = {
        "collections": [collection],
        "bbox": base.SEARCH_BBOX,
        "datetime": f"{start.isoformat()}/{stop.isoformat()}",
        "limit": limit,
    }
    return base.request_json("POST", base.PC_SEARCH, json=payload).get("features", [])


def date_distance(item: dict, year: int, month: int) -> int:
    try:
        target = datetime(year, month, 15)
        return abs((datetime.fromisoformat(base.item_date(item)) - target).days)
    except Exception:
        return 999


def quality(meta: dict, item: dict) -> float:
    clear = float(meta.get("local_clear_fraction", 0.0) or 0.0)
    valid = float(meta.get("valid_fraction", meta.get("local_valid_fraction", 0.0)) or 0.0)
    cloud = float(base.cloud_cover(item) or 100.0)
    # local geometry quality dominates; scene cloud is only a weak tiebreaker.
    return clear * 0.67 + valid * 0.28 + max(0.0, 1.0 - cloud / 100.0) * 0.05


def choose_month(year: int, month: int, allow_sentinel: bool) -> list[tuple[str, dict, dict, float]]:
    old_search, old_distance = base.search, base.day_distance
    base.search = lambda collection, y, summer=True, limit=100: search_month(collection, y, month, limit=max(limit, 200))
    base.day_distance = lambda item, y: date_distance(item, y, month)
    candidates: list[tuple[str, dict, dict, float]] = []
    try:
        try:
            li, lm = base.choose_landsat_l1(year)
            if li:
                candidates.append(("landsat_l1", li, lm, quality(lm, li)))
        except Exception as exc:
            print("landsat-l1", year, month, repr(exc), flush=True)
        try:
            li, lm = base.fallback_landsat_l2(year)
            if li:
                candidates.append(("landsat_l2", li, lm, quality(lm, li)))
        except Exception as exc:
            print("landsat-l2", year, month, repr(exc), flush=True)
        if allow_sentinel:
            try:
                si, sm = base.choose_sentinel(year)
                if si:
                    # 10 m native RGB gets a small preference when local quality is comparable.
                    candidates.append(("sentinel", si, sm, quality(sm, si) + 0.025))
            except Exception as exc:
                print("sentinel", year, month, repr(exc), flush=True)
    finally:
        base.search, base.day_distance = old_search, old_distance
    candidates.sort(key=lambda x: x[3], reverse=True)
    return candidates


def render(year: int, kind: str, item: dict, meta: dict) -> dict:
    if kind == "sentinel":
        rec = base.render_sentinel(year, item, meta)
    elif kind == "landsat_l2":
        rec = base.render_landsat_l2(year, item, meta)
    else:
        try:
            rec = base.render_landsat(year, item, meta)
        except Exception:
            rec = base.render_landsat_l2(year, item, meta)
    rec["status"] = "ok"
    return rec


def image_integrity(path: Path) -> dict:
    b = path.read_bytes()
    im = Image.open(path).convert("RGB")
    a = np.asarray(im.resize((256, 256), Image.Resampling.BILINEAR), dtype=np.uint8)
    gray = a.mean(axis=2)
    black = a.max(axis=2) < 8
    white = a.min(axis=2) > 247
    row_black = float((black.mean(axis=1) > 0.55).mean())
    col_black = float((black.mean(axis=0) > 0.55).mean())
    return {
        "sha256": hashlib.sha256(b).hexdigest(),
        "visual_std": round(float(gray.std()), 4),
        "near_black_fraction": round(float(black.mean()), 6),
        "near_white_fraction": round(float(white.mean()), 6),
        "dark_row_fraction": round(row_black, 6),
        "dark_col_fraction": round(col_black, 6),
        "broken_visual": bool(gray.std() < 5.0 or row_black > 0.12 or col_black > 0.12),
    }


def archive_existing_errors() -> list[dict]:
    records = []
    for source, mapping in KNOWN_REVIEW.items():
        root = PRIMARY if source == "source1" else ALT
        target = ERRORS / source
        target.mkdir(parents=True, exist_ok=True)
        for year, reason in mapping.items():
            matches = sorted((root / "images").glob(f"{year}_*"))
            if not matches:
                records.append({"source": source, "year": year, "reason": reason, "status": "source_file_not_found"})
                continue
            for p in matches:
                dst = target / p.name
                shutil.copy2(p, dst)
                records.append({
                    "source": source,
                    "year": year,
                    "reason": reason,
                    "original_path": str(p),
                    "archived_path": str(dst),
                    "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
                    "status": "archived_copy_original_preserved",
                })
    ERRORS.mkdir(parents=True, exist_ok=True)
    (ERRORS / "rejected_images_manifest.json").write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
    return records


def build_season(name: str, months: list[int]) -> dict:
    root = SEASONS / name
    img_dir = root / "images"
    rejected_dir = root / "rejected_candidates"
    img_dir.mkdir(parents=True, exist_ok=True)
    rejected_dir.mkdir(parents=True, exist_ok=True)
    base.ROOT = root
    base.IMG_DIR = img_dir
    records = []
    hashes: dict[str, int] = {}

    for year in YEARS:
        print(f"===== {name.upper()} {year} =====", flush=True)
        accepted = None
        rejection_log = []
        # Sentinel-2 is available in autumn 2015, but not in spring May 2015.
        for priority, month in enumerate(months):
            allow_sentinel = year >= 2016 or (name == "autumn" and year >= 2015)
            candidates = choose_month(year, month, allow_sentinel)
            for kind, item, meta, score in candidates[:3]:
                # Avoid accepting very poor candidates while a fallback month remains.
                if score < 0.76 and priority < len(months) - 1:
                    rejection_log.append({"month": month, "item_id": item.get("id"), "reason": "quality_below_0.76_before_fallback", "score": score})
                    continue
                before = set(img_dir.iterdir())
                try:
                    rec = render(year, kind, item, meta)
                    native = img_dir / rec["files"][0]
                    integrity = image_integrity(native)
                    rec["image_integrity"] = integrity
                    rec["requested_season"] = name
                    rec["selected_month"] = month
                    rec["selected_month_name"] = date(2000, month, 1).strftime("%B")
                    rec["is_fallback_month"] = priority > 0
                    rec["preferred_month"] = months[0]
                    rec["selection_quality_score"] = round(float(score), 6)
                    rec["fallback_reason"] = None if priority == 0 else "preferred month had no sufficiently reliable candidate"
                    sha = integrity["sha256"]
                    duplicate_year = hashes.get(sha)
                    if integrity["broken_visual"]:
                        raise RuntimeError("image-first visual integrity check failed")
                    if duplicate_year is not None and duplicate_year != year:
                        raise RuntimeError(f"cross-year exact duplicate detected with year {duplicate_year}")
                    hashes[sha] = year
                    accepted = rec
                    break
                except Exception as exc:
                    new_files = set(img_dir.iterdir()) - before
                    moved = []
                    for p in sorted(new_files):
                        dst = rejected_dir / p.name
                        shutil.move(str(p), str(dst))
                        moved.append(str(dst))
                    rejection_log.append({"month": month, "item_id": item.get("id"), "reason": repr(exc), "moved_files": moved, "score": score})
            if accepted is not None:
                break

        if accepted is None:
            accepted = {"year": year, "status": "not_found_or_rejected", "requested_season": name, "months_searched": months}
        accepted["rejected_candidates"] = rejection_log
        records.append(accepted)
        print("SELECTED", json.dumps(accepted, ensure_ascii=False), flush=True)

    manifest = {
        "experiment": "Experiment 001 - Forest Pond and Lake Kuchnia Water Loss",
        "center": {"lat": LAT, "lon": LON},
        "crop": "2 km x 2 km centered exactly on coordinate for imagery; measurement stage uses larger AOI where needed",
        "season": name,
        "preferred_month": months[0],
        "fallback_months": months[1:],
        "years_requested": YEARS,
        "filename_rule": "every image filename begins YYYY_YYYY-MM-DD_...",
        "integrity_policy": "real public satellite pixels only; no AI filling/super-resolution; image-first broken-image check; exact cross-year SHA duplicate rejected",
        "records": records,
    }
    manifest["count_ok"] = sum(1 for r in records if r.get("status") == "ok")
    manifest["count_missing_or_rejected"] = len(YEARS) - manifest["count_ok"]
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    with (root / "scene_index.csv").open("w", newline="", encoding="utf-8") as f:
        fields = ["year","date","platform","native_resolution_m","selected_month","is_fallback_month","scene_cloud_cover_percent","local_clear_fraction","local_valid_fraction","selection_quality_score","status","item_id"]
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader()
        for r in records:
            w.writerow({k: r.get(k) for k in fields})

    good = [r for r in records if r.get("status") == "ok"]
    tiles=[]
    for r in good:
        im=Image.open(img_dir/r["files"][1]).convert("RGB").resize((240,240),Image.Resampling.LANCZOS)
        tile=Image.new("RGB",(240,294),"white"); tile.paste(im,(0,0)); d=ImageDraw.Draw(tile)
        fb=" fallback" if r.get("is_fallback_month") else ""
        d.text((5,244),f"{r['year']} {r.get('date')}\n{r.get('platform')} {r.get('native_resolution_m')}m{fb}",fill="black")
        tiles.append(tile)
    cols=5; rows=max(1,math.ceil(len(tiles)/cols)); sheet=Image.new("RGB",(cols*240,rows*294),"white")
    for i,t in enumerate(tiles): sheet.paste(t,((i%cols)*240,(i//cols)*294))
    sheet.save(root/f"CONTACT_SHEET_{name.upper()}_1990_2026.jpg",quality=93,optimize=True)

    zip_path=root/f"EXPERIMENT_001_{name.upper()}_1990_2026_37_YEARS_2km_53.591400_19.010717.zip"
    with zipfile.ZipFile(zip_path,"w",zipfile.ZIP_DEFLATED,compresslevel=9) as zf:
        for p in sorted(root.rglob("*")):
            if p.is_file() and p != zip_path:
                zf.write(p,p.relative_to(root))
    manifest["zip"] = str(zip_path)
    manifest["zip_bytes"] = zip_path.stat().st_size
    return manifest


def write_experiment_scaffold(archive_records: list[dict], spring: dict, autumn: dict) -> None:
    EXP.mkdir(parents=True, exist_ok=True)
    report = f"""# Experiment 001 — Forest Pond and Lake Kuchnia Water Loss (1990–2026)

## Status

**Active evidence experiment.** This document separates observations from interpretation. The current pond-loss number is a working estimate, not yet a final verified area result.

## Area of interest

- Center: **{LAT:.6f}, {LON:.6f}**
- Standard imagery crop: **2 km × 2 km**
- Time span: **1990–2026**
- Primary target: forest pond visible in the AOI
- Control/secondary target: Lake Kuchnia

## Evidence question

How much did the open-water surface change between the beginning and end of the 1990–2026 record, and do independent sensors plus spring/autumn seasonal comparisons support the same state transition?

## Observed so far

1. The forest pond shows a strong long-term reduction of the visible open-water signal and appears close to complete disappearance in recent imagery.
2. Earlier imagery can show a materially larger water footprint than recent imagery.
3. The previous three-source forensic audit found concrete generated-package errors. These files are preserved under `errors/do_wyjasnienia/`; they are not silently deleted.
4. The alternate optical package contained exact byte-for-byte duplicate images assigned to 2002, 2012 and 2013. They are excluded from quantitative evidence until replaced.
5. Sentinel-1 RTC provides an independent radar control for 2015–2025, but the small forest pond is frequently low-confidence because 10 m pixels, canopy and wet soil mix the radar signal.

## Working estimate — NOT final

The current image-based working estimate is approximately **2.5 ha (25,000 m²) of lost open-water footprint**, with the pond appearing to have lost **close to 100%** of its earlier open-water signal over roughly 36 years. Some historical scenes visually suggest a larger footprint. This estimate remains provisional until corrected seasonal endpoint segmentation, geometry verification and uncertainty bounds are complete.

## Seasonal design

- Corrected spring set: preferred **May**, fallback **April**, then **June** only when May cannot provide a reliable scene.
- Autumn set: preferred **September**, fallback **October**, then **November** when necessary.
- Every fallback month is explicitly recorded in `manifest.json` and `scene_index.csv`.
- Every image filename begins with the year and acquisition date: `YYYY_YYYY-MM-DD_...`.

## Integrity rules

- Official/public satellite pixels only.
- No generative filling and no AI super-resolution presented as observation.
- Exact cross-year file duplicates are rejected automatically.
- Broken/blank visual patterns are rejected automatically.
- Suspect files remain archived for reproducibility.
- Observation of water loss is separated from any hypothesis about its hydrological cause.

## Current source matrix

| Evidence family | Sensor / mission | Role | Independence note |
|---|---|---|---|
| 1 | USGS/NASA Landsat 5/7/8 | historical optical baseline | primary long record |
| 2 | ESA/Copernicus Sentinel-2 | 10 m optical control from 2015 | independent sensor from Landsat |
| 3 | ESA/Copernicus Sentinel-1 RTC | C-band radar control 2015–2025 | different measurement physics |
| 4 candidate | NASA ASTER / JAXA ALOS / official Roscosmos or CNSA archive | additional independent control where public, legal data can be verified | never substituted with an unverifiable source |

## Build status

- Archived suspect/rejected copies: **{len(archive_records)}** files/records
- Corrected spring scenes built: **{spring.get('count_ok')} / 37**
- Autumn scenes built: **{autumn.get('count_ok')} / 37**

## Next quantitative gate

The experiment is not closed until the following are produced:

1. verified pond geometry;
2. spring and autumn water masks from original spectral bands;
3. 1990 and 2026 endpoint areas in m² and ha with uncertainty;
4. cross-sensor agreement table;
5. explicit list of rejected years/scenes;
6. final status: supported / not supported / inconclusive.

## Future scope after Evidence 001

After approximately five independently documented evidence sites, a later phase may train/test the L4 model for automated detection of shrinking or disappeared lakes, ponds, rivers and canals, followed by a systematic survey within 100 km of Evidence 001. This is future work, not part of the current conclusion.
"""
    (EXP / "EXPERIMENT_001_REPORT.md").write_text(report, encoding="utf-8")
    machine = {
        "experiment_id": "001",
        "title": "Forest Pond and Lake Kuchnia Water Loss",
        "status": "active",
        "aoi_center": {"lat": LAT, "lon": LON},
        "period": {"start_year": 1990, "end_year": 2026},
        "working_hypothesis": {
            "pond_open_water_loss_m2": 25000,
            "pond_open_water_loss_ha": 2.5,
            "pond_loss_percent": "near 100%",
            "verification_status": "provisional_not_final",
        },
        "spring_count": spring.get("count_ok"),
        "autumn_count": autumn.get("count_ok"),
        "error_archive_records": len(archive_records),
        "forensic_audit": str(AUDIT / "AUDIT_SUMMARY.md"),
    }
    (EXP / "experiment.json").write_text(json.dumps(machine, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    archive = archive_existing_errors()
    spring = build_season("spring", [5, 4, 6])
    autumn = build_season("autumn", [9, 10, 11])
    write_experiment_scaffold(archive, spring, autumn)
    print("EXPERIMENT_001_BUILD_COMPLETE")
    print("SPRING", spring.get("count_ok"), "/37", spring.get("zip"), spring.get("zip_bytes"))
    print("AUTUMN", autumn.get("count_ok"), "/37", autumn.get("zip"), autumn.get("zip_bytes"))
    print("ARCHIVED_REVIEW_RECORDS", len(archive))


if __name__ == "__main__":
    main()
