# Experiment 001 — Evidence Phase Closeout

**Date:** 2026-08-14  
**AOI:** 53.591400, 19.010717  
**Evidence branch:** `annual-best-53-591400-19-010717`

## Decision

**Evidence phase status: CLOSED SUFFICIENTLY TO START THE NEXT INDEPENDENT EXAMPLES.**

Scientific conclusion for the forest pond:

- long-term visible-water state transition: **SUPPORTED**;
- central repeatable historical visible footprint: **17,722.2 m² = 1.7722 ha**;
- repeat-supported historical range: **16,269.3–21,642.0 m² = 1.6269–2.1642 ha**;
- broad union envelope: **23,978.3 m² = 2.3978 ha**;
- 1990 overlap with central consensus: **92.528%**;
- exact 2026 residual open-water area: **not forced / uncertainty-gated**;
- exact percentage loss: **not forced / uncertainty-gated**;
- hydrological cause: **not established**.

The former ~25,000 m² / 2.5 ha estimate remains only as an earlier upper visual hypothesis and is no longer the central measurement.

## Completed evidence infrastructure

- corrected spring evidence: 1990–2026;
- autumn evidence: 1990–2025;
- 2026 autumn correctly absent because the season has not occurred as of 2026-08-14;
- separate 2026-08-07 Sentinel-2B late-summer proxy with explicit `not_autumn` role;
- corrected pond geometry seed and image-first historical consensus;
- visible-consensus JSON, sensitivity CSV and 2000/2026 overlays;
- v3 exact-product common-30m seasonal spectral pipeline;
- 73 seasonal spectral records, 0 execution failures;
- CI endpoint integrity fix: missing/poor endpoint data now produce explicit status instead of empty output or invented percentage;
- forensic archive of rejected/suspect imagery;
- cross-year SHA duplicate protection;
- source/month/provenance integrity policy;
- NASA ASTER AST_L1T V004 fourth-source catalog: 77 spring/autumn hits, catalog-verified only pending pixel-level admission QA;
- JAXA ALOS retained as supplementary candidate;
- Roscosmos/CNSA blocked from evidence admission unless a concrete official public reproducible AOI product is verified.

## Why the strict spectral endpoint is not the headline result

The strict connected MNDWI/NDWI workflow frequently produces implausible masks for this small forested target and for Lake Kuchnia in some scenes. The pipeline is retained because it exposes those failures transparently, but it does not override the stronger repeatable multi-year image-visible footprint result.

The endpoint machine-readable status is therefore intentionally conservative:

- spring forest pond: `not_quantifiable_by_current_strict_spectral_classifier`;
- spring Lake Kuchnia: `not_quantifiable_sanity_gate_failed`;
- autumn forest pond: `endpoint_pending_missing_observation` for 2026;
- autumn Lake Kuchnia: `endpoint_pending_missing_observation` for 2026.

## Source policy

The goal is not to display four agency names. The goal is independent, reproducible evidence. ASTER is the selected fourth sensor family for this case, but catalog presence is not counted as pixel-level environmental evidence until each granule passes scene-level QA.

The Arctic 90°N module's CryoSat, ICESat-2, Sentinel and SMOS sources remain appropriate to polar research and are not automatically substituted into this small-pond case.

## Next project action

Start approximately four additional independent water-change examples using the same evidence policy. Keep Experiment 001 available for later strengthening with:

- real autumn 2026 imagery after September–November occur;
- manually reviewed residual-water polygon if needed;
- admitted ASTER/ALOS pixel products where retrieval and QA succeed.

These later additions strengthen Experiment 001 but do not block Experiments 002–005.

**Principle: evidence first, then AI.**
