from __future__ import annotations

import json
import math
import os
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import numpy as np
import planetary_computer
import pystac_client
import rasterio
import requests
from PIL import Image
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject

LAT = 53.594070
LON = 19.000151
YEARS = [2000, 2005, 2010, 2015, 2020, 2026]
HALF_SIZE_M = 1000.0  # exact 2 km x 2 km crop
TARGET_CRS = "EPSG:32634"  # WGS84 / UTM zone 34N
ROOT = Path("satellite_packs") / "53.594070_19.000151"
ROOT.mkdir(parents=True, exist_ok=True)

PC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
EARTH_SEARCH = "https://earth-search.aws.element84.com/v1"

session = requests.Session()
token_cache: dict[str, str] = {}

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF,.jp2,.JP2")
os.environ.setdefault("AWS_NO_SIGN_REQUEST", "YES")
os.environ.setdefault("AWS_REGION", "us-west-2")

transformer = Transformer.from_crs("EPSG:4326", TARGET_CRS, always_xy=True)
CX, CY = transformer.transform(LON, LAT)
TARGET_BOUNDS = (CX - HALF_SIZE_M, CY - HALF_SIZE_M, CX + HALF_SIZE_M, CY + HALF_SIZE_M)
SEARCH_BBOX = [LON - 0.04, LAT - 0.03, LON + 0.04, LAT + 0.03]


def pc_token(collection_id: str) -> str:
    if collection_id not in token_cache:
        r = session.get(
            f"https://planetarycomputer.microsoft.com/api/sas/v1/token/{collection_id}",
            timeout=60,
        )
        r.raise_for_status()
        token_cache[collection_id] = r.json()["token"]
    return token_cache[collection_id]


def href_for(item, asset_key: str, source: str) -> str:
    href = item.assets[asset_key].href
    if source == "pc":
        if "?" not in href:
            href = href + "?" + pc_token(item.collection_id)
        return href
    if href.startswith("s3://"):
        # Keep S3 URI; rasterio/GDAL uses unsigned access for public Earth Search buckets.
        return href
    return href


def asset_key_by_common_name(item, common_name: str, candidates: Iterable[str] = ()) -> str | None:
    lower_candidates = [c.lower() for c in candidates]
    for candidate in candidates:
        if candidate in item.assets:
            return candidate
    for key in item.assets:
        lk = key.lower()
        if lk in lower_candidates:
            return key
    for key, asset in item.assets.items():
        for band in asset.extra_fields.get("eo:bands", []) or []:
            if str(band.get("common_name", "")).lower() == common_name.lower():
                return key
    # permissive name matching as a last resort
    patterns = {
        "blue": ["blue", "band1", "b01", "b1"],
        "green": ["green", "band2", "b02", "b2"],
        "red": ["red", "band3", "b03", "b3"],
        "nir": ["nir", "band3n", "b3n", "nir08"],
        "pan": ["pan", "panchromatic", "band8", "b8"],
        "hh": ["hh"],
        "hv": ["hv"],
    }.get(common_name.lower(), [common_name.lower()])
    for key in item.assets:
        lk = key.lower().replace("_", "").replace("-", "")
        if any(p.replace("_", "").replace("-", "") in lk for p in patterns):
            return key
    return None


def grid_for_resolution(res_m: float):
    width = max(1, int(round((HALF_SIZE_M * 2) / res_m)))
    height = width
    transform = from_bounds(*TARGET_BOUNDS, width=width, height=height)
    return width, height, transform


def read_asset(item, key: str, source: str, res_m: float, resampling=Resampling.bilinear) -> np.ndarray:
    href = href_for(item, key, source)
    width, height, dst_transform = grid_for_resolution(res_m)
    dst = np.full((height, width), np.nan, dtype=np.float32)
    env_kwargs = {
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "GDAL_HTTP_MULTIRANGE": "YES",
        "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
        "AWS_NO_SIGN_REQUEST": "YES",
    }
    with rasterio.Env(**env_kwargs):
        with rasterio.open(href) as src:
            reproject(
                source=rasterio.band(src, 1),
                destination=dst,
                src_transform=src.transform,
                src_crs=src.crs,
                src_nodata=src.nodata,
                dst_transform=dst_transform,
                dst_crs=TARGET_CRS,
                dst_nodata=np.nan,
                resampling=resampling,
            )
    return dst


