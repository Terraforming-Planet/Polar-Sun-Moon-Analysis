# Experiment 001 — Forest Pond and Lake Kuchnia Water Loss (1990–2026)

## Purpose

This is the first formal evidence experiment for TerraWater AI. The experiment documents a suspected long-term loss of open water in a forest pond near Lake Kuchnia and uses Lake Kuchnia as an additional comparison target.

The project goal is to build an evidence-first, reproducible workflow that can later be repeated at several other sites. Only after approximately five independently documented evidence cases will the project consider L4 training and a systematic survey of lakes, ponds, rivers and canals within 100 km of Evidence 001.

## Exact area of interest

- Main analysis center: **53.591400, 19.010717**
- Standard image crop: **2 km × 2 km**, centered exactly on the coordinate above
- Study interval: **1990–2026 inclusive**
- Spring comparison: preferred **May**, with April/June fallback only when necessary and explicitly documented
- Autumn comparison: preferred **September**, with October/November fallback only when necessary and explicitly documented

## Scientific separation of statements

### OBSERVED

- Historical satellite imagery shows a clearly larger open-water signal in the forest-pond area than recent imagery.
- Recent imagery shows the pond as strongly reduced and in some scenes with little or no stable open-water signal.
- The change is large enough to justify formal monitoring and independent-source verification.
- The water state does not evolve monotonically every year; seasonal and interannual rebounds are possible.

### WORKING ESTIMATE — NOT YET FINAL

The current image-based working estimate is approximately **2.5 ha (25,000 m²) of lost open-water footprint**, with the forest pond appearing to have lost **close to 100%** of its earlier visible open-water area across roughly 36 years. Some older scenes visually suggest that the historic maximum may have been larger.

This number is deliberately labelled provisional. It must not be presented as a final measured value until corrected endpoint segmentation, pond geometry verification, seasonal comparison and uncertainty bounds are completed.

### NOT ESTABLISHED

The satellite imagery alone does **not** establish why the pond changed. Hypotheses involving drought, precipitation, drainage, blocked/altered connections, groundwater, river-management effects or other causes require independent hydrological and meteorological evidence.

## Evidence archive

1. **Primary May series 1990–2026 (37 years)** — USGS/NASA Landsat + ESA/Copernicus Sentinel-2.
2. **Alternate delivery-path May series 1990–2025 (36 years)** — Google Cloud public Landsat + Element 84 Sentinel-2; 2022 is explicitly a non-independent fallback copied from the primary series.
3. **Sentinel-1 RTC radar series 2015–2025** — VV/VH, descending relative orbit 124, monthly May median composites.
4. **Image-first forensic audit** — hashes, cross-year duplicates, structural image registration, orientation, broken-image detection and optical/radar consistency checks.
5. **Corrected spring + autumn seasonal build** — under this experiment directory.
6. **NASA ASTER source-4 catalog** — official CMR catalog evidence; pixels require separate admission/validation.

## Forensic audit findings retained in the evidence record

The audit intentionally checked image pixels before trusting dates or metadata.

- **Alternate 2002, 2012 and 2013:** exact byte-for-byte image duplication in the generated alternate-source package. Invalid as independent year observations until replaced.
- **Alternate 1993:** visually broken/blank and Landsat path/row conflict with primary record.
- **1995:** both optical deliveries too cloudy/low-confidence for reliable water-area measurement.
- **2010:** primary image broken/blank pattern; alternate low local clear fraction.
- **1997:** imagery agrees strongly across delivery paths but QA values disagree; treated as QA/provenance issue rather than fake imagery.
- **2014:** path/row differs but structural agreement is good; likely overlapping valid scenes.
- **2023:** optical products agree strongly; automatic radar-water-footprint test differs and remains manual/seasonal review, not labelled fake.

Twenty-one years in the first two optical packages use the same acquisition date/platform/scene and therefore verify delivery consistency rather than providing independent Earth observations.

No exact cross-year duplicate was found in the Sentinel-1 RTC series and no acquisition-date integrity failure was detected. The small forest pond remains challenging for 10 m radar due to canopy, wet soil and mixed pixels.

## Error-preservation policy

No suspect image is silently deleted. Copies are archived under `errors/do_wyjasnienia/` with source, year, original path, archived path, SHA-256, reason and status. Original generated packages remain untouched for reproducibility.

## Seasonal protocol

### Spring
1. May
2. April fallback
3. June fallback

### Autumn
1. September
2. October fallback
3. November fallback

Fallback month is permitted only when needed and is written into manifest/scene index.

Every evidence image begins with:

`YYYY_YYYY-MM-DD_...`

## Integrity gates

- official/public real satellite pixels only;
- no generative gap filling as observation;
- no AI super-resolution represented as observed detail;
- exact SHA-256 duplicate across different years automatically rejected;
- blank/broken imagery automatically rejected;
- cloud/valid-pixel information retained;
- fallback months explicit.

## Source matrix

| Family | Mission | Role |
|---|---|---|
| NASA/USGS | Landsat 5/7/8/9 | long optical baseline |
| ESA/Copernicus | Sentinel-2 | 10 m optical control |
| ESA/Copernicus | Sentinel-1 RTC | independent C-band radar control |
| NASA | ASTER / Terra | fourth-sensor catalog control where granules exist |
| JAXA | ALOS AVNIR-2 / PALSAR | additional candidate 2006–2011 |
| CNSA | Gaofen | candidate only after exact official AOI product verification |
| Roscosmos | official governmental EO holdings | candidate only after exact public AOI product verification |

A mission is never admitted merely to reach four sources. Exact provenance and usable AOI pixels are mandatory.

## Measurement plan

Final area calculation uses original spectral/radar bands wherever possible. Optical measurement uses NDWI/MNDWI, quality masks, verified object geometry, m²/ha, threshold sensitivity and boundary uncertainty. A common 30 m grid is used for cross-era comparability so 10 m Sentinel detail is not falsely treated as equivalent to historical 30 m Landsat detail.

## Endpoint gate: 1990 versus 2026

Experiment 001 is not quantitatively closed until:

1. forest-pond geometry is manually verified;
2. corrected spring endpoints are segmented;
3. autumn endpoints are segmented where available;
4. uncertainty bounds are reported;
5. independent sensors are compared;
6. rejected scenes are explicit;
7. final result is labelled supported / not supported / inconclusive.

If corrected evidence confirms near-total disappearance of a previously persistent hectare-scale open-water body, TerraWater should flag it as a **high-priority environmental monitoring anomaly**. That alarm means investigation is warranted; it does not assign cause or blame.

## Planned next phase

After Evidence 001 is closed, repeat the protocol for about four additional sites, then build verified training examples, test on NVIDIA L4, and subsequently survey lakes, ponds, rivers and canals within **100 km** of Evidence 001.

## Reproducibility

Primary May ZIP:
`https://raw.githubusercontent.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/annual-best-53-591400-19-010717/satellite_may_1990_2026/53.591400_19.010717/MAY_1990_2026_37_YEARS_2km_53.591400_19.010717.zip`

Alternate May ZIP:
`https://raw.githubusercontent.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/annual-best-53-591400-19-010717/satellite_alternate_source_may_1990_2025/53.591400_19.010717/ALT_SOURCE_MAY_1990_2025_36_YEARS_2km_53.591400_19.010717.zip`

Sentinel-1 RTC ZIP:
`https://raw.githubusercontent.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/annual-best-53-591400-19-010717/satellite_third_source_sentinel1_rtc_may_2015_2025/53.591400_19.010717/THIRD_SOURCE_SENTINEL1_RTC_MAY_2015_2025_WATER_2km_53.591400_19.010717.zip`
