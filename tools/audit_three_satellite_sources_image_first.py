from __future__ import annotations

import csv
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

CENTER = (53.591400, 19.010717)
ROOT1 = Path('satellite_may_1990_2026/53.591400_19.010717')
ROOT2 = Path('satellite_alternate_source_may_1990_2025/53.591400_19.010717')
ROOT3 = Path('satellite_third_source_sentinel1_rtc_may_2015_2025/53.591400_19.010717')
OUT = Path('satellite_three_source_forensic_audit/53.591400_19.010717')
OUT.mkdir(parents=True, exist_ok=True)


def load_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding='utf-8'))


def native_optical_path(root: Path, rec: dict) -> Path:
    files = rec.get('files', [])
    if isinstance(files, dict):
        vals = list(files.values())
    else:
        vals = list(files)
    cand = [v for v in vals if 'native' in str(v).lower() and str(v).lower().endswith(('.png', '.jpg', '.jpeg'))]
    if not cand:
        raise FileNotFoundError(f'No native image in record {rec.get("year")}')
    rel = Path(cand[0])
    p = root / rel
    if p.exists():
        return p
    p2 = root / 'images' / rel.name
    if p2.exists():
        return p2
    raise FileNotFoundError(str(p))


def robust_gray(img: Image.Image, size: int = 256) -> np.ndarray:
    a = np.asarray(img.convert('L').resize((size, size), Image.Resampling.BILINEAR), dtype=np.float32)
    lo, hi = np.percentile(a, [2, 98])
    if hi <= lo + 1e-6:
        return np.zeros_like(a)
    return np.clip((a - lo) / (hi - lo), 0, 1)


def rgb_small(img: Image.Image, size: int = 256) -> np.ndarray:
    return np.asarray(img.convert('RGB').resize((size, size), Image.Resampling.BILINEAR), dtype=np.uint8)


def edge_map(g: np.ndarray) -> np.ndarray:
    gx = np.zeros_like(g); gy = np.zeros_like(g)
    gx[:, 1:-1] = (g[:, 2:] - g[:, :-2]) * 0.5
    gy[1:-1, :] = (g[2:, :] - g[:-2, :]) * 0.5
    e = np.hypot(gx, gy)
    p = np.percentile(e, 95)
    if p > 1e-8:
        e = np.clip(e / p, 0, 1)
    return e


def corr(a: np.ndarray, b: np.ndarray) -> float:
    aa = a.astype(np.float64).ravel(); bb = b.astype(np.float64).ravel()
    aa -= aa.mean(); bb -= bb.mean()
    den = float(np.sqrt(np.dot(aa, aa) * np.dot(bb, bb)))
    return float(np.dot(aa, bb) / den) if den > 1e-12 else 0.0


def phase_shift(a: np.ndarray, b: np.ndarray) -> tuple[int, int]:
    fa = np.fft.fft2(a); fb = np.fft.fft2(b)
    cps = fa * np.conj(fb)
    cps /= np.maximum(np.abs(cps), 1e-12)
    c = np.abs(np.fft.ifft2(cps))
    y, x = np.unravel_index(np.argmax(c), c.shape)
    h, w = a.shape
    if y > h // 2: y -= h
    if x > w // 2: x -= w
    return int(y), int(x)


def aligned_corr(a: np.ndarray, b: np.ndarray, max_shift: int = 24) -> dict:
    ea, eb = edge_map(a), edge_map(b)
    dy, dx = phase_shift(ea, eb)
    if abs(dy) > max_shift or abs(dx) > max_shift:
        dy = dx = 0
    br = np.roll(b, shift=(dy, dx), axis=(0, 1))
    ebr = np.roll(eb, shift=(dy, dx), axis=(0, 1))
    m = max(abs(dy), abs(dx), 6) + 2
    sl = np.s_[m:-m, m:-m] if m < a.shape[0] // 3 else np.s_[:, :]
    return {'shift_y_px_256': dy, 'shift_x_px_256': dx, 'gray_corr': corr(a[sl], br[sl]), 'edge_corr': corr(ea[sl], ebr[sl])}


