# Terra Observation System

**BUILD FOR GOOD — open Earth observation for finding, measuring and explaining environmental change with real public satellite data.**

Terra Observation System is being built to help people investigate questions such as:

- Where are lakes, ponds or wetlands losing visible surface water?
- Where has a river channel narrowed, shifted or become fragmented by exposed sediment?
- Which locations deserve closer hydrological or field investigation?
- What do decades of satellite observations actually show — and what do they **not** prove?

The project combines official/public Earth-observation data, deterministic measurements, NVIDIA L4 training and evaluation, an interactive 3D Earth, reproducible evidence records and a guarded OpenAI **Evidence / Research Explainer**.

The central rule is simple: **satellites and deterministic analysis produce the evidence; AI helps people understand it.** OpenAI never replaces measurements, source metadata or scientific verification.

## Live demo and public repository

- **Live application:** <https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/>
- **Public GitHub repository:** <https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis>

## BUILD FOR GOOD submission summary

Terra Observation System helps communities, researchers, educators, NGOs and environmental responders investigate environmental change using legal, official and publicly available Earth-observation data. A primary use case is the long-term study of **drying lakes, disappearing ponds, river morphology and water connectivity**.

Instead of asking an AI model to guess what happened, the system first collects and processes satellite/public-source evidence, preserves dates and provenance, and computes reproducible metrics. NVIDIA L4 training helps develop and evaluate the image-processing pipeline. The OpenAI Responses API is then used as a final explanation layer over structured findings, training/evaluation artifacts and real-data test results.

## What we built

The project currently combines:

- an interactive 3D Earth for environmental and satellite context;
- water, lake, river, wetland, terrain and environmental-change research workflows;
- multi-year and multi-region Earth-observation experiments;
- official/public data integrations including NASA, NASA GIBS, NASA EONET/FIRMS, ESA/Copernicus/CDSE, USGS and other documented sources;
- reproducible manifests, timestamps, hashes, source references and evidence classes;
- NVIDIA L4 GPU training and streaming research pipelines;
- published L4 training reports with explicit limitations and reproducibility information;
- an OpenAI-powered Evidence / Research Explainer grounded in already-produced scientific artifacts;
- environmental hazard monitoring;
- Arctic, Sahara, Ocean and Earth–Space research stations;
- NASA JPL Horizons astronomy/polar research as an additional scientific module;
- privacy safeguards and no person tracking.

For BUILD FOR GOOD, the main story is **Earth, water and environmental protection**. The astronomy and Earth–Space modules remain part of the wider research platform, but they are not the primary example of community impact.

## The problem we want to help solve

Satellite archives contain decades of evidence, but turning those observations into something useful for a local community, student, NGO or researcher is difficult. A person may notice that a pond has disappeared or that a river contains more exposed sediment than decades ago, but visual inspection alone does not establish the magnitude or cause of that change.

Terra Observation System is designed to make that process more rigorous:

1. locate the area of interest;
2. collect comparable public satellite observations;
3. preserve acquisition date, source, sensor and provenance;
4. derive water masks, shoreline/channel measurements or other documented metrics;
5. compare matched periods where possible;
6. label the result by evidence class;
7. use GPU/AI tooling to improve analysis and evaluate the pipeline;
8. explain the verified result in language that non-specialists can understand;
9. state clearly what additional evidence would be required before claiming a physical cause.

A visually suspected obstruction or constriction is therefore recorded as a `flow_connectivity_candidate` or `possible_constriction`, **not** as proof that an outlet is blocked. Confirming cause can require discharge records, DEM/bathymetry, hydraulic structures, groundwater information or field inspection.

## Real NVIDIA L4 training and public satellite data

The project does not present a tiny demo dataset as if it were a finished global model. We have been progressively increasing the scale of real GPU experiments and publishing what each run actually establishes.

### L4 Training #1 — baseline

The first NVIDIA L4 run established a smaller baseline corpus of **66 images** and the basic CUDA training path. It was intentionally limited and served as a starting point rather than a global environmental model.

