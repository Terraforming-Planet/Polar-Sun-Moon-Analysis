# Experiment 001 — current findings (2026-08-14)

## Forest pond — strongest current result

The corrected image-first geometry identifies the disappearing forest pond near **53.594595, 19.000140** (approximately 690 m west and 375 m north of the standard AOI center).

A deterministic multi-year visible-footprint analysis was run on the same fixed geographic crop using seven clear older images: **1998, 1999, 2000, 2004, 2005, 2006, 2008**.

### Current quantitative image result

- central persistent historical footprint (present in >=4 of 7 clear historical images): **17,722.2 m² = 1.7722 ha**
- conservative lower footprint (>=5 of 7): **16,269.3 m² = 1.6269 ha**
- repeat-supported upper footprint (>=2 of 7): **21,642.0 m² = 2.1642 ha**
- broad union envelope (>=1 of 7): **23,978.3 m² = 2.3978 ha**
- the 1990 dark component overlaps **16,398.1 m²**, or **92.53%**, of the central multi-year footprint

Individual older clear-year visible components range from approximately **1.55 ha to 2.08 ha**.

### Correction to the earlier 2.5 ha statement

The earlier **~2.5 ha** figure is retained in the experiment history as the initial visual/upper working estimate. It is **not** the central measured result after multi-year image consensus. The current evidence supports a central historical footprint closer to **~1.77 ha**, with a defensible repeat-supported range of roughly **1.63–2.16 ha** and a broad image-union envelope reaching **~2.40 ha**.

### 2026 state

The historical footprint, when overlaid on the 2026 Sentinel-2 image, falls on a visibly changed/drier basin rather than the same persistent dark-water feature. May and August 2026 spectral diagnostics at the corrected pond seed are strongly non-water-like.

The experiment therefore supports a **near-total state transition / disappearance of the old persistent open-water-type feature**, but an exact residual-water m² value is not forced because canopy, shadow, wet soil and mixed pixels can confuse automated water indices.

## Important rejected method

A single fixed MNDWI/NDWI threshold across Landsat and Sentinel seasons was tested and rejected after sanity checks. It failed to classify visibly obvious Lake Kuchnia water in some scenes. Those failed values must not be used as evidence.

## Lake Kuchnia

The original 2 km crop truncates Lake Kuchnia on the eastern/southern edges, so older totals derived from that crop are not valid as complete-lake area measurements. A separate **5 km × 5 km adaptive exact-product measurement** is being used for the lake endpoint comparison.

## Evidence status

- forest pond state transition: **strongly supported by repeated imagery**
- central historical pond footprint: **~1.77 ha**, image-consensus estimate
- exact percent loss: **near-total, but final percentage uncertainty-gated**
- cause of the loss: **not established**
- environmental alarm status: if independent measurements continue to confirm disappearance, **high-priority monitoring anomaly requiring investigation**

Authoritative machine result:

`measurements_visible_pond_consensus/visible_pond_consensus_measurement.json`