def transforms(g: np.ndarray) -> dict[str, np.ndarray]:
    return {
        'normal': g,
        'flip_lr': np.fliplr(g),
        'flip_ud': np.flipud(g),
        'rot180': np.rot90(g, 2),
    }


def compare_images(pa: Path, pb: Path) -> dict:
    ia, ib = Image.open(pa), Image.open(pb)
    ga, gb = robust_gray(ia), robust_gray(ib)
    scores = {name: aligned_corr(ga, tg) for name, tg in transforms(gb).items()}
    best_name = max(scores, key=lambda k: scores[k]['edge_corr'])
    normal = scores['normal']
    best = scores[best_name]
    return {
        'a': str(pa), 'b': str(pb), 'best_transform': best_name,
        'normal': normal, 'best': best,
        'orientation_suspicious': best_name != 'normal' and best['edge_corr'] > normal['edge_corr'] + 0.08,
    }


def dhash(img: Image.Image, n: int = 16) -> str:
    g = np.asarray(img.convert('L').resize((n + 1, n), Image.Resampling.BILINEAR), dtype=np.int16)
    bits = g[:, 1:] > g[:, :-1]
    packed = np.packbits(bits.ravel())
    return packed.tobytes().hex()


def ham_hex(a: str, b: str) -> int:
    return (int(a, 16) ^ int(b, 16)).bit_count()


def image_metrics(path: Path) -> dict:
    data = path.read_bytes()
    im = Image.open(path).convert('RGB')
    rgb = rgb_small(im)
    g = robust_gray(im)
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = mx.astype(np.int16) - mn.astype(np.int16)
    bright_neutral = (mx > 225) & (mn > 190) & (sat < 28)
    near_black = mx < 8
    near_white = mn > 247
    row_dark = (near_black.mean(axis=1) > 0.55).mean()
    col_dark = (near_black.mean(axis=0) > 0.55).mean()
    return {
        'path': str(path), 'width': im.width, 'height': im.height,
        'sha256_file': hashlib.sha256(data).hexdigest(),
        'dhash256': dhash(im),
        'gray_std': float(g.std()),
        'edge_mean': float(edge_map(g).mean()),
        'visual_bright_neutral_fraction': float(bright_neutral.mean()),
        'visual_near_black_fraction': float(near_black.mean()),
        'visual_near_white_fraction': float(near_white.mean()),
        'dark_row_fraction': float(row_dark), 'dark_col_fraction': float(col_dark),
        'blank_or_broken_visual': bool(g.std() < 0.025 or row_dark > 0.12 or col_dark > 0.12),
    }


def year_map(manifest: dict) -> dict[int, dict]:
    return {int(r['year']): r for r in manifest.get('records', []) if r.get('status') == 'ok'}


def landsat_pathrow(rec: dict) -> str | None:
    for key in ('item_id', 'catalog_item_id', 'gcs_product_id'):
        s = str(rec.get(key, ''))
        parts = s.split('_')
        for part in parts:
            if len(part) == 6 and part.isdigit():
                return part
    return None


def optical_meta(rec: dict) -> dict:
    return {
        'year': int(rec['year']), 'date': rec.get('date'), 'platform': rec.get('platform'),
        'item_id': rec.get('item_id') or rec.get('catalog_item_id'),
        'pathrow': landsat_pathrow(rec),
        'scene_cloud_cover_percent': rec.get('scene_cloud_cover_percent'),
        'local_clear_fraction': rec.get('local_clear_fraction'),
        'local_valid_fraction': rec.get('local_valid_fraction'),
        'native_resolution_m': rec.get('native_resolution_m'),
    }


