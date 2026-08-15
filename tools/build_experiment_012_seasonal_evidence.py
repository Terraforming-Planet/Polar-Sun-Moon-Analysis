from __future__ import annotations

import json
import shutil
import time
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject

import build_experiment_004_seasonal_evidence as m

TEST = 12
LAT = 41.150000
LON = -112.600000
LAT_STR = "41.150000"
LON_STR = "-112.600000"
YEARS = list(range(1990, 2027))
BRANCH = "experiment-012-great-salt-lake-41-150000--112-600000"
EXP = Path("experiments/experiment_012_great_salt_lake")
SEASONS = EXP / "seasonal_evidence"
FRAME_WIDTH_M = 120000.0
FRAME_HEIGHT_M = 160000.0
FRAME_LABEL = "120x160km"
OUTPUT_GSD_M = 60.0
DISPLAY_WIDTH = 900
DISPLAY_HEIGHT = 1200
TARGET_CRS = "EPSG:32612"
MOSAIC_HALF_WINDOW_DAYS = 16
MAX_MOSAIC_FOOTPRINTS = 12
TARGETS = [
    {"name": "Great Salt Lake", "lat": LAT, "lon": LON},
    {"name": "Gunnison Bay / north arm", "lat": 41.42, "lon": -112.75},
    {"name": "Gilbert Bay / south arm", "lat": 40.95, "lon": -112.55},
]

# Test 012 covers a region larger than a single Sentinel-2 tile and can cross
# Landsat WRS row/path edges.  A single-item reader therefore creates genuine
# no-data borders even when neighboring public scenes exist.  The caches below
# build a deterministic regional mosaic from real pixels only.  No generated
# fill, interpolation across missing areas or AI super-resolution is used.
_MOSAIC_ITEMS: dict[tuple[str, str], list[dict]] = {}
_MOSAIC_USAGE: dict[str, dict[str, set[str]]] = {}


def fixed_regional_grid(_requested_resolution_m: float):
    width = max(1, int(round(FRAME_WIDTH_M / OUTPUT_GSD_M)))
    height = max(1, int(round(FRAME_HEIGHT_M / OUTPUT_GSD_M)))
    transform = from_bounds(*m.base.TARGET_BOUNDS, width=width, height=height)
    return width, height, transform


def save_regional(rgb, base_path: Path) -> tuple[str, str]:
    evidence = base_path.with_name(base_path.stem + "_regional60m.png")
    display = base_path.with_name(base_path.stem + "_display900x1200.jpg")
    img = Image.fromarray(rgb, mode="RGB")
    img.save(evidence, optimize=True)
    img.resize((DISPLAY_WIDTH, DISPLAY_HEIGHT), Image.Resampling.LANCZOS).save(
        display, quality=90, optimize=True
    )
    return evidence.name, display.name


def _asset_key_case_insensitive(item: dict, key: str) -> str | None:
    assets = item.get("assets", {})
    if key in assets:
        return key
    wanted = key.lower()
    for candidate in assets:
        if candidate.lower() == wanted:
            return candidate
    return None


def _footprint_key(item: dict) -> tuple:
    props = item.get("properties", {})
    collection = str(item.get("collection", ""))
    if collection.startswith("landsat"):
        return (
            "landsat",
            props.get("landsat:wrs_path"),
            props.get("landsat:wrs_row"),
            props.get("platform"),
        )
    tile = props.get("s2:mgrs_tile") or props.get("mgrs:tile")
    if tile:
        return ("sentinel2", str(tile), props.get("platform"))
    item_id = str(item.get("id", ""))
    # Sentinel product IDs contain the MGRS tile as a TxxYYY token.
    for token in item_id.split("_"):
        if len(token) == 6 and token.startswith("T") and token[1:3].isdigit():
            return ("sentinel2", token, props.get("platform"))
    return ("item", item_id)


