# Experiment 001 — Forest Pond and Lake Kuchnia Water Loss (1990–2026)

## Current status — Evidence 001

**State-transition evidence: SUPPORTED. Exact 2026 residual open-water area and exact loss percentage: UNCERTAINTY-GATED. Cause: NOT ESTABLISHED.**

Experiment 001 has now completed the evidence-building phase needed to move on to additional examples without pretending that every numerical question is already solved. The strongest current result is a repeatable multi-year visible-footprint consensus for the disappearing forest pond. The strict MNDWI/NDWI endpoint classifier is retained as a diagnostic but is not used to force an unsupported percentage.

## Area of interest

- Center: **53.591400, 19.010717**
- Standard imagery crop: **2 km × 2 km**
- Study interval: **1990–2026**
- Primary target: disappearing forest pond northwest of the AOI center
- Secondary/control target: Lake Kuchnia
- Corrected pond seed used to initialize measurement: approximately **53.594595, 19.000140**, about 690 m west and 375 m north of the AOI center

## Authoritative current pond result

The preferred quantitative description is the multi-year image-visible historical footprint derived from seven clear historical primary images: **1998, 1999, 2000, 2004, 2005, 2006 and 2008**.

- central persistent footprint, supported by at least 4 of 7 years: **17,722.2 m² = 1.7722 ha**;
- conservative lower footprint, supported by at least 5 of 7 years: **16,269.3 m² = 1.6269 ha**;
- repeat-supported upper footprint, supported by at least 2 of 7 years: **21,642.0 m² = 2.1642 ha**;
- broad one-or-more-year union envelope: **23,978.3 m² = 2.3978 ha**;
- the 1990 dark component overlaps **16,398.1 m²**, equal to **92.528%** of the central consensus footprint.

Individual historical extracted footprints in the seven-year set range from about **1.55 to 2.08 ha**.

The former ~2.5 ha / 25,000 m² figure is preserved only as the earlier visual upper hypothesis. It is **not** the current central quantitative result.

## 2026 interpretation

The same historical footprint overlaid on the 2026 basin shows no comparable persistent dark-water shape. May 2026 and the separately documented 7 August 2026 Sentinel-2B proxy are strongly non-water-like at the corrected pond location.

The exact residual open-water area in 2026 is deliberately not forced. Forest canopy, shadows, wet soil and mixed pixels make a single strict spectral threshold unreliable for such a small forested feature. Therefore the defensible conclusion is a **near-total state transition of the historical visible-water feature**, while the exact loss percentage remains uncertainty-gated.

## Spectral seasonal pipeline status

The corrected seasonal evidence build is complete for all observations that can exist as of 14 August 2026:

- spring evidence: **37 years / 37**, 1990–2026;
- autumn evidence: **36 years / 37**, 1990–2025;
- autumn 2026: **not yet observable** because September–November 2026 are in the future;
- separate late-summer proxy: **Sentinel-2B, 7 August 2026**, explicitly labelled `late_summer_proxy_only_not_autumn` and forbidden from being represented as autumn 2026.

The v3 common-grid spectral workflow measured **73 records with 0 execution failures** on a 30 m comparison grid. CI now passes. Its endpoint output correctly refuses unsupported numbers:

- spring forest pond: `not_quantifiable_by_current_strict_spectral_classifier`;
- spring Lake Kuchnia: `not_quantifiable_sanity_gate_failed`;
- autumn forest pond and Lake Kuchnia: `endpoint_pending_missing_observation` for 2026.

This is intentional. A green pipeline means the method executed and its integrity gates passed; it does not convert a poor mask into a scientific result.

## Seasonal selection policy

Spring selection order:
1. May;
2. April fallback;
3. June fallback.

Autumn selection order:
1. September;
2. October fallback;
3. November fallback.

Every fallback stores the real acquisition date and month. A scene is never renamed as May or September when it was acquired in a different month. Any out-of-season proxy is kept in a separate role and can never silently replace a missing seasonal observation.

