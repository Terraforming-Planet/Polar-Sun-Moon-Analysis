from __future__ import annotations

import importlib.util
import json
import shutil
from pathlib import Path

BASE_PATH = Path(__file__).with_name("build_alternate_source_may_1990_2025_53_591400_19_010717.py")
spec = importlib.util.spec_from_file_location("alt_builder", BASE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("cannot load alternate-source builder")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

YEAR = 2022
PRIMARY_ROOT = Path("satellite_may_1990_2026") / "53.591400_19.010717"
PRIMARY_IMAGES = PRIMARY_ROOT / "images"
PRIMARY_MANIFEST = PRIMARY_ROOT / "manifest.json"

SRC_NATIVE = PRIMARY_IMAGES / "2022_2022-05-10_Sentinel-2B_10m_2km_native.png"
SRC_DISPLAY = PRIMARY_IMAGES / "2022_2022-05-10_Sentinel-2B_10m_2km_display1024.png"
DST_NATIVE = base.IMG_DIR / "2022_2022-05-10_Sentinel-2B_10m_2km_REFERENCE_native.png"
DST_DISPLAY = base.IMG_DIR / "2022_2022-05-10_Sentinel-2B_10m_2km_REFERENCE_display1024.png"


def main() -> None:
    manifest_path = base.ROOT / "manifest.json"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    existing = next((r for r in data["records"] if r.get("year") == YEAR), None)
    if existing and str(existing.get("status", "")).startswith("ok"):
        print("2022 already complete; nothing to fill", flush=True)
        return

    if not SRC_NATIVE.exists() or not SRC_DISPLAY.exists():
        raise RuntimeError(
            "verified primary-series 2022 Sentinel-2 crop is missing from the checked-out branch"
        )

    primary_record = None
    if PRIMARY_MANIFEST.exists():
        primary = json.loads(PRIMARY_MANIFEST.read_text(encoding="utf-8"))
        primary_record = next((r for r in primary.get("records", []) if r.get("year") == YEAR), None)

    shutil.copy2(SRC_NATIVE, DST_NATIVE)
    shutil.copy2(SRC_DISPLAY, DST_DISPLAY)

    rec = {
        "year": 2022,
        "date": "2022-05-10",
        "source": "ESA/Copernicus Sentinel-2B reference crop reused from the verified primary May series because the independent no-auth optical delivery paths tested for May 2022 were unavailable",
        "delivery_path": "existing repository primary May pack; original pixels were fetched through Microsoft Planetary Computer",
        "platform": "Sentinel-2B",
        "item_id": "S2B_MSIL2A_20220510T100029_R122_T33UYV_20240612T220829",
        "scene_cloud_cover_percent": primary_record.get("scene_cloud_cover_percent") if primary_record else None,
        "local_clear_fraction": primary_record.get("local_clear_fraction") if primary_record else 1.0,
        "local_valid_fraction": primary_record.get("local_valid_fraction") if primary_record else 1.0,
        "native_resolution_m": 10,
        "crop_m": 2000,
        "files": [DST_NATIVE.name, DST_DISPLAY.name],
        "processing": "Direct byte-for-byte copy of the already verified real Sentinel-2 crop from the primary series; no AI, no synthetic filling, no super-resolution.",
        "status": "ok_primary_reference_fallback",
        "independent_source": False,
        "fallback_reason": "Current independent public optical paths tested during this build did not provide a usable no-auth May 2022 crop; this one year is explicitly retained as a verified reference rather than fabricating data.",
    }

    records = [r for r in data["records"] if r.get("year") != YEAR]
    records.append(rec)
    records.sort(key=lambda r: int(r["year"]))
    data["records"] = records
    data["count_ok"] = sum(1 for r in records if str(r.get("status", "")).startswith("ok"))
    data["count_missing"] = len(data["years_requested"]) - data["count_ok"]
    data["count_independent"] = sum(
        1 for r in records
        if str(r.get("status", "")).startswith("ok") and r.get("independent_source", True) is not False
    )
    data["reference_fallback_years"] = [2022]
    data["integrity_note"] = (
        "35 of 36 annual images use the alternate Google Cloud/Element 84 delivery paths. "
        "The 2022 image is an explicitly labelled byte-for-byte reference fallback from the already verified primary Sentinel-2 series."
    )
    manifest_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    base.build_contact_sheet(records)
    zpath = base.make_zip()
    print("FILLED 2022 REFERENCE", json.dumps(rec, ensure_ascii=False), flush=True)
    print("COUNT_OK", data["count_ok"], "OF", data["count_requested"], flush=True)
    print("COUNT_INDEPENDENT", data["count_independent"], "OF", data["count_requested"], flush=True)
    print("ZIP", zpath, zpath.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