def _candidate_mosaic_items(primary: dict) -> list[dict]:
    primary_id = str(primary.get("id", ""))
    collection = str(primary.get("collection", ""))
    cache_key = (collection, primary_id)
    if cache_key in _MOSAIC_ITEMS:
        return _MOSAIC_ITEMS[cache_key]

    anchor_text = m.base.item_date(primary)
    try:
        anchor = datetime.fromisoformat(anchor_text).date()
    except Exception:
        anchor = date.fromisoformat(anchor_text)
    start = anchor - timedelta(days=MOSAIC_HALF_WINDOW_DAYS)
    stop = min(anchor + timedelta(days=MOSAIC_HALF_WINDOW_DAYS), date.today())
    payload = {
        "collections": [collection],
        "bbox": m.base.SEARCH_BBOX,
        "datetime": f"{start.isoformat()}T00:00:00Z/{stop.isoformat()}T23:59:59Z",
        "limit": 200,
    }
    try:
        features = m.base.request_json("POST", m.base.PC_SEARCH, json=payload).get("features", [])
    except Exception as exc:
        print("MOSAIC search failed", primary_id, repr(exc), flush=True)
        features = []

    by_id = {str(x.get("id", "")): x for x in features if x.get("id")}
    by_id[primary_id] = primary
    primary_platform = str(primary.get("properties", {}).get("platform", ""))

    def rank(item: dict) -> tuple:
        item_id = str(item.get("id", ""))
        try:
            d = abs((date.fromisoformat(m.base.item_date(item)) - anchor).days)
        except Exception:
            d = 999
        platform = str(item.get("properties", {}).get("platform", ""))
        return (
            0 if item_id == primary_id else 1,
            0 if platform == primary_platform else 1,
            d,
            m.base.cloud_cover(item),
            item_id,
        )

    # Keep the best processing instance for each spatial footprint.  This is
    # important for Sentinel-2 where the STAC can contain reprocessed copies of
    # the same MGRS tile.
    selected: list[dict] = []
    footprints: set[tuple] = set()
    for item in sorted(by_id.values(), key=rank):
        footprint = _footprint_key(item)
        if footprint in footprints:
            continue
        footprints.add(footprint)
        selected.append(item)
        if len(selected) >= MAX_MOSAIC_FOOTPRINTS:
            break

    _MOSAIC_ITEMS[cache_key] = selected
    print(
        "MOSAIC candidates",
        primary_id,
        "anchor",
        anchor_text,
        "count",
        len(selected),
        [str(x.get("id")) for x in selected],
        flush=True,
    )
    return selected


def _unsigned_href(href: str) -> str:
    # Planetary Computer asset hrefs normally arrive unsigned.  If a signed URL
    # is ever cached in an item, discard the stale SAS query before re-signing.
    if "?" in href and ("sig=" in href or "se=" in href or "st=" in href):
        return href.split("?", 1)[0]
    return href


def _read_one_item(
    item: dict,
    key: str,
    nearest: bool,
    band_index: int,
) -> np.ndarray:
    collection = str(item["collection"])
    asset_key = _asset_key_case_insensitive(item, key)
    if asset_key is None:
        raise KeyError(f"asset {key!r} absent in {item.get('id')}")
    raw_href = _unsigned_href(str(item["assets"][asset_key]["href"]))
    width, height, dst_transform = fixed_regional_grid(OUTPUT_GSD_M)
    env = {
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "GDAL_HTTP_MULTIRANGE": "YES",
        "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
        "GDAL_HTTP_MAX_RETRY": "3",
        "GDAL_HTTP_RETRY_DELAY": "1",
    }

    last_exc: Exception | None = None
    for attempt in range(4):
        if attempt:
            # A Planetary Computer SAS token can expire during a long 74-image
            # build.  Drop the cached token and obtain a fresh signature.
            m.base.TOKENS.pop(collection, None)
            time.sleep(min(4, attempt))
        href = m.base.sign_href(raw_href, collection)
        dst = np.full((height, width), np.nan, dtype=np.float32)
        try:
            with rasterio.Env(**env):
                with rasterio.open(href) as src:
                    reproject(
                        source=rasterio.band(src, band_index),
                        destination=dst,
                        src_transform=src.transform,
                        src_crs=src.crs,
                        src_nodata=src.nodata,
                        dst_transform=dst_transform,
                        dst_crs=TARGET_CRS,
                        dst_nodata=np.nan,
                        resampling=Resampling.nearest if nearest else Resampling.bilinear,
                    )
            return dst
        except Exception as exc:
            last_exc = exc
            text = str(exc).lower()
            retryable = (
                "403" in text
                or "401" in text
                or "chunk and warp failed" in text
                or "timed out" in text
                or "connection" in text
            )
            print(
                "MOSAIC read retry" if retryable and attempt < 3 else "MOSAIC read failed",
                item.get("id"),
                asset_key,
                f"attempt={attempt + 1}",
                repr(exc),
                flush=True,
            )
            if not retryable:
                break
    assert last_exc is not None
    raise last_exc