def same_year_pair_audit(y: int, r1: dict, r2: dict, p1: Path, p2: Path) -> dict:
    c = compare_images(p1, p2)
    same_date = r1.get('date') == r2.get('date')
    same_platform = str(r1.get('platform')).lower() == str(r2.get('platform')).lower()
    pr1, pr2 = landsat_pathrow(r1), landsat_pathrow(r2)
    return {
        'year': y,
        'source1': optical_meta(r1), 'source2': optical_meta(r2),
        'same_acquisition_date': same_date, 'same_platform': same_platform,
        'same_pathrow': (pr1 == pr2) if (pr1 and pr2) else None,
        'pathrow_discrepancy': bool(same_date and same_platform and pr1 and pr2 and pr1 != pr2),
        'image_registration': c,
        'same_scene_delivery_not_independent_observation': bool(same_date and same_platform and (pr1 == pr2 or pr1 is None or pr2 is None)),
        'image_content_agrees': bool(c['normal']['edge_corr'] >= 0.35 and not c['orientation_suspicious']),
    }


def duplicate_scan(year_paths: dict[int, Path]) -> list[dict]:
    metrics = {y: image_metrics(p) for y, p in year_paths.items()}
    years = sorted(metrics)
    out = []
    for i, y1 in enumerate(years):
        for y2 in years[i+1:]:
            m1, m2 = metrics[y1], metrics[y2]
            if m1['sha256_file'] == m2['sha256_file']:
                out.append({'year1': y1, 'year2': y2, 'severity': 'FAIL', 'reason': 'exact_file_duplicate'})
                continue
            hd = ham_hex(m1['dhash256'], m2['dhash256'])
            if hd <= 3:
                c = compare_images(year_paths[y1], year_paths[y2])
                if c['normal']['gray_corr'] > 0.997 and c['normal']['edge_corr'] > 0.98:
                    out.append({'year1': y1, 'year2': y2, 'severity': 'FAIL', 'reason': 'near_exact_visual_duplicate_different_year', 'dhash_distance': hd, 'comparison': c})
    return out


def cyan_lake_mask(overlay_path: Path, size: int = 200) -> np.ndarray:
    rgb = np.asarray(Image.open(overlay_path).convert('RGB').resize((size, size), Image.Resampling.NEAREST))
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r < 110) & (g > 125) & (b > 145) & (b > r + 55)


def lake_contrast(optical_path: Path, lake_mask: np.ndarray) -> dict:
    im = Image.open(optical_path).convert('RGB').resize((200, 200), Image.Resampling.BILINEAR)
    a = np.asarray(im, dtype=np.float32) / 255.0
    gray = a.mean(axis=2)
    # ring around lake bbox, excluding lake itself; fixed geographical neighborhood
    ys, xs = np.where(lake_mask)
    if len(xs) < 20:
        return {'status': 'mask_missing'}
    y0, y1, x0, x1 = max(0, ys.min()-12), min(200, ys.max()+13), max(0, xs.min()-12), min(200, xs.max()+13)
    ring = np.zeros_like(lake_mask)
    ring[y0:y1, x0:x1] = True
    ring &= ~lake_mask
    inside = gray[lake_mask]; outside = gray[ring]
    return {
        'status': 'ok', 'lake_mask_pixels': int(lake_mask.sum()),
        'median_optical_brightness_inside_radar_lake': float(np.median(inside)),
        'median_brightness_local_ring': float(np.median(outside)),
        'water_darkness_contrast': float(np.median(outside) - np.median(inside)),
        'same_geographic_lake_visually_supported': bool(np.median(outside) - np.median(inside) > 0.025),
    }


def source3_audit(m3: dict, y3: dict[int, dict]) -> dict:
    date_checks = []
    paths = {}
    for y, r in sorted(y3.items()):
        acq_dates = [a.get('date') for a in r.get('acquisitions', [])]
        ids = [a.get('id', '') for a in r.get('acquisitions', [])]
        all_may = all(str(d).startswith(f'{y}-05-') for d in acq_dates)
        id_dates_match = all(str(d).replace('-', '') in str(i) for d, i in zip(acq_dates, ids))
        min_d = min(acq_dates) if acq_dates else None; max_d = max(acq_dates) if acq_dates else None
        date_checks.append({
            'year': y, 'date_start': r.get('date_start'), 'date_end': r.get('date_end'),
            'acquisition_dates': acq_dates, 'all_acquisitions_are_may_of_year': all_may,
            'acquisition_id_contains_same_date': id_dates_match,
            'range_matches_acquisitions': r.get('date_start') == min_d and r.get('date_end') == max_d,
            'orbit_state': r.get('orbit_state'), 'relative_orbit': r.get('relative_orbit'),
            'acquisitions_used': r.get('acquisitions_used'),
            'date_semantics': 'monthly_median_composite_not_single_day',
        })
        paths[y] = ROOT3 / r['files']['vv_native']
    return {'date_checks': date_checks, 'different_year_duplicate_scan': duplicate_scan(paths)}


