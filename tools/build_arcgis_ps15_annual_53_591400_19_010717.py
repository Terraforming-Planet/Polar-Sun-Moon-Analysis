from __future__ import annotations

import io
import json
import math
import shutil
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import requests
from PIL import Image
from pyproj import Transformer

LAT = 53.591400
LON = 19.010717
YEARS = list(range(2000, 2015))
ROOT = Path('satellite_annual_best_highres') / '53.591400_19.010717'
OLD = ROOT / '2000_2014_Landsat_PS15m'
COMBINED = ROOT / 'annual_2000_2026'
OLD.mkdir(parents=True, exist_ok=True)
COMBINED.mkdir(parents=True, exist_ok=True)

SERVICE = 'https://landsat2.arcgis.com/arcgis/rest/services/Landsat/PS/ImageServer'
QUERY = SERVICE + '/query'
EXPORT = SERVICE + '/exportImage'
S = requests.Session()

utm = Transformer.from_crs('EPSG:4326', 'EPSG:32634', always_xy=True)
cx, cy = utm.transform(LON, LAT)
BBOX_UTM = [cx - 1000, cy - 1000, cx + 1000, cy + 1000]


def epoch_ms(dt: datetime) -> int:
    return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


def request(method, url, **kwargs):
    last = None
    for attempt in range(6):
        r = S.request(method, url, timeout=90, **kwargs)
        last = r
        if r.status_code not in (429, 500, 502, 503, 504):
            return r
        wait = min(20, 2 ** attempt)
        print('retry', r.status_code, url, wait, flush=True)
        time.sleep(wait)
    return last


def query_year(year: int) -> list[dict]:
    start = epoch_ms(datetime(year, 1, 1))
    end = epoch_ms(datetime(year, 12, 31, 23, 59, 59))
    params = {
        'where': 'Category = 1',
        'geometry': f'{LON},{LAT}',
        'geometryType': 'esriGeometryPoint',
        'inSR': '4326',
        'spatialRel': 'esriSpatialRelIntersects',
        'time': f'{start},{end}',
        'outFields': 'OBJECTID,Name,SensorName,AcquisitionDate,CloudCover,Best,Month,DayOfYear,LANDSAT_SCENE_ID,LANDSAT_PRODUCT_ID,dataset_id',
        'returnGeometry': 'false',
        'orderByFields': 'CloudCover ASC, AcquisitionDate ASC',
        'f': 'json',
    }
    r = request('GET', QUERY, params=params)
    r.raise_for_status()
    data = r.json()
    if 'error' in data:
        raise RuntimeError(data['error'])
    return [f.get('attributes', {}) for f in data.get('features', [])]


def clean_cloud(v) -> float:
    try:
        x = float(v)
        return x if x >= 0 else 100.0
    except Exception:
        return 100.0


def date_from_ms(v) -> str:
    try:
        return datetime.fromtimestamp(float(v) / 1000, tz=timezone.utc).date().isoformat()
    except Exception:
        return ''


def sensor_bonus(sensor: str, year: int) -> float:
    s = (sensor or '').upper()
    # Prefer sensors with a genuine native 15 m panchromatic band where possible.
    if year <= 2003 and ('ETM' in s or 'LANDSAT 7' in s or 'LANDSAT_7' in s):
        return -80
    if year >= 2013 and ('OLI' in s or 'LANDSAT 8' in s or 'LANDSAT_8' in s):
        return -80
    return 0


def score_record(a: dict, year: int) -> float:
    cloud = clean_cloud(a.get('CloudCover'))
    month = a.get('Month')
    try:
        month = int(month)
    except Exception:
        month = 7
    season_penalty = 0 if 5 <= month <= 9 else 35 + abs(month - 7) * 4
    day = a.get('DayOfYear')
    try:
        day_dist = abs(int(day) - 196)
    except Exception:
        day_dist = 180
    best = a.get('Best')
    try:
        best_penalty = 0 if int(best) == 0 else 5
    except Exception:
        best_penalty = 0
    return cloud * 10 + season_penalty + day_dist * 0.03 + best_penalty + sensor_bonus(str(a.get('SensorName','')), year)