def mosaic_read_asset(
    item: dict,
    key: str,
    resolution_m: float,
    nearest: bool = False,
    band_index: int = 1,
) -> np.ndarray:
    del resolution_m  # Test 012 intentionally uses one uniform 60 m regional grid.
    width, height, _ = fixed_regional_grid(OUTPUT_GSD_M)
    merged = np.full((height, width), np.nan, dtype=np.float32)
    primary_id = str(item.get("id", ""))
    usage = _MOSAIC_USAGE.setdefault(primary_id, {"item_ids": set(), "dates": set()})
    failures: list[str] = []

    for candidate in _candidate_mosaic_items(item):
        candidate_key = _asset_key_case_insensitive(candidate, key)
        if candidate_key is None:
            continue
        try:
            part = _read_one_item(candidate, candidate_key, nearest, band_index)
        except Exception as exc:
            failures.append(f"{candidate.get('id')}: {exc!r}")
            continue
        valid = np.isfinite(part)
        fill = valid & (~np.isfinite(merged))
        if np.any(fill):
            merged[fill] = part[fill]
            usage["item_ids"].add(str(candidate.get("id", "")))
            usage["dates"].add(m.base.item_date(candidate))
        if np.isfinite(merged).all():
            break

    coverage = float(np.mean(np.isfinite(merged))) if merged.size else 0.0
    print(
        "MOSAIC result",
        primary_id,
        key,
        "coverage",
        round(coverage, 6),
        "sources",
        len(usage["item_ids"]),
        flush=True,
    )
    if not np.any(np.isfinite(merged)):
        raise RuntimeError(
            f"regional mosaic contains no readable pixels for {primary_id} {key}; failures={failures[:4]}"
        )
    return merged


def _set_full_aoi_search_bbox() -> None:
    xmin, ymin, xmax, ymax = m.base.TARGET_BOUNDS
    inverse = Transformer.from_crs(TARGET_CRS, "EPSG:4326", always_xy=True)
    corners = [
        inverse.transform(xmin, ymin),
        inverse.transform(xmin, ymax),
        inverse.transform(xmax, ymin),
        inverse.transform(xmax, ymax),
    ]
    lons = [p[0] for p in corners]
    lats = [p[1] for p in corners]
    # Small padding ensures STAC returns every tile touching the fixed frame.
    m.base.SEARCH_BBOX = [
        min(lons) - 0.03,
        min(lats) - 0.03,
        max(lons) + 0.03,
        max(lats) + 0.03,
    ]
    print("TEST012 full AOI search bbox", m.base.SEARCH_BBOX, flush=True)


def configure_globals() -> None:
    m.LAT = LAT
    m.LON = LON
    m.YEARS = YEARS
    m.BRANCH = BRANCH
    m.EXP = EXP
    m.SEASONS = SEASONS
    m.TARGETS = TARGETS
    m.FRAME_WIDTH_M = FRAME_WIDTH_M
    m.FRAME_HEIGHT_M = FRAME_HEIGHT_M
    m.FRAME_LABEL = FRAME_LABEL
    m.DISPLAY_WIDTH = DISPLAY_WIDTH
    m.DISPLAY_HEIGHT = DISPLAY_HEIGHT
    m.base.TARGET_CRS = TARGET_CRS
    m.base.transformer = Transformer.from_crs("EPSG:4326", TARGET_CRS, always_xy=True)
    m.configure()
    m.base.target_grid = fixed_regional_grid
    m.base.save_native_and_display = save_regional
    _set_full_aoi_search_bbox()
    m.base.read_asset = mosaic_read_asset


def _mosaic_metadata(rec: dict) -> dict | None:
    primary_id = str(rec.get("item_id", ""))
    usage = _MOSAIC_USAGE.get(primary_id)
    if not usage or not usage["item_ids"]:
        return None
    dates = sorted(x for x in usage["dates"] if x)
    item_ids = sorted(x for x in usage["item_ids"] if x)
    span_days = 0
    if len(dates) > 1:
        span_days = (date.fromisoformat(dates[-1]) - date.fromisoformat(dates[0])).days
    return {
        "method": "regional multi-scene mosaic; real source pixels only",
        "anchor_item_id": primary_id,
        "source_item_ids": item_ids,
        "source_acquisition_dates": dates,
        "date_span_days": span_days,
        "maximum_anchor_window_days": MOSAIC_HALF_WINDOW_DAYS,
        "generated_fill": False,
        "ai_super_resolution": False,
    }


