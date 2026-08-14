from __future__ import annotations

import numpy as np

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

    Exact manifest product ID wins. A date alone is not enough because this AOI
    lies close to overlapping Landsat paths / Sentinel-2 tiles.
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

    def score(item: dict) -> tuple[int, float]:
        p = base.platform_norm(item.get("properties", {}).get("platform"))
        match = 0 if (not platform or platform in p or p in platform) else 1
        cloud = float(item.get("properties", {}).get("eo:cloud_cover", 100) or 100)
        return match, cloud

    items.sort(key=score)
    return items[0]


def _band_key(item: dict, role: str) -> str:
    """Return the physically correct band for this sensor generation.

    The previous generic candidate list could select Landsat SR_B5 as NIR for
    Landsat-5/7, even though SR_B5 is SWIR1 there. This function makes the
    mapping sensor-specific and therefore prevents NIR/SWIR swaps.
    """
    platform = base.platform_norm(item.get("properties", {}).get("platform"))
    collection = item.get("collection")

    common_names = {
        "green": ["green"],
        "nir": ["nir08", "nir"],
        "swir1": ["swir16", "swir"],
    }
    common = base.asset_key(item, [], common_names[role])
    if common:
        return common

    if collection == "sentinel-2-l2a" or "sentinel" in platform:
        candidates = {
            "green": ["B03", "B3", "green"],
            "nir": ["B08", "B8", "nir", "nir08"],
            "swir1": ["B11", "swir16", "swir1"],
        }[role]
    elif "landsat-8" in platform or "landsat-9" in platform:
        candidates = {
            "green": ["SR_B3", "green"],
            "nir": ["SR_B5", "nir08", "nir"],
            "swir1": ["SR_B6", "swir16", "swir1"],
        }[role]
    else:
        # Landsat 4/5 TM and Landsat 7 ETM+:
        # green=B2, NIR=B4, SWIR1=B5.
        candidates = {
            "green": ["SR_B2", "green"],
            "nir": ["SR_B4", "nir08", "nir"],
            "swir1": ["SR_B5", "swir16", "swir1"],
        }[role]

    assets = item.get("assets", {})
    lower = {str(k).lower(): k for k in assets}
    for key in candidates:
        if key in assets:
            return key
        if key.lower() in lower:
            return lower[key.lower()]
    raise RuntimeError(f"missing {role} band for {platform}; assets={list(assets)}")


def water_indices(item: dict):
    green_key = _band_key(item, "green")
    nir_key = _band_key(item, "nir")
    swir_key = _band_key(item, "swir1")
    if len({green_key, nir_key, swir_key}) != 3:
        raise RuntimeError(f"spectral band collision: green={green_key} nir={nir_key} swir1={swir_key}")

    green = base.read(item, green_key)
    nir = base.read(item, nir_key)
    swir = base.read(item, swir_key)
    clear = base.clear_mask(item, green.shape)

    ndwi = np.full(green.shape, np.nan, np.float32)
    den = green + nir
    good = np.isfinite(green) & np.isfinite(nir) & (np.abs(den) > 1e-7)
    ndwi[good] = (green[good] - nir[good]) / den[good]

    mndwi = np.full(green.shape, np.nan, np.float32)
    den2 = green + swir
    good2 = np.isfinite(green) & np.isfinite(swir) & (np.abs(den2) > 1e-7)
    mndwi[good2] = (green[good2] - swir[good2]) / den2[good2]
    return ndwi, mndwi, clear


# Image-first geometry correction for Lake Kuchnia.
# Repeated optical crops place the main persistent lake near display x~710,y~530
# in the fixed 2 km / 1024 px crop: roughly +390 m east and -40 m north from AOI center.
# The previous 19.02326 / 53.58894 seed was too far east and could land outside the
# connected main-water component.
base.LAKE_X = base.CX + 390.0
base.LAKE_Y = base.CY - 40.0
base.LAKE_LON, base.LAKE_LAT = base.INV.transform(base.LAKE_X, base.LAKE_Y)

# Patch module-global functions used by base.analyze_record().
base.l2_item = l2_item
base.water_indices = water_indices

# Re-export measurement API and corrected geometry constants.
analyze_record = base.analyze_record
endpoint = base.endpoint
POND_LAT = base.POND_LAT
POND_LON = base.POND_LON
POND_X = base.POND_X
POND_Y = base.POND_Y
LAKE_LAT = base.LAKE_LAT
LAKE_LON = base.LAKE_LON
LAKE_X = base.LAKE_X
LAKE_Y = base.LAKE_Y
LAT = base.LAT
LON = base.LON
COMMON_RES = base.COMMON_RES
EXP = base.EXP
OUT = base.OUT
MASKS = base.MASKS
