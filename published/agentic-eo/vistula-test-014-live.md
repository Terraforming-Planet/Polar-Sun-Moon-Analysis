# Vistula TEST 014 — live Agentic EO evidence

- UTC: `2026-08-22T17:29:40.927801+00:00`
- Git SHA: `caee6bf3a0a44cda196b2eef93772d9fa2e17ad4`
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

What is established for **Vistula TEST 014**, which official/public EO sources best investigate possible surface-water or river-channel change, and what checks are needed next?

## Tool/agent actions

- Consulted the EO Source Scout using deterministic registry searches for `surface_water`, `water_extent`, and `river_channel`.
- Consulted the Evidence Verifier for repository-backed provenance and claim status.
- No mapped-area comparison was possible because no before/after water areas were provided.

## Evidence

### Established — **OBSERVATION**

The repository contains an integrity-checked satellite-image test set for the Vistula Gniew–Grudziądz area:

- Reported extent: **45 × 70 km**
- Temporal scope: **spring and autumn, 1990–2026**
- Records: **74 total; 72 accepted and 2 rejected/not accepted**
- Per-record provenance includes dates, platforms, item IDs, source-scene keys, SHA-256 hashes, and image hashes.

### Not established

- **DERIVED_VALUE:** No measured surface-water or channel-area change.
- **MODEL_ESTIMATE:** None.
- **HYPOTHESIS:** Hydrological causes remain untested hypotheses.
- **UNKNOWN:** Whether environmental change occurred, its magnitude, and its cause.

The repository evidence establishes data integrity and temporal coverage—not an environmental finding, alert, water loss, or causal mechanism.

## Registry-backed recommendations

1. **Copernicus Sentinel-1** — primary option for water extent and channel mapping, including cloudy conditions. Limitations include effects from wind, vegetation, surface roughness, viewing geometry, and classification.
2. **Copernicus Sentinel-2** — complementary optical mapping of water boundaries and channel morphology. Limited by clouds and shadows; does not measure depth or establish cause.
3. **Landsat 4–9** — longer historical comparison from 1982 onward. Requires attention to resolution, clouds, seasonality, and sensor harmonization.

**Additional non-registry suggestions: none**

## Uncertainty

No image-analysis results were supplied. Therefore, no environmental change or causal mechanism is established.

## Recommended next checks

1. Define fixed river-channel and surface-water boundaries.
2. Compare same-season, comparable-date scenes across years.
3. Process Sentinel-1 and cloud-screened Sentinel-2/Landsat imagery independently.
4. Quantify mapped water area and channel geometry, reporting classification uncertainty.
5. Check river stage/discharge, precipitation, ice, sediment, and land-use records before considering causes.
6. Validate detected changes against higher-resolution imagery or field/reference data.

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
