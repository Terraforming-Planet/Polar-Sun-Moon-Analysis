# Vistula TEST 014 — live Agentic EO evidence

- UTC: `2026-08-22T17:10:29.750006+00:00`
- Git SHA: `c7bb074d92cf9497d4ae98fef108feb735103fe7`
- Python: `3.12.14`
- openai-agents: `0.20.0`
- Model: `gpt-5.6-luna`

## Research question

Using the repository evidence for Vistula TEST 014, state what is actually established, select the most suitable official/public EO sources for investigating possible surface-water or river-channel change, and recommend the next scientific checks. Do not infer a physical cause that the evidence does not establish.

## Deterministic TEST 014 verification

- Environmental finding: `False`
- Water loss: `False`
- Causal mechanism: `False`

## Deterministic controlled-registry selection

These matches come from `terra_hazards/data_sources.json`; the model answer does not create or validate registry evidence.

- **Copernicus Sentinel-1** — ESA / European Commission; C-band synthetic aperture radar; access: [Copernicus Data Space account/API](https://dataspace.copernicus.eu/)
- **Copernicus Sentinel-2** — ESA / European Commission; MSI (MultiSpectral Instrument); access: [Copernicus Data Space](https://dataspace.copernicus.eu/explore-data/data-collections/sentinel-data/sentinel-2)
- **Landsat program (Landsat 4-9 for long-term multispectral analysis; current Landsat 8/9 context)** — USGS / NASA; TM / ETM+ / OLI / OLI-2 (mission dependent); access: [USGS EarthExplorer / Landsat data services](https://www.usgs.gov/landsat-missions/landsat-data-access)
- **SWOT** — NASA / CNES / CSA / UK Space Agency; KaRIn radar interferometer and nadir altimeter; access: [NASA Earthdata / PO.DAAC](https://swot.jpl.nasa.gov/)

Required presence:
- Sentinel-1: `True`
- Sentinel-2: `True`
- Landsat: `True`

## Public execution trace

- `agent_start` — `Terra Agentic EO Coordinator` — `observed`
- `tool_start` — `consult_eo_source_scout` — `observed`
- `tool_start` — `consult_evidence_verifier` — `observed`
- `tool_end` — `consult_eo_source_scout` — `success`
- `tool_end` — `consult_evidence_verifier` — `success`
- `agent_end` — `Terra Agentic EO Coordinator` — `success`

The trace contains observable names and states only. It excludes prompts, tool arguments and outputs, credentials, environment data, and private reasoning.

## Final model answer

## Research question

What is established for Vistula TEST 014, which EO sources are suitable for investigating possible surface-water or river-channel change, and what checks should follow?

## Tool/agent actions

- Consulted the EO Source Scout, including deterministic registry searches for `surface_water`, `water_extent`, and `river_channel`.
- Consulted the EO Evidence Verifier for repository-backed findings and provenance limits.

## Evidence

### Repository-backed evidence

**OBSERVATION**
- The repository describes a Vistula Gniew–Grudziądz satellite-image test set.
- 72 of 74 records were accepted; 2 were rejected or not accepted.
- Records contain provenance fields, including dates, platforms, item IDs, source keys, hashes, and scene metadata.
- Reported temporal coverage is 1990–2026, with spring and autumn imagery.
- Reported spatial extent is 45 × 70 km.

**DERIVED_VALUE**
- Accepted-record fraction: 72/74, approximately 97.3%.

**UNKNOWN**
- No environmental finding is established.
- No surface-water or river-channel change is demonstrated.
- No measured water loss, alert, environmental confidence value, or supported event date is provided.
- No causal mechanism is established.

The repository evidence establishes dataset/provenance information, not a reproducible environmental change analysis.

### Registry-backed recommendations

- **Copernicus Sentinel-1** — SAR, useful through cloud cover for water extent and channel morphology. Limitations include effects from vegetation, wind, roughness, geometry, and classification processing; it does not measure water depth.
- **Copernicus Sentinel-2** — optical multispectral imagery for water and channel-boundary mapping. Limited by clouds, shadows, resolution, and seasonal comparability.
- **Landsat program** — longer historical context for surface-water and channel change. Requires harmonizing sensors, seasons, clouds, and shadows.
- **SWOT** — newer radar/altimetry observations for water extent and potentially river-surface elevation. Volume interpretation requires bathymetry or an area–elevation–volume relationship.

Additional non-registry suggestions: none

## Uncertainty

The listed missions are source recommendations only; no evidence shows that their data have been retrieved or analyzed for this test. Imagery alone would not establish a physical cause such as discharge change, sediment dynamics, or human intervention.

## Recommended next checks

1. Retrieve the referenced scenes and verify acquisition dates, hashes, and metadata.
2. Co-register imagery and define comparable reaches and seasons.
3. Map surface-water and channel extent with documented thresholds or classifiers.
4. Quantify change with uncertainty and inspect sensor/resolution effects.
5. Corroborate interpretations using river-gauge, hydrological, meteorological, and relevant human-activity records.
6. Report any result explicitly as observation or derived measurement; retain causal explanations as hypotheses unless independently supported.

## Scientific safety assertions

- test 014 is integrity context not environmental finding: `True`
- water loss not established: `True`
- causal mechanism not established: `True`
- training metrics are not environmental ground truth: `True`
- mapped area is not volume without area elevation volume evidence: `True`
- morphology does not establish hydrological causation: `True`
- optical comparisons require cloud season and sensor checks: `True`
- sentinel 1 backscatter is not direct water depth: `True`
- recommendations are next checks not confirmed causes: `True`
