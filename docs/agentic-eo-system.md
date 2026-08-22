# Agentic Earth Observation research system

Terra Observation System includes an experimental **multi-agent Earth-observation research coordinator** built with the OpenAI Agents SDK.

The goal is not to let an LLM invent environmental conclusions. The goal is to let an agentic system choose appropriate tools, consult specialized agents, inspect repository-backed evidence, perform transparent calculations, preserve uncertainty and recommend the next scientific checks.

## Architecture

The manager-style system in `terra_research_node/agentic_eo.py` contains three roles:

1. **Terra Agentic EO Coordinator** — decomposes the research question and owns the final answer.
2. **EO Source Scout** — searches the repository's machine-readable registry of official/public EO sources and explains sensor limitations and access requirements.
3. **EO Evidence Verifier** — loads repository-backed evidence and training/evaluation contexts, then checks whether observation, environmental-finding, water-loss or causal claims are actually supported.

The two specialists are exposed to the coordinator using the Agents SDK **agents-as-tools** pattern. Deterministic calculations remain normal function tools.

## Current tools

### `search_eo_sources`

Searches `terra_hazards/data_sources.json` for a requested phenomenon. The registry currently includes, among others:

- Copernicus Sentinel-1 SAR for flood, surface water and ground deformation;
- Sentinel-3 SLSTR for thermal observations;
- NASA/CNES SWOT for water-surface elevation, river slope and extent;
- NASA SMAP for surface soil moisture;
- NASA GRACE/GRACE-FO for regional water-storage anomalies;
- NASA FIRMS and EONET for hazard context;
- NOAA multibeam as a non-satellite bathymetric reference.

A registry match is only source selection. It is not evidence that a product has already been downloaded or analysed.

### `load_evidence_case` and `verify_evidence_case`

The first registered research case is `vistula-test-014`. It loads the real Test 014 Vistula integrity context and preserves its explicit scientific claim flags.

The verifier currently confirms that the case supports dataset integrity/temporal coverage, while the published context still carries:

- `environmental_finding_claim: false`
- `water_loss_claim: false`
- `causal_claim: false`

The agent therefore must not convert visible morphology or dataset integrity into a claimed water-loss measurement or hydrological cause.

### `load_training_context`

The first registered training context is `stream-gibs-20260820`, based on the published NVIDIA L4 streaming NASA GIBS run. The tool exposes compact run facts and preserves:

- `scientific_finding_claim: false`
- `ground_truth_claim: false`
- `causal_environmental_claim: false`

Training/evaluation is context about the pipeline, not environmental ground truth.

### `compare_surface_water_areas`

Performs a deterministic before/after mapped-area calculation. It returns a `DERIVED_VALUE` while keeping water-volume change and physical cause explicitly `UNKNOWN` unless additional evidence exists.

## Run locally

Install the repository dependencies:

```bash
python -m pip install -r requirements.txt
```

Set the OpenAI key in the environment. Never commit the key.

Linux/macOS:

```bash
export OPENAI_API_KEY="..."
```

Windows PowerShell:

```powershell
$env:OPENAI_API_KEY = "..."
```

Example investigation:

```bash
python -m terra_research_node.agentic_eo \
  "Investigate what the current repository evidence can and cannot establish about the Vistula Gniew-Grudziadz case. Select suitable EO sources for future surface-water and flow-connectivity analysis and state the next checks."
```

An alternative model can be selected with `--model` or `OPENAI_AGENT_MODEL`.

## Scientific guardrails

The system must:

- distinguish `OBSERVATION`, `DERIVED_VALUE`, `MODEL_ESTIMATE`, `HYPOTHESIS` and `UNKNOWN`;
- never invent observations, product IDs, dates, measurements, confidence values, causes or emergency alerts;
- never treat GPU optimization/training success as environmental ground truth;
- never promote a morphology or flow-connectivity candidate into a confirmed blockage or causal mechanism;
- state explicitly when the evidence does not establish an environmental finding;
- recommend independent verification such as matched-season imagery, SAR, DEM/bathymetry, discharge records, hydraulic-structure data or field inspection when relevant.

## Why this is agentic rather than a single prompt

The coordinator does not receive all answers in one static prompt. It can decide when to delegate source selection and evidence verification to specialist agents, and when to invoke deterministic calculation tools. Each specialist has its own instructions and restricted tool surface. The coordinator then synthesizes their results while preserving scientific uncertainty.

This is an experimental research layer. It does not replace deterministic EO analysis, authoritative hazard services, field measurements or professional hydrological assessment.