def normalize_season_output(name: str, result: dict) -> dict:
    root = SEASONS / name
    old = root / f"EXPERIMENT_001_{name.upper()}_1990_2026_37_YEARS_2km_53.591400_19.010717.zip"
    if old.exists():
        old.unlink()
    new = root / f"TEST012_{name.upper()}_1990_2026_37_YEARS_{FRAME_LABEL}_{LAT_STR}_{LON_STR}.zip"
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest.update(
        {
            "experiment": "Experiment 012 - Great Salt Lake Utah USA water-loss reference",
            "test_number": TEST,
            "center": {"lat": LAT, "lon": LON},
            "targets": TARGETS,
            "aoi": {
                "width_m": int(FRAME_WIDTH_M),
                "height_m": int(FRAME_HEIGHT_M),
                "orientation": "north_up",
                "output_grid_m": OUTPUT_GSD_M,
                "crs": TARGET_CRS,
                "purpose": "full regional Great Salt Lake reference frame for long-term shoreline and exposed-lakebed comparison",
            },
            "dataset_role": "TerraWater USA control case with documented large water-level and areal-extent variability",
            "object_name": "Great Salt Lake, Utah, USA",
            "zip": str(new),
            "source_policy": "real public satellite pixels only; USGS Landsat Collection 2 and ESA/Copernicus Sentinel-2 products; multi-scene regional mosaics allowed only from real acquisitions inside the declared seasonal window; no generative fill or AI super-resolution",
            "regional_mosaic_policy": {
                "enabled": True,
                "reason": "120x160 km AOI can cross Landsat WRS and Sentinel-2 MGRS tile boundaries",
                "anchor_window_days": MOSAIC_HALF_WINDOW_DAYS,
                "maximum_spatial_footprints": MAX_MOSAIC_FOOTPRINTS,
                "token_refresh_on_401_403": True,
            },
        }
    )
    for rec in manifest.get("records", []):
        if rec.get("status") == "ok":
            rec["output_grid_m"] = OUTPUT_GSD_M
            rec["regional_frame"] = FRAME_LABEL
            rec["target_crs"] = TARGET_CRS
            mosaic = _mosaic_metadata(rec)
            if mosaic:
                rec["regional_mosaic"] = mosaic
                rec["processing"] = (
                    str(rec.get("processing", ""))
                    + " Regional coverage assembled from real neighboring source scenes; no generated pixels."
                ).strip()
    manifest.pop("zip_bytes", None)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    m.write_contact_sheet(name, manifest)
    m.rebuild_season_zip(name, new)
    result.update({"zip": str(new), "zip_bytes": new.stat().st_size})
    return result


def accepted_years(manifest: dict) -> list[int]:
    return [int(r["year"]) for r in manifest["records"] if r.get("status") == "ok"]


def platforms(*manifests: dict) -> list[str]:
    out = set()
    for manifest in manifests:
        for rec in manifest["records"]:
            if rec.get("status") == "ok" and rec.get("platform"):
                out.add(str(rec["platform"]))
    return sorted(out)


