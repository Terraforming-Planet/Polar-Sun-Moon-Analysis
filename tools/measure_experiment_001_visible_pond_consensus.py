from __future__ import annotations

import csv
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

EXP = Path('experiments/experiment_001_pond_forest_kuchnia')
PRIMARY = Path('satellite_may_1990_2026/53.591400_19.010717/images')
OUT = EXP / 'measurements_visible_pond_consensus'
MASKS = OUT / 'masks'
OUT.mkdir(parents=True, exist_ok=True)
MASKS.mkdir(parents=True, exist_ok=True)

# Image-first geometry established on 2026-08-14 from the fixed 2 km crops.
# Full 1024-px image window containing the forest pond basin.
CROP_BOX = (40, 200, 280, 440)  # x0,y0,x1,y1; 240x240 display pixels
WORK_SIZE = 360
GRABCUT_RECT = (82, 75, 190, 205)
SEED_X = 168
SEED_Y = 180

# Chosen because they are clear/usable older scenes and the target shape is visually
# repeatable.  The mask is not derived from a single year.
HISTORICAL_CONSENSUS_YEARS = [1998, 1999, 2000, 2004, 2005, 2006, 2008]
ENDPOINT_YEAR = 1990
RECENT_YEAR = 2026

METERS_PER_FULL_DISPLAY_PIXEL = 2000.0 / 1024.0
METERS_PER_WORK_PIXEL = METERS_PER_FULL_DISPLAY_PIXEL * ((CROP_BOX[2] - CROP_BOX[0]) / WORK_SIZE)
PIXEL_AREA_M2 = METERS_PER_WORK_PIXEL ** 2


def display_path(year: int) -> Path:
    matches = sorted(PRIMARY.glob(f'{year}_*_display1024.png'))
    if len(matches) != 1:
        raise RuntimeError(f'Expected exactly one primary display image for {year}, got {matches}')
    return matches[0]


def crop_image(year: int) -> np.ndarray:
    im = Image.open(display_path(year)).convert('RGB')
    crop = im.crop(CROP_BOX).resize((WORK_SIZE, WORK_SIZE), Image.Resampling.LANCZOS)
    return np.asarray(crop)


def grabcut_target(year: int) -> np.ndarray:
    rgb = crop_image(year)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    mask = np.zeros(rgb.shape[:2], np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, mask, GRABCUT_RECT, bgd, fgd, 4, cv2.GC_INIT_WITH_RECT)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
    labels, count = ndimage.label(fg, structure=np.ones((3, 3), np.uint8))
    lab = int(labels[SEED_Y, SEED_X])
    if lab == 0:
        coords = np.argwhere(fg)
        if coords.size == 0:
            raise RuntimeError(f'No foreground candidate for {year}')
        d2 = (coords[:, 0] - SEED_Y) ** 2 + (coords[:, 1] - SEED_X) ** 2
        yy, xx = coords[int(np.argmin(d2))]
        lab = int(labels[yy, xx])
    return labels == lab


def component_at_seed(mask: np.ndarray) -> np.ndarray:
    labels, _ = ndimage.label(mask, structure=np.ones((3, 3), np.uint8))
    lab = int(labels[SEED_Y, SEED_X])
    return labels == lab if lab else np.zeros_like(mask, dtype=bool)


def area(mask: np.ndarray) -> float:
    return float(mask.sum() * PIXEL_AREA_M2)


def overlay(year: int, mask: np.ndarray, name: str) -> str:
    rgb = crop_image(year).copy()
    edge = ndimage.binary_dilation(mask) ^ ndimage.binary_erosion(mask)
    tinted = rgb.astype(np.float32)
    tinted[mask] = 0.70 * tinted[mask] + 0.30 * np.array([255, 0, 0], dtype=np.float32)
    tinted = np.clip(tinted, 0, 255).astype(np.uint8)
    tinted[edge] = [255, 0, 0]
    im = Image.fromarray(tinted).resize((720, 720), Image.Resampling.NEAREST)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 719, 45), fill='white')
    d.text((8, 12), f'{year} | red = historical multi-year consensus footprint', fill='black')
    path = OUT / f'{year}_{name}.png'
    im.save(path, optimize=True)
    return str(path)


