from __future__ import annotations

import json

import build_late_april_2000_2025_53_591400_19_010717 as late


def main() -> None:
    manifest_path = late.ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    item, meta = late.base.fallback_landsat_l2(2015)
    if not item:
        raise RuntimeError("No April 2015 Landsat Collection 2 Level-2 scene found")

    rec = late.base.render_landsat_l2(2015, item, meta)
    rec["status"] = "ok"
    rec["days_from_april_25"] = late.april_day_distance({"properties": {"datetime": rec["date"]}}, 2015)
    rec["late_april"] = int(rec["date"][8:10]) >= 20

    manifest["records"] = [rec if r.get("year") == 2015 else r for r in manifest["records"]]
    manifest["count_ok"] = sum(1 for r in manifest["records"] if str(r.get("status", "")).startswith("ok"))
    manifest["count_late_april_20_30"] = sum(1 for r in manifest["records"] if r.get("late_april") is True)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    late.build_contact_sheet(manifest["records"])
    zpath = late.make_zip()
    print("FIXED_2015", json.dumps(rec, ensure_ascii=False), flush=True)
    print("COUNT_OK", manifest["count_ok"], flush=True)
    print("ZIP", zpath, zpath.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