Published report:

<https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/published/l4-training-2026-08-19/>

### L4 Training #2 — project research corpus

Training #2 expanded the corpus to **290 unique research images** and ran for **60 minutes** on NVIDIA L4. The published corpus included geographically identifiable research material, including **72 images from the Vistula experiment**, 71 from Grays Harbor, 72 from Experiment 011 and 65 from Himalaya–Tibet.

The run completed **29,013 optimization steps** and processed all **290 / 290** unique readable inputs through the CUDA audit. Its loss reduction shows that the denoising objective optimized successfully, but the report explicitly states that this **does not by itself prove water, river, glacier or drought detection accuracy**.

Published report:

<https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/published/training-runs/site_20260819T223835Z/>

### L4 Training #3 — streaming NASA GIBS

Training #3 moved beyond the static site corpus and streamed real public **NASA GIBS MODIS/VIIRS** imagery into the NVIDIA L4 pipeline.

Measured run facts:

- **200,016** geospatial/time windows were decoded and used for optimization;
- **156,863** distinct payload SHA-256 contents were recorded;
- the candidate program covered **75 research regions**;
- temporal coverage in the saved run spans **2000–2026** with four seasonal checkpoints per year;
- the configured 200,000-window target was reached in **54.90 minutes**;
- the run recorded a very small request failure rate and preserved structured cross-checks.

The 75-region program includes water and climate cases such as the **Aral Sea, Lake Chad, Lake Mead, Great Salt Lake, Lake Kuchnia / forest pond, Vistula Grudziądz–Gniew, Nogat / Vistula Delta, Okavango Delta, wetlands, glaciers, deserts and control areas**.

Crucially, the report also states what the run did **not** establish: 200,016 training windows are not 200,016 independent satellite scenes, and training alone is not a before/after environmental measurement. Real environmental findings require a separate reproducible analysis stage.

Published report and structured evidence:

- <https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/published/training-runs/stream_gibs_20260820T013036Z/>
- [`docs/published/training-runs/stream_gibs_20260820T013036Z/analysis.json`](docs/published/training-runs/stream_gibs_20260820T013036Z/analysis.json)

That distinction is intentional. For BUILD FOR GOOD, **scientific honesty is part of the product**.

## Who it helps

Terra Observation System is designed for:

- **local communities** trying to understand visible changes in nearby lakes, ponds, rivers or wetlands;
- **educators and students** learning Earth observation, hydrology, climate science and uncertainty;
- **researchers and citizen scientists** who need transparent provenance and reproducible comparisons;
- **NGOs and environmental organizations** reviewing water loss, drought, river change, floods, fires and ecosystem stress;
- **environmental and emergency-response professionals** who need rapid context from official public sources;
- **open-source developers** building transparent tools for environmental protection and the common good.

The application is research and educational software. It does not replace official emergency warnings or professional field/hydrological assessment.

## How it will be used — and how it is already used

A practical water-loss workflow can look like this:

1. choose a lake, pond, river reach, wetland or AOI;
2. retrieve historical and recent observations from official/public sources;
3. use matched seasons and quality filters where possible;
4. compute water-area, shoreline, channel, exposed-bed or morphology metrics;
5. save the source dates, sensor information, hashes and analysis configuration;
6. compare the result with previous tests and relevant L4 training/evaluation artifacts;
7. classify the evidence as `OBSERVATION`, `DERIVED_VALUE`, `MODEL_ESTIMATE`, `HYPOTHESIS` or `UNKNOWN`;
8. optionally send that **structured evidence bundle** to the OpenAI Evidence Explainer;
9. show users a clear explanation of what changed, why it may matter, what remains uncertain and what should be checked next.

This creates a path from **satellite data → reproducible measurement → GPU research → understandable evidence**, instead of satellite image → unsupported AI claim.

## How the OpenAI API adds value

The OpenAI integration lives in [`terra_research_node/openai_summary.py`](terra_research_node/openai_summary.py).