def export_locked(object_id: int, start_ms: int, end_ms: int) -> bytes:
    mosaic = {
        'mosaicMethod': 'esriMosaicLockRaster',
        'lockRasterIds': [int(object_id)],
        'mosaicOperation': 'MT_FIRST',
    }
    render = {'rasterFunction': 'Pansharpened Natural Color'}
    params = {
        'bbox': ','.join(str(x) for x in BBOX_UTM),
        'bboxSR': '32634',
        'imageSR': '32634',
        'size': '134,134',
        'time': f'{start_ms},{end_ms}',
        'format': 'png32',
        'interpolation': 'RSP_BilinearInterpolation',
        'mosaicRule': json.dumps(mosaic, separators=(',', ':')),
        'renderingRule': json.dumps(render, separators=(',', ':')),
        'f': 'image',
    }
    r = request('GET', EXPORT, params=params)
    r.raise_for_status()
    if 'image' not in r.headers.get('content-type', '').lower():
        raise RuntimeError(f'export did not return image: {r.text[:500]}')
    return r.content


def export_year_mosaic(start_ms: int, end_ms: int) -> bytes:
    # Backup: allow the image service to mosaic best overlapping acquisitions within the year.
    # This can fill SLC-off gaps, but is explicitly marked as a mosaic in metadata.
    render = {'rasterFunction': 'Pansharpened Natural Color'}
    params = {
        'bbox': ','.join(str(x) for x in BBOX_UTM),
        'bboxSR': '32634',
        'imageSR': '32634',
        'size': '134,134',
        'time': f'{start_ms},{end_ms}',
        'format': 'png32',
        'interpolation': 'RSP_BilinearInterpolation',
        'renderingRule': json.dumps(render, separators=(',', ':')),
        'f': 'image',
    }
    r = request('GET', EXPORT, params=params)
    r.raise_for_status()
    if 'image' not in r.headers.get('content-type', '').lower():
        raise RuntimeError(f'mosaic export did not return image: {r.text[:500]}')
    return r.content


def alpha_valid_fraction(content: bytes) -> float:
    im = Image.open(io.BytesIO(content)).convert('RGBA')
    alpha = im.getchannel('A')
    hist = alpha.histogram()
    total = sum(hist)
    visible = total - hist[0]
    return visible / total if total else 0.0


def save_pair(content: bytes, stem: str) -> list[str]:
    native = OLD / f'{stem}_native15m.png'
    display = OLD / f'{stem}_display1024.png'
    native.write_bytes(content)
    im = Image.open(io.BytesIO(content)).convert('RGB')
    im.resize((1024, 1024), Image.Resampling.LANCZOS).save(display, optimize=True)
    return [native.name, display.name]


def zip_folder(src: Path, dest: Path):
    with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(src.rglob('*')):
            if p.is_file() and p != dest:
                z.write(p, p.relative_to(src))


