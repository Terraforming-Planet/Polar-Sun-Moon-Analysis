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
YEARS = list(range(2000, 2026))  # 26 calendar years
ROOT = Path("satellite_late_april") / "53.591400_19.010717"
IMG_DIR = ROOT / "images"
IMG_DIR.mkdir(parents=True, exist_ok=True)

# Reuse the proven geospatial reader/rendering code, but force the same location/output tree.
base.LAT = LAT
base.LON = LON
base.YEARS = YEARS
base.ROOT = ROOT
base.IMG_DIR = IMG_DIR


def april_search(collection: str, year: int, summer: bool = True, limit: int = 100) -> list[dict]:
    """Search only April. Ranking later strongly prefers clear pixels and dates near 25 April."""
    start = date(year, 4, 1)
    stop = date(year, 4, 30)
    payload = {
        "collections": [collection],
        "bbox": base.SEARCH_BBOX,
        "datetime": f"{start.isoformat()}/{stop.isoformat()}",
        "limit": limit,
    }
    data = base.request_json("POST", base.PC_SEARCH, json=payload)
    return data.get("features", [])


def april_day_distance(item: dict, year: int) -> int:
    try:
        return abs((datetime.fromisoformat(base.item_date(item)) - datetime(year, 4, 25)).days)
    except Exception:
        return 999


# Monkey-patch only the temporal search/ranking; all imagery remains real satellite pixels.
base.search = april_search
base.day_distance = april_day_distance


def build_contact_sheet(records: list[dict]) -> Path:
    tiles = []
    for rec in records:
        if not str(rec.get("status", "")).startswith("ok"):
            continue
        display_name = rec["files"][1]
        img = Image.open(IMG_DIR / display_name).convert("RGB").resize((256, 256), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (256, 298), "white")
        canvas.paste(img, (0, 0))
        draw = ImageDraw.Draw(canvas)
        label = f"{rec['year']}  {rec.get('platform')}  {rec.get('native_resolution_m')} m\n{rec.get('date')}  clear={rec.get('local_clear_fraction')}"
        draw.text((6, 260), label, fill="black")
        tiles.append(canvas)
    cols = 5
    rows = math.ceil(len(tiles) / cols) if tiles else 1
    sheet = Image.new("RGB", (cols * 256, rows * 298), "white")
    for idx, tile in enumerate(tiles):
        sheet.paste(tile, ((idx % cols) * 256, (idx // cols) * 298))
    out = ROOT / "CONTACT_SHEET_LATE_APRIL_2000_2025.jpg"
    sheet.save(out, quality=93, optimize=True)
    return out


def make_zip() -> Path:
    zpath = ROOT / "LATE_APRIL_2000_2025_2km_53.591400_19.010717.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for p in sorted(ROOT.rglob("*")):
            if p.is_file() and p != zpath:
                zf.write(p, p.relative_to(ROOT))
    return zpath


def main() -> None:
    manifest = {
        "center": {"lat": LAT, "lon": LON},
        "crop": "2 km x 2 km centered exactly on coordinate",
        "years_requested": YEARS,
        "count_requested": len(YEARS),
        "temporal_rule": "Only acquisitions in April are eligible. Clear local pixels are prioritized; among similarly clear scenes, dates nearest 25 April are preferred.",
        "purpose": "Late-April comparison of spring water extent after winter thaw, saturated soils and spring precipitation. This dataset alone does not prove causation.",
        "selection_policy": {
            "2000_2014": "Best April Landsat scene. Prefer native 15 m panchromatic sharpening where a valid full-coverage PAN scene exists; otherwise use Landsat 30 m.",
            "2015": "Sentinel-2 did not yet provide April observations; use best April Landsat scene.",
            "2016_2025": "Prefer Sentinel-2 L2A 10 m with high local SCL clear fraction; fallback to Landsat if needed.",
        },
        "integrity": "Real satellite imagery only from USGS Landsat and ESA/Copernicus Sentinel-2 exposed through public STAC. No generative AI, synthetic filling or AI super-resolution. 1024-pixel files are display resizes only.",
        "records": [],
    }

    for year in YEARS:
        print(f"\n===== APRIL {year} =====", flush=True)
        rec: dict = {"year": year, "status": "not_found"}
        try:
            # Sentinel-2 April data are available from 2016 onward. For 2015 this naturally falls back to Landsat.
            if year >= 2015:
                item, meta = base.choose_sentinel(year)
                if item:
                    rec = base.render_sentinel(year, item, meta)
                    rec["status"] = "ok"
                else:
                    item2, meta2 = base.choose_landsat_l1(year)
                    if item2:
                        rec = base.render_landsat(year, item2, meta2)
                        rec["status"] = "ok"
            else:
                item, meta = base.choose_landsat_l1(year)
                if item:
                    rec = base.render_landsat(year, item, meta)
                    rec["status"] = "ok"
                else:
                    item2, meta2 = base.fallback_landsat_l2(year)
                    if item2:
                        rec = base.render_landsat_l2(year, item2, meta2)
                        rec["status"] = "ok"
        except Exception as exc:
            print("PRIMARY FAILED", year, repr(exc), flush=True)
            try:
                item2, meta2 = base.fallback_landsat_l2(year)
                if item2:
                    rec = base.render_landsat_l2(year, item2, meta2)
                    rec["status"] = "ok_fallback_after_error"
                    rec["primary_error"] = repr(exc)
                else:
                    rec["error"] = repr(exc)
            except Exception as exc2:
                rec["error"] = repr(exc)
                rec["fallback_error"] = repr(exc2)

        if str(rec.get("status", "")).startswith("ok"):
            rec["days_from_april_25"] = april_day_distance({"properties": {"datetime": rec["date"]}}, year)
            rec["late_april"] = int(rec["date"][8:10]) >= 20
        manifest["records"].append(rec)
        print("SELECTED", json.dumps(rec, ensure_ascii=False), flush=True)

    manifest["count_ok"] = sum(1 for r in manifest["records"] if str(r.get("status", "")).startswith("ok"))
    manifest["count_late_april_20_30"] = sum(1 for r in manifest["records"] if r.get("late_april") is True)
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    build_contact_sheet(manifest["records"])
    zpath = make_zip()
    print("ZIP", zpath, zpath.stat().st_size, flush=True)
    print("COUNT_OK", manifest["count_ok"], "OF", len(YEARS), flush=True)
    for p in sorted(ROOT.rglob("*")):
        if p.is_file():
            print(p, p.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