The **Evidence / Research Explainer** uses the OpenAI Responses API after the scientific and training pipelines have produced structured artifacts. It can now receive three evidence layers in one request:

1. **Primary finding** — for example, a measured surface-water or river-channel change;
2. **L4 training/evaluation context** — structured metrics from GPU runs such as Training #2 or Training #3;
3. **Real-data test context** — structured results from tests performed on real public satellite observations.

The API returns four human-readable fields:

- `summary`
- `why_it_matters`
- `uncertainty`
- `next_checks`

### Why this is useful

A community user should not need to understand WMS windows, SHA-256 provenance, CUDA training logs, segmentation metrics and hydrological caveats just to understand a result. OpenAI can translate that evidence into a clear explanation **without changing the underlying measurements**.

For example, if a real-data test shows reduced mapped surface water in a lake, while L4 evaluation shows that the pipeline processed relevant water/river imagery successfully, OpenAI may explain the combined evidence and recommend verification steps. It may **not** turn successful training into a claim that the lake dried because of a blocked river.

### Guardrails

- OpenAI does **not** create satellite measurements;
- OpenAI does **not** invent dates, source URLs, acquisition IDs, environmental events or missing observations;
- L4 loss/throughput metrics are never treated as environmental ground truth;
- OpenAI does **not** promote a candidate into a confirmed cause;
- original evidence classes and explicit `false` / `UNKNOWN` claim flags remain part of the input;
- deterministic results remain usable when OpenAI is disabled;
- if `OPENAI_API_KEY` is missing, the explainer fails clearly instead of producing a fake result.

The default API model is `gpt-5.6-luna`, selected for a cost-conscious explanation task, and can be overridden with `OPENAI_MODEL`.

Example using a primary finding plus the real published L4 Training #3 analysis:

```bash
export OPENAI_API_KEY="your-key-from-your-secure-environment"
python -m terra_research_node.openai_summary \
  path/to/water-or-river-finding.json \
  --training-context docs/published/training-runs/stream_gibs_20260820T013036Z/analysis.json \
  --test-context path/to/real-satellite-test.json \
  --output explanation.json
```

The OpenAI key is never placed in GitHub Pages or committed source files.

## How Codex helped

Codex has been used throughout development as a repository-level engineering tool for:

- architecture and codebase inspection;
- refactoring and modularization;
- test generation and regression protection;
- GPU/training workflow implementation and review;
- Earth-observation pipeline work;
- CI and GitHub Actions;
- 3D globe and interface fixes;
- provenance and scientific guardrails;
- BUILD FOR GOOD audit and submission preparation.

The repository contains concrete Codex artifacts:

- [`CODEX_BUILD_FOR_GOOD_UI_L4.md`](CODEX_BUILD_FOR_GOOD_UI_L4.md);
- [`scripts/start_build_for_good.ps1`](scripts/start_build_for_good.ps1), which checks for Codex CLI and runs `codex exec` against the implementation brief;
- [`CODEX_BUILD_FOR_GOOD_SUBMISSION_READY.md`](CODEX_BUILD_FOR_GOOD_SUBMISSION_READY.md);
- [`scripts/start_build_for_good_submission_ready.ps1`](scripts/start_build_for_good_submission_ready.ps1);
- merged BUILD FOR GOOD development history and testable code changes.

Codex is used to build and verify the system; it is not treated as a substitute for scientific validation.

## Evidence classes

Every environmental result should be explicit about what kind of knowledge it represents:

- `OBSERVATION` — direct sensor or authoritative catalogue record;
- `DERIVED_VALUE` — transparent calculation from observations;
- `MODEL_ESTIMATE` — model result with assumptions and uncertainty;
- `HYPOTHESIS` — possible explanation requiring additional evidence;
- `UNKNOWN` — not measurable or established from the available inputs.

Example: if mapped lake surface area changes from 10 km² to 1 km², the mapped area difference is −9 km² or −90%. The **volume** change remains unknown without bathymetry or a defensible area–elevation–volume relationship. The **cause** of the change is also a separate question.