def main() -> None:
    masks = {y: grabcut_target(y) for y in HISTORICAL_CONSENSUS_YEARS}
    stack = np.stack([masks[y] for y in HISTORICAL_CONSENSUS_YEARS], axis=0)
    mask90 = grabcut_target(ENDPOINT_YEAR)

    support_rows = []
    consensus_masks = {}
    for min_years in (1, 2, 3, 4, 5):
        supported = component_at_seed(stack.sum(axis=0) >= min_years)
        consensus_masks[min_years] = supported
        overlap90 = supported & mask90
        support_rows.append({
            'minimum_support_years': min_years,
            'historical_consensus_area_m2': round(area(supported), 1),
            'historical_consensus_area_ha': round(area(supported) / 10000.0, 4),
            '1990_dark_component_overlap_m2': round(area(overlap90), 1),
            '1990_overlap_fraction_of_consensus': round(float(overlap90.sum() / max(supported.sum(), 1)), 5),
        })

    # Central choice: present in >=4 of 7 independent historical annual images.
    central = consensus_masks[4]
    lower = consensus_masks[5]
    upper = consensus_masks[2]
    broad_upper = consensus_masks[1]

    individual = []
    for y in HISTORICAL_CONSENSUS_YEARS:
        individual.append({'year': y, 'visible_component_area_m2': round(area(masks[y]), 1), 'visible_component_area_ha': round(area(masks[y]) / 10000.0, 4)})

    # Modern 2026 visual state is deliberately not segmented by the same GrabCut method:
    # GrabCut follows the exposed basin/clearing after drying and would incorrectly call
    # bare soil/vegetation "water".  Instead the old footprint is overlaid on 2026 to
    # demonstrate the state transition. Spectral diagnostics separately show strongly
    # non-water-like NDWI/MNDWI at the corrected pond seed in both May and August 2026.
    overlay_2000 = overlay(2000, central, 'historical_consensus_overlay')
    overlay_2026 = overlay(2026, central, 'historical_consensus_on_recent_basin')

    result = {
        'experiment_id': '001',
        'method': 'Image-first visible-footprint multi-year consensus using deterministic GrabCut on the same fixed geographic crop; not a spectral water classifier.',
        'source_images': 'Primary real Landsat/Sentinel display crops; no generative filling or AI super-resolution.',
        'geometry': {
            'full_display_size_px': 1024,
            'full_crop_ground_size_m': 2000,
            'pond_crop_box_full_display_px': list(CROP_BOX),
            'work_size_px': WORK_SIZE,
            'meters_per_work_pixel': METERS_PER_WORK_PIXEL,
            'corrected_pond_seed_approx': {'lat': 53.594595, 'lon': 19.000140},
        },
        'historical_consensus_years': HISTORICAL_CONSENSUS_YEARS,
        'individual_historical_visible_components': individual,
        'support_sensitivity': support_rows,
        'recommended_working_measurement': {
            'persistent_historical_visible_footprint_m2': round(area(central), 1),
            'persistent_historical_visible_footprint_ha': round(area(central) / 10000.0, 4),
            'conservative_lower_m2': round(area(lower), 1),
            'repeat_supported_upper_m2': round(area(upper), 1),
            'broad_union_upper_m2': round(area(broad_upper), 1),
            '1990_overlap_with_central_consensus_m2': round(area(mask90 & central), 1),
            '1990_overlap_fraction': round(float((mask90 & central).sum() / max(central.sum(), 1)), 5),
            '2026_open_water_area_m2': None,
            '2026_state': 'No comparable persistent dark-water footprint visible; May/August 2026 spectral seed diagnostics are strongly non-water-like. Exact residual open-water area remains manual/spectral-review gated.',
            'loss_percent_status': 'near-total state transition supported visually; exact percentage remains uncertainty-gated',
        },
        'interpretation': {
            'old_2_5ha_statement': 'Retained as the earlier user/visual working estimate and possible broad upper estimate, but not the central quantitative result.',
            'current_central_result': 'The repeatable historical footprint is closer to ~1.7 ha. A defensible historical range from repeated images is ~1.56–2.04 ha; the one-year/union envelope extends to ~2.37 ha.',
            'precision_warning': 'Historical Landsat multispectral detail is ~30 m. Sub-pixel display segmentation is used only to stabilize a multi-year footprint; uncertainty must be reported at hectare-scale, not to individual square metres.',
        },
        'overlays': [overlay_2000, overlay_2026],
    }

    (OUT / 'visible_pond_consensus_measurement.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')

    with (OUT / 'historical_consensus_sensitivity.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(support_rows[0]))
        writer.writeheader(); writer.writerows(support_rows)

    readme = f'''# Experiment 001 — forest pond visible-footprint consensus

This measurement was added because a fixed NDWI/MNDWI threshold failed sanity checks across different sensors/seasons. The method uses **the same geographic crop and the same visible pond feature across multiple clear historical years**, then asks which footprint repeats.

## Central result

- persistent historical footprint (present in >=4 of 7 selected clear older images): **{area(central):.0f} m² = {area(central)/10000:.2f} ha**
- conservative footprint (>=5 of 7): **{area(lower):.0f} m² = {area(lower)/10000:.2f} ha**
- repeat-supported upper footprint (>=2 of 7): **{area(upper):.0f} m² = {area(upper)/10000:.2f} ha**
- broad union envelope (>=1 of 7): **{area(broad_upper):.0f} m² = {area(broad_upper)/10000:.2f} ha**
- 1990 overlap with central persistent footprint: **{area(mask90 & central):.0f} m²** ({(mask90 & central).sum()/max(central.sum(),1)*100:.1f}% of central footprint)

## Interpretation

The earlier ~2.5 ha statement remains documented as a **provisional visual/upper estimate**, but the repeatable multi-year image evidence currently supports a central historical footprint closer to **~1.7 ha**, with a defensible repeated-image range of roughly **1.56–2.04 ha**. A broader envelope can approach **~2.37 ha**.

The 2026 image shows the historical footprint occupied by a visually changed/drier basin rather than the same dark water feature. Exact residual open-water m² is **not forced** by this method; the recent state is cross-checked separately with Sentinel-2 spectral diagnostics.

Because the older scenes are Landsat-class data, these values must be treated as **area-scale estimates with uncertainty**, not metre-perfect shoreline surveys.
'''
    (OUT / 'README.md').write_text(readme, encoding='utf-8')

    print('CENTRAL_M2', round(area(central), 1))
    print('LOWER_M2', round(area(lower), 1))
    print('UPPER_REPEAT_M2', round(area(upper), 1))
    print('BROAD_UNION_M2', round(area(broad_upper), 1))
    print('OVERLAP_1990_M2', round(area(mask90 & central), 1))


if __name__ == '__main__':
    main()
