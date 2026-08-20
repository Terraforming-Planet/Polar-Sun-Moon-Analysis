# Codex brief — Terra Observation System / BUILD FOR GOOD submission-ready pass

## Mission
Finish the existing `Terraforming-Planet/Polar-Sun-Moon-Analysis` project as a compelling BUILD FOR GOOD submission under the public product name **Terra Observation System**. Do not create a new repository or a second product. Preserve the existing GitHub Pages URL, scientific pipelines, research stations, data provenance, tests and working 3D Earth behavior.

The primary BUILD FOR GOOD use case is **Earth observation for environmental protection**, especially:
- drying lakes, ponds and wetlands;
- loss of visible surface water;
- river narrowing, channel shift and exposed sediment;
- flow-connectivity candidates that deserve hydrological verification;
- long-term comparison of real public satellite observations;
- clear explanations that communities, educators, NGOs and researchers can understand.

Astronomy, the Solar System and Earth–Space research remain legitimate modules, but they are **not the lead contest story**. Do not make the submission sound like an astronomy project with an environmental add-on.

## Branch
Work only on:

`agent/build-for-good-submission-ready`

Do not edit `main` directly.

## Read these first
Before editing, inspect:
- `README.md`;
- `terra_research_node/openai_summary.py`;
- `tests/test_openai_summary.py`;
- `docs/published/training-runs/site_20260819T223835Z/`;
- `docs/published/training-runs/stream_gibs_20260820T013036Z/`;
- `docs/published/training-runs/stream_gibs_20260820T013036Z/analysis.json`;
- the existing water/river experiments, especially Vistula and other real-data cases;
- current frontend result/finding views before adding any UI.

## Primary tasks

### 1. Verify and finish the OpenAI Evidence / Research Explainer
The repository contains `terra_research_node/openai_summary.py` and `tests/test_openai_summary.py` as the minimum real OpenAI API integration.

The explainer must use **real structured project evidence**, not a marketing-only prompt.

The input architecture should support an evidence bundle containing:
1. a primary environmental finding from deterministic analysis;
2. structured NVIDIA L4 training/evaluation context;
3. structured results from tests on real public satellite data.

Requirements:
- use the OpenAI **Responses API**;
- read the secret only from `OPENAI_API_KEY` or an explicitly injected server-side/local value;
- optional model override may use `OPENAI_MODEL`;
- no OpenAI key, token or secret may be committed, logged, returned to the browser or stored in public JSON;
- the public GitHub Pages frontend must never contain the key;
- if no key is available, fail clearly and do not fabricate an AI result;
- OpenAI may explain evidence but must never invent satellite measurements, dates, acquisition IDs, source URLs, confidence values, environmental events, training metrics or missing observations;
- preserve the project evidence classes: `OBSERVATION`, `DERIVED_VALUE`, `MODEL_ESTIMATE`, `HYPOTHESIS`, `UNKNOWN`;
- preserve explicit `false` or `UNKNOWN` claim flags from training/test artifacts;
- training loss, throughput or successful CUDA ingestion must never be presented as proof of environmental detection accuracy;
- `flow_connectivity_candidate` or `possible_constriction` must never be rewritten as a confirmed blockage or causal mechanism without independent hydrological evidence;
- output should contain four human-readable fields: `summary`, `why_it_matters`, `uncertainty`, `next_checks`;
- deterministic scientific results must remain usable when OpenAI is disabled.

When water/river evidence is present, prefer explaining that over unrelated astronomy context.

### 2. Make the real L4 work visible to judges
The submission should clearly explain the progression of the NVIDIA L4 research without exaggeration.

Preserve the measured facts from published reports. In particular, verify before using them:
- Training #1 was the smaller baseline;
- Training #2 expanded to 290 unique research images, ran 60 minutes on NVIDIA L4 and included identifiable project research such as the Vistula series;
- Training #3 streamed public NASA GIBS MODIS/VIIRS imagery, used 200,016 geospatial/time windows, recorded 156,863 content-unique payloads and covered 75 research regions across 2000–2026 seasonal checkpoints.