def valid_fraction(arr: np.ndarray) -> float:
    return float(np.mean(np.isfinite(arr))) if arr.size else 0.0


def stretch_band(arr: np.ndarray, p_low: float = 2.0, p_high: float = 98.0) -> np.ndarray:
    out = np.zeros(arr.shape, dtype=np.float32)
    valid = np.isfinite(arr)
    if not np.any(valid):
        return out
    values = arr[valid]
    lo, hi = np.percentile(values, [p_low, p_high])
    if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
        lo = float(np.nanmin(values))
        hi = float(np.nanmax(values))
    if hi <= lo:
        out[valid] = 0.5
        return out
    out[valid] = np.clip((arr[valid] - lo) / (hi - lo), 0.0, 1.0)
    return out


def rgb_to_png(channels: list[np.ndarray], path: Path, gamma: float = 0.95) -> None:
    s = np.stack([stretch_band(c) for c in channels], axis=-1)
    s = np.clip(s, 0.0, 1.0) ** gamma
    rgb8 = np.rint(s * 255).astype(np.uint8)
    Image.fromarray(rgb8, mode="RGB").save(path, optimize=True)


def gray_to_png(arr: np.ndarray, path: Path, log_scale: bool = False) -> None:
    x = arr.copy().astype(np.float32)
    if log_scale:
        valid = np.isfinite(x) & (x > 0)
        x[valid] = 10.0 * np.log10(x[valid])
        x[~valid] = np.nan
    s = stretch_band(x, 1.0, 99.0)
    g = np.rint(s * 255).astype(np.uint8)
    Image.fromarray(g, mode="L").save(path, optimize=True)


def save_geotiff(channels: list[np.ndarray], path: Path, res_m: float, descriptions: list[str]) -> None:
    width, height, transform = grid_for_resolution(res_m)
    profile = {
        "driver": "GTiff",
        "height": height,
        "width": width,
        "count": len(channels),
        "dtype": "float32",
        "crs": TARGET_CRS,
        "transform": transform,
        "compress": "deflate",
        "predictor": 3,
        "nodata": np.nan,
    }
    with rasterio.open(path, "w", **profile) as dst:
        for idx, (arr, desc) in enumerate(zip(channels, descriptions), start=1):
            dst.write(arr.astype(np.float32), idx)
            dst.set_band_description(idx, desc)


def item_date(item) -> str:
    raw = item.properties.get("datetime") or item.properties.get("start_datetime") or ""
    return str(raw)[:10]


def cloud(item) -> float:
    try:
        return float(item.properties.get("eo:cloud_cover", 100.0))
    except Exception:
        return 100.0


def day_distance(item, year: int) -> int:
    raw = item_date(item)
    try:
        dt = datetime.fromisoformat(raw)
        target = datetime(year, 7, 15)
        return abs((dt - target).days)
    except Exception:
        return 999


def rank_items(items, year: int):
    return sorted(items, key=lambda i: (cloud(i), day_distance(i, year), item_date(i)))


def select_item_with_coverage(items, year: int, source: str, test_keys: list[str], res_m: float):
    for item in rank_items(items, year)[:20]:
        for key in test_keys:
            if key and key in item.assets:
                try:
                    arr = read_asset(item, key, source, res_m, Resampling.nearest)
                    vf = valid_fraction(arr)
                    print("coverage", year, item.id, key, vf, "cloud", cloud(item), flush=True)
                    if vf >= 0.95:
                        return item, vf
                except Exception as exc:
                    print("coverage test failed", item.id, key, repr(exc), flush=True)
    return None, 0.0