def write_metadata() -> None:
    sm = json.loads((SEASONS / "spring" / "manifest.json").read_text(encoding="utf-8"))
    am = json.loads((SEASONS / "autumn" / "manifest.json").read_text(encoding="utf-8"))
    sy, ay = accepted_years(sm), accepted_years(am)
    policy = {
        "experiment_id": "012",
        "name": "Great Salt Lake, Utah, USA",
        "center": {"lat": LAT, "lon": LON},
        "targets": TARGETS,
        "frame": {
            "width_m": int(FRAME_WIDTH_M),
            "height_m": int(FRAME_HEIGHT_M),
            "orientation": "north_up",
            "output_grid_m": OUTPUT_GSD_M,
            "crs": TARGET_CRS,
        },
        "years": {"start": 1990, "end": 2026, "count": 37},
        "seasons": {
            "spring": {"preferred": 5, "fallback": [4, 6]},
            "autumn": {"preferred": 9, "fallback": [10, 11]},
        },
        "regional_mosaic": {
            "required_for_large_aoi": True,
            "maximum_anchor_window_days": MOSAIC_HALF_WINDOW_DAYS,
            "real_pixels_only": True,
            "source_product_ids_recorded": True,
            "source_dates_recorded": True,
        },
        "rules": {
            "real_acquisition_date_required": True,
            "same_footprint_every_year": True,
            "future_observations_never_invented": True,
            "autumn_2026_missing_until_observed": True,
            "generative_fill_forbidden": True,
            "ai_super_resolution_forbidden": True,
            "cross_year_exact_duplicate_rejected": True,
            "cross_season_duplicate_checked_in_ci": True,
            "product_id_duplicate_checked_in_ci": True,
            "expired_sas_token_must_be_refreshed": True,
        },
        "external_reference": "USGS Great Salt Lake elevation/areal-extent and Landsat historical records",
    }
    (EXP / "EVIDENCE_POLICY.json").write_text(
        json.dumps(policy, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    cfg = {
        "experiment_id": "012",
        "center": {"lat": LAT, "lon": LON},
        "targets": TARGETS,
        "frame": policy["frame"],
        "years": YEARS,
        "spring_missing_years": [y for y in YEARS if y not in sy],
        "autumn_missing_years": [y for y in YEARS if y not in ay],
        "platforms_used": platforms(sm, am),
    }
    (EXP / "experiment.json").write_text(
        json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    report = f"""# Experiment 012 — Great Salt Lake, Utah, USA, 1990–2026

- Fixed frame: **120 km × 160 km**, north-up, UTM 12N.
- Center: **{LAT_STR}, {LON_STR}**.
- Uniform rendered grid: **60 m/pixel** for regional cross-year visual comparison.
- Regional tile handling: **multi-scene mosaic from real source pixels**, max ±{MOSAIC_HALF_WINDOW_DAYS} days from the anchor acquisition; source IDs and dates are preserved in each accepted manifest record.
- Authentication: Planetary Computer SAS is automatically refreshed after 401/403 during long builds.
- Spring: May preferred; fallback April/June.
- Autumn: September preferred; fallback October/November.
- Spring accepted: **{len(sy)}/37**.
- Autumn accepted: **{len(ay)}/37**.
- Platforms: **{', '.join(platforms(sm, am))}**.

Great Salt Lake is used as an external control case because USGS independently documents large changes in lake elevation and areal extent. Satellite imagery is evidence; quantitative area/volume calculations will be a separate measurement stage. No generative filling or AI super-resolution is used.
"""
    (EXP / "EXPERIMENT_012_REPORT.md").write_text(report, encoding="utf-8")


def build_combined_zip() -> Path:
    out = EXP / (
        f"TEST012_GREAT_SALT_LAKE_1990_2026_SPRING_AUTUMN_{FRAME_LABEL}_{LAT_STR}_{LON_STR}.zip"
    )
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for season in ("spring", "autumn"):
            root = SEASONS / season
            for p in sorted(root.rglob("*")):
                if p.is_file() and p.suffix.lower() != ".zip":
                    zf.write(p, Path(season) / p.relative_to(root))
        for extra in ("EXPERIMENT_012_REPORT.md", "experiment.json", "EVIDENCE_POLICY.json"):
            p = EXP / extra
            if p.exists():
                zf.write(p, p.name)
    return out


def main() -> None:
    if EXP.exists():
        shutil.rmtree(EXP)
    configure_globals()
    SEASONS.mkdir(parents=True, exist_ok=True)
    spring = normalize_season_output("spring", m.exp1.build_season("spring", [5, 4, 6]))
    autumn = normalize_season_output("autumn", m.exp1.build_season("autumn", [9, 10, 11]))
    write_metadata()
    combined = build_combined_zip()
    sm = json.loads((SEASONS / "spring" / "manifest.json").read_text())
    am = json.loads((SEASONS / "autumn" / "manifest.json").read_text())
    sy, ay = accepted_years(sm), accepted_years(am)
    summary = {
        "experiment": TEST,
        "object": "Great Salt Lake, Utah, USA",
        "center": {"lat": LAT, "lon": LON},
        "frame_width_m": int(FRAME_WIDTH_M),
        "frame_height_m": int(FRAME_HEIGHT_M),
        "output_grid_m": OUTPUT_GSD_M,
        "target_crs": TARGET_CRS,
        "regional_mosaic": True,
        "mosaic_anchor_window_days": MOSAIC_HALF_WINDOW_DAYS,
        "sas_token_refresh": True,
        "spring_count_ok": len(sy),
        "autumn_count_ok": len(ay),
        "spring_missing_years": [y for y in YEARS if y not in sy],
        "autumn_missing_years": [y for y in YEARS if y not in ay],
        "platforms_used": platforms(sm, am),
        "combined_zip": str(combined),
        "combined_zip_bytes": combined.stat().st_size,
    }
    (EXP / "BUILD_SUMMARY.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
