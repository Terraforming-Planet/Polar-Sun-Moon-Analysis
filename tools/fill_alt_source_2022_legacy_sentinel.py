from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import requests

BASE_PATH = Path(__file__).with_name("build_alternate_source_may_1990_2025_53_591400_19_010717.py")
spec = importlib.util.spec_from_file_location("alt_builder", BASE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("cannot load alternate-source builder")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

YEAR = 2022
LEGACY_URL = "https://earth-search.aws.element84.com/v0/search"
LEGACY_COLLECTION = "sentinel-s2-l2a-cogs"


def legacy_search() -> list[dict]:
    params = {
        "collections": LEGACY_COLLECTION,
        "bbox": ",".join(str(x) for x in base.SEARCH_BBOX),
        "datetime": f"{YEAR}-05-01T00:00:00Z/{YEAR}-05-31T23:59:59Z",
        "limit": "100",
    }
    r = requests.get(LEGACY_URL, params=params, timeout=120)
    if r.status_code == 400:
        payload = {
            "collections": [LEGACY_COLLECTION],
            "bbox": base.SEARCH_BBOX,
            "datetime": f"{YEAR}-05-01T00:00:00Z/{YEAR}-05-31T23:59:59Z",
            "limit": 100,
        }
        r = requests.post(LEGACY_URL, json=payload, timeout=120)
    r.raise_for_status()
    return r.json().get("features", [])


def choose(items: list[dict]) -> tuple[dict, dict]:
    if not items:
        raise RuntimeError("legacy Earth Search returned no May 2022 Sentinel-2 scenes")
    best = None
    best_meta = None
    best_score = math.inf
    items.sort(key=lambda i: (base.cloud_cover(i), base.day_distance(i, YEAR)))
    for item in items[:40]:
        try:
            clear, valid = base.sentinel_quality(item)
        except Exception as exc:
            print("legacy quality fallback", item.get("id"), repr(exc), flush=True)
            clear = max(0.0, 1.0 - base.cloud_cover(item) / 100.0)
            valid = 1.0
        score = (1.0 - clear) * 12000 + (1.0 - valid) * 14000 + base.cloud_cover(item) * 3 + base.day_distance(item, YEAR) * 0.2
        print("LEGACY", item.get("id"), base.item_date(item), "cloud", base.cloud_cover(item), "clear", round(clear, 4), "valid", round(valid, 4), "score", round(score, 2), flush=True)
        if score < best_score:
            best_score = score
            best = item
            best_meta = {"local_clear_fraction": clear, "valid_fraction": valid, "score": score}
        if clear >= 0.995 and valid >= 0.995 and base.cloud_cover(item) <= 15:
            break
    if best is None or best_meta is None:
        raise RuntimeError("could not select a legacy Sentinel-2 scene")
    return best, best_meta


def main() -> None:
    manifest_path = base.ROOT / "manifest.json"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    existing = next((r for r in data["records"] if r.get("year") == YEAR), None)
    if existing and str(existing.get("status", "")).startswith("ok"):
        print("2022 already complete; nothing to fill", flush=True)
        return

    item, meta = choose(legacy_search())
    rec = base.render_sentinel(YEAR, item, meta)
    rec["source"] = "ESA/Copernicus Sentinel-2 Level-2A COG via Element 84 Earth Search v0 legacy public archive"
    rec["delivery_path"] = "https://earth-search.aws.element84.com/v0"
    rec["legacy_collection"] = LEGACY_COLLECTION
    rec["status"] = "ok_legacy_e84_fallback"

    records = [r for r in data["records"] if r.get("year") != YEAR]
    records.append(rec)
    records.sort(key=lambda r: int(r["year"]))
    data["records"] = records
    data["count_ok"] = sum(1 for r in records if str(r.get("status", "")).startswith("ok"))
    data["count_missing"] = len(data["years_requested"]) - data["count_ok"]
    data.setdefault("independent_delivery_paths", []).append("Element 84 Earth Search v0 Sentinel-2 COG fallback for 2022")
    manifest_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    base.build_contact_sheet(records)
    zpath = base.make_zip()
    print("FILLED 2022", json.dumps(rec, ensure_ascii=False), flush=True)
    print("COUNT_OK", data["count_ok"], "OF", data["count_requested"], flush=True)
    print("ZIP", zpath, zpath.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