def pc_catalog():
    return pystac_client.Client.open(PC_STAC)


def earth_catalog():
    return pystac_client.Client.open(EARTH_SEARCH)


def find_pc_collection(title_terms: list[str], id_candidates: list[str]) -> str | None:
    cat = pc_catalog()
    for cid in id_candidates:
        try:
            cat.get_collection(cid)
            return cid
        except Exception:
            pass
    terms = [t.lower() for t in title_terms]
    for c in cat.get_collections():
        text = f"{c.id} {c.title or ''} {c.description or ''}".lower()
        if all(t in text for t in terms):
            return c.id
    return None


def search_pc(collection: str, year: int, platform: str | None = None):
    cat = pc_catalog()
    query = {"eo:cloud_cover": {"lt": 90}}
    if platform:
        query["platform"] = {"eq": platform}
    try:
        search = cat.search(
            collections=[collection],
            bbox=SEARCH_BBOX,
            datetime=f"{year}-01-01/{year}-12-31",
            query=query,
            limit=100,
        )
        return list(search.items())
    except Exception:
        # Some collections do not expose eo:cloud_cover/platform queryables.
        search = cat.search(
            collections=[collection],
            bbox=SEARCH_BBOX,
            datetime=f"{year}-01-01/{year}-12-31",
            limit=100,
        )
        items = list(search.items())
        if platform:
            items = [i for i in items if str(i.properties.get("platform", "")).lower() == platform.lower()]
        return items


