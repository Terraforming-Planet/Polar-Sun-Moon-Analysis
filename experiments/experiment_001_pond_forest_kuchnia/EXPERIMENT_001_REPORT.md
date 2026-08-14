# Experiment 001 — Forest Pond and Lake Kuchnia Water Loss (1990–2026)

## Status

**Active evidence experiment.** This document separates observations from interpretation. The current pond-loss number is a working estimate, not yet a final verified area result.

## Area of interest

- Center: **53.591400, 19.010717**
- Standard imagery crop: **2 km × 2 km**
- Time span: **1990–2026**
- Primary target: forest pond visible in the AOI
- Control/secondary target: Lake Kuchnia

## Evidence question

How much did the open-water surface change between the beginning and end of the 1990–2026 record, and do independent sensors plus spring/autumn seasonal comparisons support the same state transition?

## Observed so far

1. The forest pond shows a strong long-term reduction of the visible open-water signal and appears close to complete disappearance in recent imagery.
2. Earlier imagery can show a materially larger water footprint than recent imagery.
3. The previous three-source forensic audit found concrete generated-package errors. These files are preserved under `errors/do_wyjasnienia/`; they are not silently deleted.
4. The alternate optical package contained exact byte-for-byte duplicate images assigned to 2002, 2012 and 2013. They are excluded from quantitative evidence until replaced.
5. Sentinel-1 RTC provides an independent radar control for 2015–2025, but the small forest pond is frequently low-confidence because 10 m pixels, canopy and wet soil mix the radar signal.

## Working estimate — NOT final

The current image-based working estimate is approximately **2.5 ha (25,000 m²) of lost open-water footprint**, with the pond appearing to have lost **close to 100%** of its earlier open-water signal over roughly 36 years. Some historical scenes visually suggest a larger footprint. This estimate remains provisional until corrected seasonal endpoint segmentation, geometry verification and uncertainty bounds are complete.

## Seasonal design

- Corrected spring set: preferred **May**, fallback **April**, then **June** only when May cannot provide a reliable scene.
- Autumn set: preferred **September**, fallback **October**, then **November** when necessary.
- Every fallback month is explicitly recorded in `manifest.json` and `scene_index.csv`.
- Every image filename begins with the year and acquisition date: `YYYY_YYYY-MM-DD_...`.

## Integrity rules

- Official/public satellite pixels only.
- No generative filling and no AI super-resolution presented as observation.
- Exact cross-year file duplicates are rejected automatically.
- Broken/blank visual patterns are rejected automatically.
- Suspect files remain archived for reproducibility.
- Observation of water loss is separated from any hypothesis about its hydrological cause.

## Current source matrix

| Evidence family | Sensor / mission | Role | Independence note |
|---|---|---|---|
| 1 | USGS/NASA Landsat 5/7/8 | historical optical baseline | primary long record |
| 2 | ESA/Copernicus Sentinel-2 | 10 m optical control from 2015 | independent sensor from Landsat |
| 3 | ESA/Copernicus Sentinel-1 RTC | C-band radar control 2015–2025 | different measurement physics |
| 4 candidate | NASA ASTER / JAXA ALOS / official Roscosmos or CNSA archive | additional independent control where public, legal data can be verified | never substituted with an unverifiable source |

## Build status

- Archived suspect/rejected copies: **18** files/records
- Corrected spring scenes built: **37 / 37**
- Autumn scenes built: **36 / 37**

## Next quantitative gate

The experiment is not closed until the following are produced:

1. verified pond geometry;
2. spring and autumn water masks from original spectral bands;
3. 1990 and 2026 endpoint areas in m² and ha with uncertainty;
4. cross-sensor agreement table;
5. explicit list of rejected years/scenes;
6. final status: supported / not supported / inconclusive.

## Future scope after Evidence 001

After approximately five independently documented evidence sites, a later phase may train/test the L4 model for automated detection of shrinking or disappeared lakes, ponds, rivers and canals, followed by a systematic survey within 100 km of Evidence 001. This is future work, not part of the current conclusion.
