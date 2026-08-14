# Experiment 001 — pond geometry correction (2026-08-14)

## Why this correction exists

Before final spectral measurement, the fixed 2 km imagery was re-inspected **from the pixels**, not from labels. A previous provisional pond seed was found to be too far east, close to the west side of Lake Kuchnia, and therefore was not acceptable for final measurement.

## Image-first identification

In the fixed 1024 px display crops, the disappearing forest pond is consistently visible around approximately:

- display x ≈ **160 px**
- display y ≈ **320 px**

in older clear scenes such as 1990, 1998, 2000, 2004, 2005 and 2008.

The fixed crop represents 2000 m × 2000 m, so this places the basin about:

- **690 m west** of the AOI center;
- **375 m north** of the AOI center.

Approximate seed coordinate derived only for measurement initialization:

- latitude ≈ **53.59459**
- longitude ≈ **19.00014** (approximate; final polygon is more important than a single point)

This seed is intentionally documented as an image-derived measurement aid rather than a cadastral or hydrological boundary.

## Visual behavior

Older imagery shows a distinct dark, L/curved open-water feature at this location. In recent higher-resolution imagery the same basin is visible as a changed/drier land feature with little or no comparable persistent dark open-water footprint.

This is the feature referred to as the **forest pond** in Experiment 001.

## Measurement rule after correction

The common-grid spectral script `tools/measure_experiment_001_seasonal_water_v2.py` uses the corrected western/northern seed and a constrained local ROI.

The older provisional seed is explicitly rejected. Final area remains preliminary until the polygon/basin boundary is manually verified against several independent years.
