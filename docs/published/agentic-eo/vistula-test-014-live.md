# Vistula TEST 014 — live Agentic EO evidence

- UTC: `2026-08-22T17:17:09.188995+00:00`
- Git SHA: `3a2d3277916626085ebd744f7fa631f570dfe710`
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
- `tool_end` — `consult_evidence_verifier` — `success`
- `tool_end` — `consult_eo_source_scout` — `success`
- `agent_end` — `Terra Agentic EO Coordinator` — `success`

The trace contains observable names and states only. It excludes prompts, tool arguments and outputs, credentials, environment data, and private reasoning.

## Final model answer

## Research question

What is established for Vistula TEST 014, which official/public EO sources best investigate possible surface-water or river-channel change, and what checks are needed next?

## Tool/agent actions

- Consulted the EO Source Scout using deterministic searches for `surface_water`, `water_extent`, and `river_channel`.
- Consulted the EO Evidence Verifier for repository provenance, training context, and claim support.
- No area-change calculation was possible because no mapped water-area measurements were provided.

## Evidence

**OBSERVATION:** The repository describes a satellite-image test set for the Vistula Gniew–Grudziądz area, spanning spring and autumn from 1990–2026, with 74 records and 72 accepted records. Provenance fields include dates, platforms, item IDs, scene keys, and hashes.

**DERIVED_VALUE:** The evidence supports dataset integrity and temporal coverage.

**MODEL_ESTIMATE:** None establishing environmental change.

**HYPOTHESIS:** None established.

**UNKNOWN:** The evidence does not establish surface-water loss, river-channel change, an environmental finding, or any causal mechanism. Training metrics contain no persisted environmental measurements or ground truth.

### Registry-backed recommendations

1. **Copernicus Sentinel-1** — registry ID `esa-sentinel-1`  
   Best for cloud-independent water-extent mapping; affected by wind, vegetation, roughness, viewing geometry, and processing.

2. **Copernicus Sentinel-2** — registry ID `esa-sentinel-2`  
   Best for clear-sky water morphology and channel delineation; limited by clouds, shadows, seasonality, and lack of depth/cause information.

3. **USGS Landsat program** — registry ID `usgs-landsat`  
   Best for longer-term channel and surface-water context; requires harmonization for sensor, cloud, and seasonal differences.

**Additional non-registry suggestions: none.**

## Uncertainty

No analyzed EO measurements, mapped areas, or validated change detections are supplied. Apparent exposed sediment or channel constriction would not establish hydrological causation.

## Recommended next checks

1. Retrieve comparable Sentinel-1, Sentinel-2, and Landsat scenes for the documented records.
2. Apply cloud/shadow masking and seasonal matching.
3. Produce independently validated surface-water masks and channel boundaries.
4. Quantify mapped area and channel geometry with uncertainty.
5. Check river stage, discharge, precipitation, ice, sediment, and regulation records before assessing possible causes.
6. Preserve scene IDs, processing parameters, masks, and validation samples for reproducibility.

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