def main():
    shutil.rmtree(OLD, ignore_errors=True)
    OLD.mkdir(parents=True)
    manifest = {
        'center': {'lat': LAT, 'lon': LON},
        'crop': '2 km x 2 km',
        'source': 'Esri ArcGIS Landsat/PS ImageServer using Landsat imagery; pan-sharpened natural color service at 15 m service pixel size',
        'service': SERVICE,
        'integrity': 'Real Landsat imagery. Pan-sharpening is deterministic fusion of Landsat panchromatic and RGB imagery performed by the image service; no generative AI or AI super-resolution.',
        'records': [],
    }
    for y in YEARS:
        print('\nYEAR', y, flush=True)
        rec = {'year': y, 'status': 'not_found'}
        try:
            features = query_year(y)
            print('features', len(features), flush=True)
            for a in features[:10]:
                print('candidate', y, a.get('OBJECTID'), date_from_ms(a.get('AcquisitionDate')), a.get('SensorName'), a.get('CloudCover'), a.get('Month'), a.get('dataset_id'), flush=True)
            if not features:
                manifest['records'].append(rec)
                continue
            ranked = sorted(features, key=lambda a: score_record(a, y))
            chosen = ranked[0]
            start = epoch_ms(datetime(y, 1, 1)); end = epoch_ms(datetime(y, 12, 31, 23, 59, 59))
            content = export_locked(int(chosen['OBJECTID']), start, end)
            vf = alpha_valid_fraction(content)
            method = 'single_scene_locked'
            # SLC-off Landsat-7 scenes can have missing stripes. If too much of the 2 km crop is missing,
            # use the service's annual mosaic as a transparent fallback rather than inventing pixels.
            if vf < 0.97:
                print('locked scene gaps', y, vf, 'trying annual mosaic', flush=True)
                mosaic_content = export_year_mosaic(start, end)
                mvf = alpha_valid_fraction(mosaic_content)
                if mvf > vf:
                    content = mosaic_content
                    vf = mvf
                    method = 'annual_best_mosaic'
            dt = date_from_ms(chosen.get('AcquisitionDate')) or str(y)
            sensor = str(chosen.get('SensorName') or 'Landsat').replace(' ', '-').replace('/', '-')
            files = save_pair(content, f'{y}_{dt}_{sensor}_PS15m_2km')
            rec = {
                'year': y,
                'status': 'ok',
                'reference_scene_date': dt,
                'sensor': chosen.get('SensorName'),
                'object_id': chosen.get('OBJECTID'),
                'cloud_cover_percent': chosen.get('CloudCover'),
                'scene_id': chosen.get('LANDSAT_SCENE_ID'),
                'product_id': chosen.get('LANDSAT_PRODUCT_ID'),
                'dataset_id': chosen.get('dataset_id'),
                'output_valid_fraction': round(vf, 6),
                'selection_method': method,
                'service_pixel_size_m': 15,
                'files': files,
            }
        except Exception as e:
            rec['error'] = repr(e)
            print('FAILED', y, repr(e), flush=True)
        manifest['records'].append(rec)
    (OLD / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    zip_folder(OLD, ROOT / 'LANDSAT_PS15m_2000_2014_2km.zip')

    # Build final mixed series: sharper Landsat PS for 2000-2014 + existing Sentinel-2 10 m for 2015-2026.
    shutil.rmtree(COMBINED, ignore_errors=True)
    COMBINED.mkdir(parents=True)
    for rec in manifest['records']:
        if rec.get('status') == 'ok':
            # use the display copy for convenient comparison; native remains in source ZIP
            src = OLD / rec['files'][1]
            shutil.copy2(src, COMBINED / f"{rec['year']}_{src.name}")
    old_s2 = Path('satellite_annual_best/53.591400_19.010717/images')
    for y in range(2015, 2027):
        matches = sorted(old_s2.glob(f'{y}_*_10m_2km_display1024.png'))
        if matches:
            shutil.copy2(matches[0], COMBINED / matches[0].name)
    combined_manifest = {
        'center': {'lat': LAT, 'lon': LON},
        'crop': '2 km x 2 km',
        'policy': '2000-2014 Landsat pan-sharpened 15 m service output where available; 2015-2026 Sentinel-2 L2A 10 m from the previously generated cloud-screened annual series.',
        'integrity': 'No generative AI or AI super-resolution.',
        'landsat_manifest': '../2000_2014_Landsat_PS15m/manifest.json',
    }
    (COMBINED / 'README.json').write_text(json.dumps(combined_manifest, indent=2), encoding='utf-8')
    zip_folder(COMBINED, ROOT / 'ANNUAL_BEST_HIGHRES_2000_2026_2km.zip')

    for p in sorted(ROOT.rglob('*')):
        if p.is_file(): print(p, p.stat().st_size, flush=True)

if __name__ == '__main__':
    main()