def make_suspicious_sheet(rows: list[dict], p1s: dict[int, Path], p2s: dict[int, Path], y3: dict[int, dict]) -> None:
    years = sorted(set([1993, 1995, 1996, 1997] + [y for y in range(2015, 2026) if y in p1s and y in p2s]))
    thumb = 280; label_h = 62; cols = 3
    cells = []
    for y in years:
        imgs = []
        for label, p in [('S1 optical', p1s.get(y)), ('S2 optical', p2s.get(y))]:
            if p and p.exists():
                im = Image.open(p).convert('RGB').resize((thumb, thumb), Image.Resampling.NEAREST)
            else:
                im = Image.new('RGB', (thumb, thumb), 'gray')
            c = Image.new('RGB', (thumb, thumb + label_h), 'white'); c.paste(im, (0, 0))
            d = ImageDraw.Draw(c); d.text((5, thumb+5), f'{y} {label}', fill='black')
            cells.append(c)
        if y in y3:
            p = ROOT3 / y3[y]['files']['water_overlay_refined_native']
            im = Image.open(p).convert('RGB').resize((thumb, thumb), Image.Resampling.NEAREST)
            c = Image.new('RGB', (thumb, thumb + label_h), 'white'); c.paste(im, (0, 0))
            d = ImageDraw.Draw(c); d.text((5, thumb+5), f'{y} S3 radar composite', fill='black')
            cells.append(c)
        else:
            c = Image.new('RGB', (thumb, thumb + label_h), 'white'); ImageDraw.Draw(c).text((5, thumb+5), f'{y} S3 n/a', fill='black'); cells.append(c)
    rows_n = math.ceil(len(cells)/cols)
    sheet = Image.new('RGB', (cols*thumb, rows_n*(thumb+label_h)), 'white')
    for i,c in enumerate(cells): sheet.paste(c, ((i%cols)*thumb, (i//cols)*(thumb+label_h)))
    sheet.save(OUT/'SUSPICIOUS_AND_OVERLAP_IMAGE_FIRST_CONTACT_SHEET.jpg', quality=92)


def main() -> None:
    m1, m2, m3 = load_json(ROOT1/'manifest.json'), load_json(ROOT2/'manifest.json'), load_json(ROOT3/'manifest.json')
    y1, y2, y3 = year_map(m1), year_map(m2), year_map(m3)
    p1s = {y: native_optical_path(ROOT1, r) for y, r in y1.items()}
    p2s = {y: native_optical_path(ROOT2, r) for y, r in y2.items()}

    metrics1 = {y: image_metrics(p) for y,p in p1s.items()}
    metrics2 = {y: image_metrics(p) for y,p in p2s.items()}
    pair = [same_year_pair_audit(y, y1[y], y2[y], p1s[y], p2s[y]) for y in sorted(set(y1)&set(y2))]

    # Cross-modality image-first check: does the radar lake footprint fall on a dark optical water feature?
    overlap = []
    for y in sorted(set(y3) & set(y1) & set(y2)):
        mask = cyan_lake_mask(ROOT3 / y3[y]['files']['water_overlay_refined_native'])
        overlap.append({'year': y, 'source1_vs_radar_lake': lake_contrast(p1s[y], mask), 'source2_vs_radar_lake': lake_contrast(p2s[y], mask)})

    # Explicit image-first quality flags; metadata is only attached AFTER visual metrics.
    qflags = []
    for src, ym, recs in [('source1', metrics1, y1), ('source2', metrics2, y2)]:
        for y,m in sorted(ym.items()):
            flags=[]
            if m['blank_or_broken_visual']: flags.append('blank_or_broken_visual_pattern')
            if m['visual_bright_neutral_fraction'] > 0.38: flags.append('large_bright_neutral_visual_fraction_possible_cloud')
            # only after image evidence, attach QA disagreement for review
            lc = recs[y].get('local_clear_fraction')
            if lc is not None and float(lc) < 0.5: flags.append('provider_QA_local_clear_below_0.5')
            if flags: qflags.append({'source':src,'year':y,'flags':flags,'visual_metrics':m,'metadata':optical_meta(recs[y])})

    # Same-date same-platform pairs are delivery-path checks, not independent observations.
    same_obs = [r['year'] for r in pair if r['same_scene_delivery_not_independent_observation']]
    pathrow_disc = [r for r in pair if r['pathrow_discrepancy']]
    weak_pair = [r for r in pair if not r['image_content_agrees']]
    orient = [r for r in pair if r['image_registration']['orientation_suspicious']]
    radar = source3_audit(m3, y3)

    report = {
        'audit_type': 'image-first forensic cross-source audit; metadata/date checks performed after pixel-content checks',
        'center': {'lat': CENTER[0], 'lon': CENTER[1]}, 'crop': '2 km x 2 km',
        'sources': {
            'source1': {'root': str(ROOT1), 'years': [min(y1),max(y1)], 'count':len(y1)},
            'source2': {'root': str(ROOT2), 'years': [min(y2),max(y2)], 'count':len(y2)},
            'source3': {'root': str(ROOT3), 'years': [min(y3),max(y3)], 'count':len(y3), 'semantics':'Sentinel-1 RTC monthly median composites, not single-day snapshots'},
        },
        'image_metrics_source1': metrics1, 'image_metrics_source2': metrics2,
        'source1_vs_source2_same_year': pair,
        'different_year_duplicate_scan_source1': duplicate_scan(p1s),
        'different_year_duplicate_scan_source2': duplicate_scan(p2s),
        'source3': radar,
        'optical_vs_radar_lake_image_check': overlap,
        'quality_flags_image_first': qflags,
        'summary': {
            'same_observation_years_source1_source2': same_obs,
            'same_observation_count': len(same_obs),
            'pathrow_discrepancies': [{'year':r['year'],'source1_pathrow':r['source1']['pathrow'],'source2_pathrow':r['source2']['pathrow']} for r in pathrow_disc],
            'weak_image_registration_years': [r['year'] for r in weak_pair],
            'orientation_suspicious_years': [r['year'] for r in orient],
            'exact_or_near_duplicate_different_year_source1': duplicate_scan(p1s),
            'exact_or_near_duplicate_different_year_source2': duplicate_scan(p2s),
            'exact_or_near_duplicate_different_year_source3': radar['different_year_duplicate_scan'],
            'radar_date_failures': [r for r in radar['date_checks'] if not (r['all_acquisitions_are_may_of_year'] and r['acquisition_id_contains_same_date'] and r['range_matches_acquisitions'])],
            'radar_lake_alignment_failures_source1': [r['year'] for r in overlap if not r['source1_vs_radar_lake'].get('same_geographic_lake_visually_supported',False)],
            'radar_lake_alignment_failures_source2': [r['year'] for r in overlap if not r['source2_vs_radar_lake'].get('same_geographic_lake_visually_supported',False)],
        },
    }
    (OUT/'three_source_image_first_forensic_audit.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')

    with (OUT/'same_year_optical_crosscheck.csv').open('w', newline='', encoding='utf-8') as f:
        fields=['year','date1','date2','same_date','platform1','platform2','pathrow1','pathrow2','edge_corr','gray_corr','shift_y','shift_x','image_content_agrees','same_observation_not_independent','pathrow_discrepancy']
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader()
        for r in pair:
            n=r['image_registration']['normal']
            w.writerow({'year':r['year'],'date1':r['source1']['date'],'date2':r['source2']['date'],'same_date':r['same_acquisition_date'],'platform1':r['source1']['platform'],'platform2':r['source2']['platform'],'pathrow1':r['source1']['pathrow'],'pathrow2':r['source2']['pathrow'],'edge_corr':n['edge_corr'],'gray_corr':n['gray_corr'],'shift_y':n['shift_y_px_256'],'shift_x':n['shift_x_px_256'],'image_content_agrees':r['image_content_agrees'],'same_observation_not_independent':r['same_scene_delivery_not_independent_observation'],'pathrow_discrepancy':r['pathrow_discrepancy']})

    make_suspicious_sheet(pair,p1s,p2s,y3)

    s=report['summary']
    lines=['# Three-source satellite forensic audit (image-first)','',f'Center: {CENTER[0]:.6f}, {CENTER[1]:.6f}; crop 2x2 km; May.','',
           '## Critical methodology','Pixel/image content was checked first (hashes, cross-year duplicate scan, structural registration, orientation, broken/blank patterns, and optical-vs-radar lake footprint). Dates/scene IDs were evaluated only after those checks. Appearance alone cannot prove an exact calendar day; it can expose reuse, wrong crop/orientation, gross seasonal mismatch, cloud/broken imagery, or contradictions between sources.','',
           '## Machine findings',
           f'- Source1/source2 same observation (same date/platform/path-row): {len(s["same_observation_years_source1_source2"])} years: {s["same_observation_years_source1_source2"]}',
           f'- Path/row discrepancies: {s["pathrow_discrepancies"]}',
           f'- Weak source1/source2 image-registration years: {s["weak_image_registration_years"]}',
           f'- Orientation-suspicious years: {s["orientation_suspicious_years"]}',
           f'- Different-year duplicate flags source1: {s["exact_or_near_duplicate_different_year_source1"]}',
           f'- Different-year duplicate flags source2: {s["exact_or_near_duplicate_different_year_source2"]}',
           f'- Different-year duplicate flags source3: {s["exact_or_near_duplicate_different_year_source3"]}',
           f'- Sentinel-1 acquisition/date integrity failures: {s["radar_date_failures"]}',
           f'- Optical-vs-radar lake footprint failures source1: {s["radar_lake_alignment_failures_source1"]}',
           f'- Optical-vs-radar lake footprint failures source2: {s["radar_lake_alignment_failures_source2"]}',
           '', '## Image-first quality flags']
    for q in qflags:
        lines.append(f'- {q["source"]} {q["year"]}: {q["flags"]}; bright-neutral={q["visual_metrics"]["visual_bright_neutral_fraction"]:.3f}; local_clear(metadata after image check)={q["metadata"]["local_clear_fraction"]}')
    (OUT/'AUDIT_SUMMARY.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')

    print('AUDIT_COMPLETE')
    print('SAME_OBSERVATION_COUNT',len(same_obs))
    print('SAME_OBSERVATION_YEARS',same_obs)
    print('PATHROW_DISCREPANCIES',s['pathrow_discrepancies'])
    print('WEAK_REGISTRATION',s['weak_image_registration_years'])
    print('ORIENTATION_SUSPICIOUS',s['orientation_suspicious_years'])
    print('DUP_SOURCE1',s['exact_or_near_duplicate_different_year_source1'])
    print('DUP_SOURCE2',s['exact_or_near_duplicate_different_year_source2'])
    print('DUP_SOURCE3',s['exact_or_near_duplicate_different_year_source3'])
    print('RADAR_DATE_FAILURES',len(s['radar_date_failures']))
    print('RADAR_LAKE_FAIL_S1',s['radar_lake_alignment_failures_source1'])
    print('RADAR_LAKE_FAIL_S2',s['radar_lake_alignment_failures_source2'])
    print('QUALITY_FLAGS',[(q['source'],q['year'],q['flags']) for q in qflags])

if __name__ == '__main__':
    main()
