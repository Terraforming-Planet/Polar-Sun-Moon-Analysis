from __future__ import annotations

import json
import math
import zipfile
from datetime import date, datetime
from pathlib import Path

from PIL import Image, ImageDraw

import build_annual_best_53_591400_19_010717 as base

LAT = 53.591400
LON = 19.010717
YEARS = list(range(1990, 2027))  # 37 calendar years
ROOT = Path("satellite_may_1990_2026") / "53.591400_19.010717"
IMG_DIR = ROOT / "images"
IMG_DIR.mkdir(parents=True, exist_ok=True)

base.LAT = LAT
base.LON = LON
base.YEARS = YEARS
base.ROOT = ROOT
base.IMG_DIR = IMG_DIR


def may_search(collection: str, year: int, summer: bool = True, limit: int = 200) -> list[dict]:
    payload = {
        "collections": [collection],
        "bbox": base.SEARCH_BBOX,
        "datetime": f"{date(year, 5, 1).isoformat()}/{date(year, 5, 31).isoformat()}",
        "limit": limit,
    }
    data = base.request_json("POST", base.PC_SEARCH, json=payload)
    return data.get("features", [])


def may_day_distance(item: dict, year: int) -> int:
    try:
        return abs((datetime.fromisoformat(base.item_date(item)) - datetime(year, 5, 15)).days)
    except Exception:
        return 999


base.search = may_search
base.day_distance = may_day_distance


def quality(meta: dict, item: dict) -> float:
    clear = float(meta.get("local_clear_fraction", 0.0) or 0.0)
    valid = float(meta.get("valid_fraction", 0.0) or 0.0)
    cloud = float(base.cloud_cover(item) or 100.0)
    return clear * 0.62 + valid * 0.28 + max(0.0, 1.0 - cloud / 100.0) * 0.10


def choose_landsat(year: int):
    best = None
    best_meta = None
    best_score = -1.0
    try:
        item, meta = base.choose_landsat_l1(year)
        if item:
            score = quality(meta, item)
            best, best_meta, best_score = item, meta, score
    except Exception as exc:
        print("L1 chooser failed", year, repr(exc), flush=True)
    try:
        item, meta = base.fallback_landsat_l2(year)
        if item:
            score = quality(meta, item)
            if score > best_score:
                best, best_meta, best_score = item, meta, score
    except Exception as exc:
        print("L2 chooser failed", year, repr(exc), flush=True)
    return best, best_meta, best_score


def choose_synced(year: int):
    # 1990-2015: Landsat is the continuous official optical archive for this point.
    # 2016-2026: Sentinel-2 10 m is preferred, but a clearly better local May Landsat scene may replace it.
    landsat_item, landsat_meta, landsat_score = choose_landsat(year)
    if year < 2016:
        return "landsat", landsat_item, landsat_meta, landsat_score

    sentinel_item = sentinel_meta = None
    sentinel_score = -1.0
    try:
        sentinel_item, sentinel_meta = base.choose_sentinel(year)
        if sentinel_item:
            sentinel_score = quality(sentinel_meta, sentinel_item)
    except Exception as exc:
        print("Sentinel chooser failed", year, repr(exc), flush=True)

    # Prefer Sentinel-2 for its 10 m native RGB unless its local quality is materially worse.
    if sentinel_item and (sentinel_score + 0.08 >= landsat_score):
        return "sentinel", sentinel_item, sentinel_meta, sentinel_score
    return "landsat", landsat_item, landsat_meta, landsat_score


def render_record(year: int, source: str, item: dict, meta: dict) -> dict:
    if source == "sentinel":
        rec = base.render_sentinel(year, item, meta)
    else:
        try:
            rec = base.render_landsat(year, item, meta)
        except Exception:
            rec = base.render_landsat_l2(year, item, meta)
    rec["status"] = "ok"
    rec["month"] = "May"
    rec["days_from_may_15"] = may_day_distance(item, year)
    rec["selection_quality_score"] = round(quality(meta, item), 6)
    return rec


def build_contact_sheet(records: list[dict]) -> Path:
    tiles = []
    for rec in records:
        if not str(rec.get("status", "")).startswith("ok"):
            continue
        img = Image.open(IMG_DIR / rec["files"][1]).convert("RGB").resize((240, 240), Image.Resampling.LANCZOS)
        tile = Image.new("RGB", (240, 286), "white")
        tile.paste(img, (0, 0))
        draw = ImageDraw.Draw(tile)
        draw.text((5, 246), f"{rec['year']} {rec.get('platform')} {rec.get('native_resolution_m')}m\n{rec.get('date')}", fill="black")
        tiles.append(tile)
    cols = 5
    rows = max(1, math.ceil(len(tiles) / cols))
    sheet = Image.new("RGB", (cols * 240, rows * 286), "white")
    for i, tile in enumerate(tiles):
        sheet.paste(tile, ((i % cols) * 240, (i // cols) * 286))
    out = ROOT / "CONTACT_SHEET_MAY_1990_2026.jpg"
    sheet.save(out, quality=93, optimize=True)
    return out


def make_zip() -> Path:
    out = ROOT / "MAY_1990_2026_37_YEARS_2km_53.591400_19.010717.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for p in sorted(ROOT.rglob("*")):
            if p.is_file() and p != out:
                zf.write(p, p.relative_to(ROOT))
    return out


def main() -> None:
    manifest = {
        "center": {"lat": LAT, "lon": LON},
        "crop": "2 km x 2 km centered exactly on coordinate",
        "month": "May only",
        "years_requested": YEARS,
        "count_requested": len(YEARS),
        "quality_sync": {
            "1990_1998": "Landsat-5 TM, best available May scene; 30 m RGB.",
            "1999_2012": "Landsat-5/7, best local May quality; Landsat-7 15 m PAN sharpening when valid, with SLC-off gaps penalized by valid-pixel scoring.",
            "2013_2015": "Landsat-8, prefer 15 m panchromatic sharpening when available.",
            "2016_2026": "Prefer Sentinel-2 L2A 10 m; fallback to Landsat if local May quality is materially better.",
        },
        "integrity": "Only real USGS Landsat and ESA/Copernicus Sentinel-2 pixels. No generative AI, no synthetic gap filling and no AI super-resolution.",
        "records": [],
    }

    for year in YEARS:
        print(f"===== MAY {year} =====", flush=True)
        rec = {"year": year, "status": "not_found"}
        try:
            source, item, meta, score = choose_synced(year)
            if item and meta:
                rec = render_record(year, source, item, meta)
                rec["candidate_score"] = round(score, 6)
        except Exception as exc:
            rec["error"] = repr(exc)
        manifest["records"].append(rec)
        print("SELECTED", json.dumps(rec, ensure_ascii=False), flush=True)

    manifest["count_ok"] = sum(1 for r in manifest["records"] if str(r.get("status", "")).startswith("ok"))
    manifest["count_missing"] = len(YEARS) - manifest["count_ok"]
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    build_contact_sheet(manifest["records"])
    zpath = make_zip()
    print("ZIP", zpath, zpath.stat().st_size, flush=True)
    print("COUNT_OK", manifest["count_ok"], "OF", len(YEARS), flush=True)


if __name__ == "__main__":
    main()