def write_manifest(pack_dir: Path, payload: dict) -> None:
    (pack_dir / "manifest.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def zip_dir(pack_dir: Path, zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for p in sorted(pack_dir.rglob("*")):
            if p.is_file():
                zf.write(p, p.relative_to(pack_dir))


def build_landsat() -> dict:
    pack = ROOT / "USGS_Landsat"
    shutil.rmtree(pack, ignore_errors=True)
    pack.mkdir(parents=True)
    manifest = {
        "source": "USGS Landsat Collection 2 via Microsoft Planetary Computer STAC",
        "coordinate": {"lat": LAT, "lon": LON},
        "crop": "2 km x 2 km centered exactly on coordinate",
        "years": [],
        "notes": "Natural-color RGB from real Landsat bands. Where a 15 m panchromatic band exists, an additional pansharpened 15 m display is included. Pansharpening is deterministic image processing, not AI and does not invent source detail beyond the pan band.",
    }
    collection = "landsat-c2-l1"
    prefs = {
        2000: ["landsat-7"],
        2005: ["landsat-5", "landsat-7"],
        2010: ["landsat-5", "landsat-7"],
        2015: ["landsat-8"],
        2020: ["landsat-8"],
        2026: ["landsat-9", "landsat-8"],
    }
    for year in YEARS:
        record = {"requested_year": year, "status": "not_found"}
        chosen = None
        chosen_vf = 0.0
        for platform in prefs[year]:
            items = search_pc(collection, year, platform)
            for item in items:
                red_key = asset_key_by_common_name(item, "red", ["red"])
                if red_key:
                    pass
            test = []
            if items:
                rk = asset_key_by_common_name(items[0], "red", ["red"])
                if rk:
                    test.append(rk)
            if test:
                chosen, chosen_vf = select_item_with_coverage(items, year, "pc", test, 30.0)
            if chosen:
                break
        if not chosen:
            manifest["years"].append(record)
            continue
        red_key = asset_key_by_common_name(chosen, "red", ["red"])
        green_key = asset_key_by_common_name(chosen, "green", ["green"])
        blue_key = asset_key_by_common_name(chosen, "blue", ["blue"])
        pan_key = asset_key_by_common_name(chosen, "pan", ["pan", "panchromatic"])
        if not all([red_key, green_key, blue_key]):
            record.update(status="missing_rgb_assets", item_id=chosen.id, asset_keys=list(chosen.assets))
            manifest["years"].append(record)
            continue
        r30 = read_asset(chosen, red_key, "pc", 30.0)
        g30 = read_asset(chosen, green_key, "pc", 30.0)
        b30 = read_asset(chosen, blue_key, "pc", 30.0)
        date = item_date(chosen)
        sensor = str(chosen.properties.get("platform", "landsat"))
        base = f"{year}_{date}_{sensor}_2km"
        png_native = pack / f"{base}_RGB_native30m.png"
        tif_native = pack / f"{base}_RGB_native30m.tif"
        rgb_to_png([r30, g30, b30], png_native)
        save_geotiff([r30, g30, b30], tif_native, 30.0, ["red", "green", "blue"])
        files = [png_native.name, tif_native.name]
        if pan_key:
            try:
                r15 = read_asset(chosen, red_key, "pc", 15.0)
                g15 = read_asset(chosen, green_key, "pc", 15.0)
                b15 = read_asset(chosen, blue_key, "pc", 15.0)
                pan = read_asset(chosen, pan_key, "pc", 15.0)
                sr, sg, sb, sp = map(stretch_band, [r15, g15, b15, pan])
                intensity = (sr + sg + sb) / 3.0
                ratio = np.divide(sp, intensity + 1e-4)
                sharp = np.stack([
                    np.clip(sr * ratio, 0, 1),
                    np.clip(sg * ratio, 0, 1),
                    np.clip(sb * ratio, 0, 1),
                ], axis=-1)
                out = np.rint(np.clip(sharp, 0, 1) ** 0.95 * 255).astype(np.uint8)
                psharp = pack / f"{base}_RGB_pansharpened15m.png"
                Image.fromarray(out, mode="RGB").save(psharp, optimize=True)
                ppan = pack / f"{base}_PAN15m.png"
                gray_to_png(pan, ppan)
                save_geotiff([pan], pack / f"{base}_PAN15m.tif", 15.0, ["panchromatic"])
                files += [psharp.name, ppan.name, f"{base}_PAN15m.tif"]
            except Exception as exc:
                record["pan_error"] = repr(exc)
        record.update(
            status="ok",
            date=date,
            platform=sensor,
            item_id=chosen.id,
            cloud_cover_percent=cloud(chosen),
            local_valid_coverage_fraction=round(chosen_vf, 6),
            files=files,
        )
        manifest["years"].append(record)
    write_manifest(pack, manifest)
    zip_path = ROOT / "USGS_Landsat_2km_53.594070_19.000151.zip"
    zip_dir(pack, zip_path)
    return {"zip": zip_path.name, "manifest": manifest}


def build_sentinel2() -> dict:
    pack = ROOT / "ESA_Copernicus_Sentinel2"
    shutil.rmtree(pack, ignore_errors=True)
    pack.mkdir(parents=True)
    manifest = {
        "source": "ESA/Copernicus Sentinel-2, discovered through Element84 Earth Search public STAC",
        "coordinate": {"lat": LAT, "lon": LON},
        "crop": "2 km x 2 km centered exactly on coordinate",
        "years": [],
        "notes": "True-color RGB, native 10 m visible bands where available. 2015 is searched only after Sentinel-2A entered service.",
    }
    cat = earth_catalog()
    collection_candidates = ["sentinel-2-l2a", "sentinel-2-l1c"]
    available = {c.id for c in cat.get_collections()}
    for year in [2015, 2020, 2026]:
        record = {"requested_year": year, "status": "not_found"}
        chosen = None
        chosen_source_collection = None
        chosen_vf = 0.0
        for collection in collection_candidates:
            if collection not in available:
                continue
            start = f"{year}-07-01" if year == 2015 else f"{year}-01-01"
            try:
                search = cat.search(
                    collections=[collection],
                    bbox=SEARCH_BBOX,
                    datetime=f"{start}/{year}-12-31",
                    query={"eo:cloud_cover": {"lt": 80}},
                    limit=100,
                )
                items = list(search.items())
            except Exception:
                items = list(cat.search(collections=[collection], bbox=SEARCH_BBOX, datetime=f"{start}/{year}-12-31", limit=100).items())
            for item in rank_items(items, year)[:20]:
                rk = asset_key_by_common_name(item, "red", ["red", "B04", "b04"])
                if not rk:
                    continue
                try:
                    arr = read_asset(item, rk, "earth", 10.0, Resampling.nearest)
                    vf = valid_fraction(arr)
                    print("S2 coverage", year, item.id, collection, vf, flush=True)
                    if vf >= 0.95:
                        chosen, chosen_source_collection, chosen_vf = item, collection, vf
                        break
                except Exception as exc:
                    print("S2 coverage failed", item.id, repr(exc), flush=True)
            if chosen:
                break
        if not chosen:
            manifest["years"].append(record)
            continue
        rkey = asset_key_by_common_name(chosen, "red", ["red", "B04", "b04"])
        gkey = asset_key_by_common_name(chosen, "green", ["green", "B03", "b03"])
        bkey = asset_key_by_common_name(chosen, "blue", ["blue", "B02", "b02"])
        if not all([rkey, gkey, bkey]):
            record.update(status="missing_rgb_assets", item_id=chosen.id, asset_keys=list(chosen.assets))
            manifest["years"].append(record)
            continue
        r = read_asset(chosen, rkey, "earth", 10.0)
        g = read_asset(chosen, gkey, "earth", 10.0)
        b = read_asset(chosen, bkey, "earth", 10.0)
        date = item_date(chosen)
        base = f"{year}_{date}_Sentinel-2_2km"
        png = pack / f"{base}_RGB10m.png"
        tif = pack / f"{base}_RGB10m.tif"
        rgb_to_png([r, g, b], png)
        save_geotiff([r, g, b], tif, 10.0, ["red", "green", "blue"])
        record.update(
            status="ok",
            date=date,
            item_id=chosen.id,
            stac_collection=chosen_source_collection,
            cloud_cover_percent=cloud(chosen),
            local_valid_coverage_fraction=round(chosen_vf, 6),
            files=[png.name, tif.name],
        )
        manifest["years"].append(record)
    write_manifest(pack, manifest)
    zip_path = ROOT / "ESA_Copernicus_Sentinel2_2km_53.594070_19.000151.zip"
    zip_dir(pack, zip_path)
    return {"zip": zip_path.name, "manifest": manifest}


def build_aster() -> dict:
    pack = ROOT / "NASA_Terra_ASTER"
    shutil.rmtree(pack, ignore_errors=True)
    pack.mkdir(parents=True)
    cid = find_pc_collection(["aster", "l1t"], ["aster-l1t"])
    manifest = {
        "source": "NASA Terra ASTER L1T via Microsoft Planetary Computer public STAC",
        "collection": cid,
        "coordinate": {"lat": LAT, "lon": LON},
        "crop": "2 km x 2 km centered exactly on coordinate",
        "years": [],
        "notes": "ASTER VNIR has 15 m spatial resolution but no blue visible band. Included display is standard false-color NIR/Red/Green, useful for water/vegetation boundaries. Planetary Computer ASTER archive covers 2000-2006, so later requested years are recorded as unavailable here rather than fabricated.",
    }
    if not cid:
        manifest["error"] = "ASTER L1T collection not found"
    else:
        for year in YEARS:
            record = {"requested_year": year, "status": "not_available_in_this_archive"}
            if year > 2006:
                manifest["years"].append(record)
                continue
            items = search_pc(cid, year)
            chosen = None
            chosen_vf = 0.0
            for item in rank_items(items, year)[:30]:
                # ASTER VNIR: Band1=green, Band2=red, Band3N=NIR
                gkey = asset_key_by_common_name(item, "green", ["VNIR_Band1", "VNIR-Band1", "B01", "B1"])
                rkey = asset_key_by_common_name(item, "red", ["VNIR_Band2", "VNIR-Band2", "B02", "B2"])
                nkey = asset_key_by_common_name(item, "nir", ["VNIR_Band3N", "VNIR-Band3N", "B3N", "nir08"])
                test_key = rkey or gkey or nkey
                if not test_key:
                    continue
                try:
                    arr = read_asset(item, test_key, "pc", 15.0, Resampling.nearest)
                    vf = valid_fraction(arr)
                    print("ASTER coverage", year, item.id, vf, list(item.assets), flush=True)
                    if vf >= 0.95:
                        chosen, chosen_vf = item, vf
                        break
                except Exception as exc:
                    print("ASTER failed", item.id, repr(exc), flush=True)
            if not chosen:
                record["status"] = "no_full_coverage_scene_found"
                manifest["years"].append(record)
                continue
            gkey = asset_key_by_common_name(chosen, "green", ["VNIR_Band1", "VNIR-Band1", "B01", "B1"])
            rkey = asset_key_by_common_name(chosen, "red", ["VNIR_Band2", "VNIR-Band2", "B02", "B2"])
            nkey = asset_key_by_common_name(chosen, "nir", ["VNIR_Band3N", "VNIR-Band3N", "B3N", "nir08"])
            if not all([gkey, rkey, nkey]):
                record.update(status="missing_vnir_assets", item_id=chosen.id, asset_keys=list(chosen.assets))
                manifest["years"].append(record)
                continue
            green = read_asset(chosen, gkey, "pc", 15.0)
            red = read_asset(chosen, rkey, "pc", 15.0)
            nir = read_asset(chosen, nkey, "pc", 15.0)
            date = item_date(chosen)
            base = f"{year}_{date}_Terra_ASTER_2km"
            png = pack / f"{base}_falsecolor_NIR_R_G_15m.png"
            tif = pack / f"{base}_VNIR15m.tif"
            rgb_to_png([nir, red, green], png)
            save_geotiff([green, red, nir], tif, 15.0, ["VNIR Band1 green", "VNIR Band2 red", "VNIR Band3N near-infrared"])
            record.update(
                status="ok",
                date=date,
                item_id=chosen.id,
                cloud_cover_percent=cloud(chosen),
                local_valid_coverage_fraction=round(chosen_vf, 6),
                files=[png.name, tif.name],
            )
            manifest["years"].append(record)
    write_manifest(pack, manifest)
    zip_path = ROOT / "NASA_Terra_ASTER_2km_53.594070_19.000151.zip"
    zip_dir(pack, zip_path)
    return {"zip": zip_path.name, "manifest": manifest}


def build_alos_palsar() -> dict:
    pack = ROOT / "JAXA_ALOS_PALSAR"
    shutil.rmtree(pack, ignore_errors=True)
    pack.mkdir(parents=True)
    cid = find_pc_collection(["alos", "palsar", "mosaic"], ["alos-palsar-mosaic"])
    manifest = {
        "source": "JAXA ALOS/ALOS-2 PALSAR Annual Mosaic via Microsoft Planetary Computer public STAC",
        "collection": cid,
        "coordinate": {"lat": LAT, "lon": LON},
        "crop": "2 km x 2 km centered exactly on coordinate",
        "years": [],
        "notes": "Radar imagery, not optical photography. Water commonly appears dark in SAR, so this is a valuable independent check of water extent. Output uses real HH/HV mosaic pixels with deterministic logarithmic display scaling.",
    }
    if not cid:
        manifest["error"] = "ALOS PALSAR mosaic collection not found"
    else:
        for year in YEARS:
            record = {"requested_year": year, "status": "not_found"}
            try:
                items = search_pc(cid, year)
            except Exception as exc:
                record["error"] = repr(exc)
                manifest["years"].append(record)
                continue
            chosen = None
            vf = 0.0
            for item in items[:20]:
                hhkey = asset_key_by_common_name(item, "hh", ["hh", "HH"])
                if not hhkey:
                    continue
                try:
                    hh = read_asset(item, hhkey, "pc", 25.0, Resampling.nearest)
                    vf0 = valid_fraction(hh)
                    if vf0 >= 0.95:
                        chosen, vf = item, vf0
                        break
                except Exception as exc:
                    print("ALOS failed", year, item.id, repr(exc), flush=True)
            if not chosen:
                manifest["years"].append(record)
                continue
            hhkey = asset_key_by_common_name(chosen, "hh", ["hh", "HH"])
            hvkey = asset_key_by_common_name(chosen, "hv", ["hv", "HV"])
            hh = read_asset(chosen, hhkey, "pc", 25.0, Resampling.nearest)
            date = item_date(chosen)
            base = f"{year}_{date or year}_JAXA_ALOS_PALSAR_2km"
            pgray = pack / f"{base}_HH25m_radar.png"
            gray_to_png(hh, pgray, log_scale=True)
            files = [pgray.name]
            channels = [hh]
            desc = ["HH"]
            if hvkey:
                hv = read_asset(chosen, hvkey, "pc", 25.0, Resampling.nearest)
                shh = stretch_band(np.where(hh > 0, 10 * np.log10(hh), np.nan), 1, 99)
                shv = stretch_band(np.where(hv > 0, 10 * np.log10(hv), np.nan), 1, 99)
                ratio = np.clip(shh - shv + 0.5, 0, 1)
                rgb = np.stack([shh, shv, ratio], axis=-1)
                prgb = pack / f"{base}_HH_HV_falsecolor25m.png"
                Image.fromarray(np.rint(rgb * 255).astype(np.uint8), mode="RGB").save(prgb, optimize=True)
                files.append(prgb.name)
                channels.append(hv)
                desc.append("HV")
            tif = pack / f"{base}_SAR25m.tif"
            save_geotiff(channels, tif, 25.0, desc)
            files.append(tif.name)
            record.update(
                status="ok",
                date=date,
                item_id=chosen.id,
                local_valid_coverage_fraction=round(vf, 6),
                files=files,
            )
            manifest["years"].append(record)
    write_manifest(pack, manifest)
    zip_path = ROOT / "JAXA_ALOS_PALSAR_2km_53.594070_19.000151.zip"
    zip_dir(pack, zip_path)
    return {"zip": zip_path.name, "manifest": manifest}


def build_all_in_one(results: dict) -> None:
    combined = ROOT / "ALL_SOURCES_README.json"
    combined.write_text(
        json.dumps(
            {
                "generated_utc": datetime.now(timezone.utc).isoformat(),
                "coordinate": {"lat": LAT, "lon": LON},
                "crop": "2 km x 2 km",
                "requested_years": YEARS,
                "packs": results,
                "scientific_integrity": "All image pixels originate from the cited satellite datasets. PNGs use only deterministic stretching/compositing/pansharpening. No generative AI or fabricated imagery is used.",
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    zip_path = ROOT / "ALL_SATELLITES_2km_53.594070_19.000151.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for p in sorted(ROOT.rglob("*")):
            if p.is_file() and p != zip_path and not p.name.endswith(".zip"):
                zf.write(p, p.relative_to(ROOT))


def main():
    results = {}
    builders = [
        ("landsat", build_landsat),
        ("sentinel2", build_sentinel2),
        ("aster", build_aster),
        ("alos_palsar", build_alos_palsar),
    ]
    for name, builder in builders:
        print("\n=== BUILD", name, "===", flush=True)
        try:
            results[name] = builder()
        except Exception as exc:
            print("BUILD FAILED", name, repr(exc), flush=True)
            results[name] = {"error": repr(exc)}
    build_all_in_one(results)
    print("\nGenerated:", flush=True)
    for p in sorted(ROOT.rglob("*")):
        if p.is_file():
            print(p, p.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