## Evidence sources

### Source 1 — NASA / USGS Landsat 5/7/8/9
Long-term optical baseline. Older multispectral measurements are approximately 30 m and are not represented as higher-resolution observations.

### Source 2 — ESA / Copernicus Sentinel-2
Higher-resolution recent optical evidence, normally 10 m for the relevant visible/NIR bands.

### Source 3 — ESA / Copernicus Sentinel-1 RTC
Independent C-band radar measurement physics. Useful as a cross-check but difficult for a small pond affected by canopy, wet soil and mixed pixels.

### Source 4 — NASA Terra ASTER
Selected fourth sensor family. The official NASA CMR query for `AST_L1T V004` returned **77 catalog hits** in the Experiment 001 spring/autumn windows. This is currently **catalog-verified only**: an ASTER granule becomes environmental evidence only after official pixel download and scene-level AOI/date/product/resolution/quality/SHA checks.

Supplementary candidate: **JAXA ALOS AVNIR-2/PALSAR**, especially for the 2006–2011 era where useful official products can be retrieved and verified.

Roscosmos and CNSA products remain candidates only. They are not counted unless a concrete official, public, reproducible product for this AOI can be identified and quality-controlled.

## Relation to the Arctic 90°N page

The `docs/arctic-90n/` research module names CryoSat, ICESat-2, Sentinel and SMOS for polar validation. Those missions are relevant to the polar engineering hypothesis, but source selection is made per scientific question and spatial scale. They are not automatically substituted for ASTER/ALOS in this small forest-pond experiment simply to increase the number of agencies.

## Forensic integrity findings retained

Previously identified problematic observations remain part of the reproducibility record rather than being deleted:

- 2002, 2012, 2013 alternate package: exact duplicate imagery assigned to different years;
- 1993: alternate image broken/blank plus path-row concern;
- 1995: poor/cloudy optical evidence;
- 2010: broken/poor-quality candidate imagery;
- 1997: visual agreement but QA/provenance conflict;
- 2014: different path/row with structural agreement, likely valid overlapping scenes;
- 2023: optical agreement but differing automated Sentinel-1 response.

Suspect/rejected material is preserved under `errors/do_wyjasnienia/` with provenance and reason. Different delivery servers for the same underlying acquisition do not count as independent Earth observations.

## Scientific conclusion

**Supported:** the image sequence supports disappearance/near-total state transition of a historically persistent forest-pond visible-water footprint on the order of roughly **1.6–2.2 ha**, with a central repeatable footprint of **~1.77 ha**.

**Not yet quantified:** exact residual open-water m² in 2026 and therefore exact percentage loss.

**Not established:** hydrological cause. Drought, rainfall change, drainage, blocked or altered connections, groundwater, river/water-management effects, melioration and land-use change remain hypotheses requiring independent hydrological and meteorological evidence.

## Evidence phase closeout and next work

Experiment 001 can now serve as the first **positive state-transition evidence case** for the TerraWater research program, while retaining its uncertainty fields. It is not yet sufficient by itself to train a general model. The next phase is to repeat the same evidence protocol on approximately four additional cases before assembling the first multi-case AI training dataset and later testing on NVIDIA L4.

The exact autumn 2026 observation can be appended after that season actually occurs; it is not a blocker for starting the next independent examples now.

## Authoritative machine-readable files

- `EVIDENCE_POLICY.json`
- `measurements_visible_pond_consensus/visible_pond_consensus_measurement.json`
- `measurements/seasonal_water_measurements.json`
- `measurements/endpoint_1990_vs_2026.json`
- `seasonal_evidence/spring/manifest.json`
- `seasonal_evidence/autumn/manifest.json`
- `seasonal_evidence/late_summer_2026_proxy/manifest.json`
- `source4/nasa_aster/nasa_aster_scene_catalog.json`

**Principle: evidence first, then AI.**