Do not turn those figures into unsupported claims. Explicitly retain the report's important caveat:
**training success is not the same as validated water-loss or river-change detection accuracy.**

The value proposition is stronger when we show that the project measures what its training proves and also records what the training does not prove.

### 3. Make the README judge-first and water-first
Near the top, a judge should understand within one minute:
- the name: **Terra Observation System**;
- the problem: lakes/rivers/wetlands can change or lose visible water and public satellite archives are difficult to interpret;
- the solution: real public data + reproducible measurements + L4 research + OpenAI evidence explanation;
- who benefits;
- the public demo and repository;
- how Codex was used;
- how OpenAI adds value without replacing science.

The README must prominently contain:
- What we built
- The environmental problem
- Real NVIDIA L4 training / real satellite data
- Who it helps
- How it will be used / is already used
- How the OpenAI API adds value
- How Codex helped
- How to run the project
- Security/privacy
- Scientific limitations

Use concrete environmental examples such as drying lakes, disappearing ponds, Vistula channel change, Aral Sea, Lake Chad, Great Salt Lake and other regions actually present in the published research/training corpus.

Do not lead with Solar System features. Keep them as secondary platform capabilities.

### 4. Add the smallest honest UI integration that does not expose secrets
Inspect the current app architecture before editing.

Preferred behavior:
- if a safe backend/local research-node endpoint already exists or can be added cleanly, add an **AI Evidence Explainer** action to a water/river/environmental finding detail view;
- make the environmental evidence visible before the AI explanation;
- show explicit states: `DISCONNECTED`, `READY`, `EXPLAINING`, `ERROR`;
- never pretend the public static GitHub Pages site has a backend;
- if the only safe implementation for this pass is local/server-side CLI/API, document that honestly instead of shipping a fake button;
- preserve keyboard access, labels, focus and readable errors.

Do not introduce a framework rewrite just for this feature.

### 5. Preserve scientific honesty
Do not change measured numbers or create a competition-friendly "discovery".

Official/public sources remain the source of truth, including NASA GIBS/EONET/FIRMS/JPL, ESA/Copernicus/CDSE, USGS, NOAA and other documented project sources.

Environmental findings should preserve where available:
- AOI/region;
- observation dates;
- source/sensor/product;
- matched-season rule;
- deterministic metric;
- evidence class;
- uncertainty/limitations;
- provenance/hash/manifest references;
- causal-claim status.

A finding about lower mapped surface water does not automatically reveal the volume lost or the cause.

### 6. Security
Verify:
- `.env` remains ignored;
- no `sk-...` / `sk-proj-...` secret is in tracked files;
- no frontend bundle exposes `OPENAI_API_KEY`;
- tests use obvious fake keys only;
- no secret is printed by the explainer;
- any backend endpoint is narrow and cannot be used as an unrestricted OpenAI proxy.

### 7. Tests and quality gates
Run and fix failures caused by this work:

```bash
python -m ruff check .
python -m mypy polar_equinox_analysis terra_hazards terra_research_node tests
python -m pytest -q
cd web
npm ci
npm test
npm run build
```

Also run a secret-pattern scan over tracked source and generated public output. Do not print real secret values.

Add or retain tests proving that:
- L4/training context enters the OpenAI evidence bundle;
- real-data test context enters the bundle;
- explicit non-causal/non-scientific claim flags are preserved;
- no key means no fake response;
- the API key is sent only in the Authorization header and never inside the model input.

### 8. Completion report
When finished, report:
- files changed;
- exact OpenAI API flow;
- which real L4/test artifacts can be supplied to it;
- where `OPENAI_API_KEY` is read;
- behavior without a key;
- tests run and results;
- any remaining backend/UI limitation;
- confirmation that no scientific observation was generated by OpenAI;
- confirmation that L4 optimization metrics were not mislabeled as environmental ground truth.

## Non-goals for this pass
Do not spend this submission-ready pass adding unrelated satellite providers, new research stations, new 3D models or decorative features. Do not make Solar System work the lead story. The priority is a truthful, technically demonstrable BUILD FOR GOOD submission centered on **real Earth observation, water loss, river/lake change, NVIDIA L4 research, Codex and a grounded OpenAI evidence layer**.
