from __future__ import annotations

import measure_experiment_001_seasonal_water_v2 as base


def _record_target_id(record: dict) -> str | None:
    for key in ("item_id", "source_item_id", "catalog_item_id", "measurement_item_id"):
        value = record.get(key)
        if value:
            return str(value)
    return None


def _landsat_pathrow(product_id: str | None) -> str | None:
    if not product_id:
        return None
    for part in str(product_id).split("_"):
        if len(part) == 6 and part.isdigit():
            return part
    return None


def l2_item(record: dict) -> dict:
    """Resolve the measurement product deterministically.

    Exact manifest product ID wins.  A date alone is not enough because this AOI
    lies close to overlapping Landsat paths / Sentinel-2 tiles.  If the exact ID
    is absent, path/row and platform are used before cloud cover.
    """
    dt = record["date"]
    platform = base.platform_norm(record.get("platform"))
    collection = "sentinel-2-l2a" if "sentinel" in platform else "landsat-c2-l2"
    target_id = _record_target_id(record)

    data = base.request_json(
        "POST",
        base.PC_SEARCH,
        json={
            "collections": [collection],
            "bbox": [base.LON - 0.05, base.LAT - 0.04, base.LON + 0.05, base.LAT + 0.04],
            "datetime": f"{dt}T00:00:00Z/{dt}T23:59:59Z",
            "limit": 100,
        },
    )
    items = data.get("features", [])
    if not items:
        raise RuntimeError(f"no L2 item for {dt} {platform}")

    if target_id:
        exact = [item for item in items if str(item.get("id")) == target_id]
        if exact:
            return exact[0]

        # Some catalog families may expose equivalent scene IDs with processing
        # suffix differences.  For Landsat, require the same WRS path/row and date
        # before considering a fallback.  Never silently jump to a neighbouring path.
        target_pathrow = _landsat_pathrow(target_id)
        if target_pathrow and collection == "landsat-c2-l2":
            same_path = [
                item
                for item in items
                if _landsat_pathrow(str(item.get("id", ""))) == target_pathrow
                and platform in base.platform_norm(item.get("properties", {}).get("platform"))
            ]
            if same_path:
                same_path.sort(key=lambda i: float(i.get("properties", {}).get("eo:cloud_cover", 100) or 100))
                return same_path[0]

        raise RuntimeError(
            f"exact source product not found for measurement: requested={target_id} date={dt} collection={collection}; "
            "refusing to substitute a neighbouring scene/tile"
        )

    # No exact product ID in the record: this is allowed only for legacy/fallback
    # records and is explicitly weaker. Prefer platform match, then local geometry
    # candidate with the smallest scene cloud value.
    def score(item: dict) -> tuple[int, float]:
        p = base.platform_norm(item.get("properties", {}).get("platform"))
        match = 0 if (not platform or platform in p or p in platform) else 1
        cloud = float(item.get("properties", {}).get("eo:cloud_cover", 100) or 100)
        return match, cloud

    items.sort(key=score)
    return items[0]


# Patch the module-global resolver used inside base.analyze_record().
base.l2_item = l2_item

# Re-export the measurement API and geometry constants.
analyze_record = base.analyze_record
endpoint = base.endpoint
POND_LAT = base.POND_LAT
POND_LON = base.POND_LON
POND_X = base.POND_X
POND_Y = base.POND_Y
LAKE_LAT = base.LAKE_LAT
LAKE_LON = base.LAKE_LON
LAT = base.LAT
LON = base.LON
COMMON_RES = base.COMMON_RES
EXP = base.EXP
OUT = base.OUT
MASKS = base.MASKS