## Official/public data principle

The platform is designed around legal, official and publicly available sources. Depending on the module, these include NASA/JPL, NASA GIBS, NASA EONET, NASA FIRMS, ESA/Copernicus/CDSE, USGS, NOAA and other documented scientific/civil-protection sources.

We do not download entire satellite archives when a targeted catalogue/tile/scene workflow is sufficient. Source IDs, dates, resolution/limitations and provenance are preserved wherever available.

## Additional Earth and space research

Terra Observation System grew from the Polar Sun/Moon research project and still includes:

- NASA JPL Horizons-based Sun/Moon and polar geometry;
- a 3D Solar System view based on published ephemeris vectors;
- Arctic 90°N research;
- Sahara terrain/paleochannel research;
- Ocean research;
- Earth–Space 512 research.

These modules broaden the scientific platform, but the BUILD FOR GOOD environmental use case is centered on **Earth observation, water, hazards and environmental change**.

## Security and privacy

- `.env` is ignored by Git;
- `OPENAI_API_KEY` and other private credentials are read only from the environment or authorized secret stores;
- no API key belongs in browser JavaScript, public JSON, screenshots or committed logs;
- the OpenAI endpoint is not an unrestricted public proxy;
- the platform does not perform person tracking or private-data enrichment;
- public Earth-observation work uses legal, official and publicly available sources;
- tests use obviously fake credentials only.

## How to run the project

### Python research environment

Python 3.12:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Refresh the public hazard/source data:

```bash
python -m terra_hazards sources --output web/public/data/sources.json
python -m terra_hazards update --output web/public/data/hazards.json
```

Run the optional OpenAI Evidence Explainer:

```bash
export OPENAI_API_KEY="your-key-from-your-secure-environment"
python -m terra_research_node.openai_summary path/to/finding.json
```

Add L4 and real-data test evidence when available:

```bash
python -m terra_research_node.openai_summary \
  path/to/finding.json \
  --training-context docs/published/training-runs/stream_gibs_20260820T013036Z/analysis.json \
  --test-context path/to/test-result.json
```

### Web application

```bash
cd web
npm install
npm run dev
```

### Existing polar/JPL workflow

```bash
python -m polar_equinox_analysis polar --start-year 2006 --end-year 2024 --include-future
python -m polar_equinox_analysis solar-system --output web/public/data/solar-system.json
```

## NASA FIRMS active-fire detections

The FIRMS adapter uses real VIIRS/MODIS detections and never supplies demo hotspots. The official area API requires a personal MAP_KEY:

```bash
export NASA_FIRMS_MAP_KEY="your-official-key"
```

Without that secret, the public application continues to work with NASA EONET and clearly reports that pixel-level FIRMS access requires credentials.

## Scientific and operational limits

- Optical imagery can be blocked by cloud; a cloud-covered scene is not evidence that surface conditions did not change.
- Sentinel-1 SAR can provide important all-weather surface information but requires sensor-appropriate interpretation.
- Seasonal mismatch can create false change signals; matched-season comparisons are preferred.
- Satellite morphology can identify candidates, not automatically establish hydrological causation.
- Training success is not the same as environmental detection accuracy.
- GRACE/GRACE-FO estimates regional mass change, not fine-scale water in individual fractures or channels.
- Satellite-derived broad bathymetric structure is not equivalent to detailed multibeam sonar mapping.
- NASA EONET is an event catalogue, not an official emergency alert system.
- This research application must not replace instructions from emergency services.

See [data sources](docs/data-sources.md), [scientific limits](docs/science-and-limitations.md) and [privacy](docs/privacy.md).

## Validation

```bash
python -m ruff check .
python -m mypy polar_equinox_analysis terra_hazards terra_research_node tests
python -m pytest -q
cd web && npm test && npm run build
```

## License

MIT. Individual upstream datasets retain their own agency terms and attribution requirements.
