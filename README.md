<img width="1672" height="941" alt="37964" src="https://github.com/user-attachments/assets/c44d0a5e-2424-456a-aae1-515b0ecb9102" />

# Terra Observation System

**BUILD FOR GOOD — open Earth observation for protecting water, land, agriculture and communities with real public satellite data.**

## BUILD FOR GOOD in one minute

- **What we built:** an open-source Earth-observation platform that combines official/public satellite and scientific data, a global interactive 3D Earth, reproducible environmental analysis, documented NVIDIA L4 GPU research and a guarded OpenAI Evidence / Research Explainer.
- **Who it helps:** communities, farmers and water managers, educators, students, researchers, NGOs, environmental teams and open-source developers who need clearer evidence about water, rivers, drylands and environmental change.
- **Real GPU work:** the project includes published NVIDIA L4 training/evaluation runs, including a streaming NASA GIBS run that processed **200,016 geospatial/time windows across 75 research regions**. These are training/evaluation facts, not environmental ground truth.
- **How OpenAI helps:** OpenAI explains a fixed, server-selected evidence bundle in four fields — summary, why it matters, uncertainty and next checks — without replacing the underlying measurements or inventing causes.
- **Long-term public-good goal:** help people recognize and investigate water loss, changing river and lake systems, drylands, paleochannels and environmental hazards earlier so communities can make better decisions about restoration, preparedness and protection of life, homes, farmland, infrastructure and water resources.
- **Scientific rule:** satellite observations and deterministic analysis produce evidence; AI helps interpret and prioritize it. Training success is never presented as proof of a real environmental event, and the project does not claim exact-time-and-place earthquake prediction.

**Live demo:** <https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/>  
**Public repository:** <https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis>

## Final contest demo hardening — 22 August 2026

The public BUILD FOR GOOD path has a final reliability layer focused on the problems that matter most during a short judge review:

- **official satellite-image streaming:** browser cards for NASA GIBS, Copernicus/CDSE and USGS Landsat use the allowlisted Cloudflare Evidence Worker `/research/image` stream when configured; the Worker forwards official upstream image bytes and preserves source/provenance headers instead of generating replacement pixels;
- **black-frame protection:** NASA GIBS display avoids the newest two UTC days, and the browser can retry earlier official daily observations when a loaded frame is effectively black;
- **bounded galleries:** **Simple mode shows up to 4 satellite images** and **Advanced mode up to 8**; OpenAI visual inspection is independently bounded to 4 quick / 8 deep Worker-preflighted images;
- **English contest UI:** the main public application declares English and applies an English UI pass to dynamically rendered content and same-origin embedded research/station tabs;
- **Terrain laboratory reliability:** the merged Terrain laboratory work provides explicit loading/ready/fallback/error states, DEM/elevation tools and public-data river-flow direction arrows instead of leaving a permanent black viewer;
- **scientific integrity remains unchanged:** unavailable imagery stays unavailable, hypotheses stay hypotheses, and OpenAI does not replace deterministic measurements.

Final audit: [`docs/BUILD_FOR_GOOD_FINAL_AUDIT_2026-08-22.md`](docs/BUILD_FOR_GOOD_FINAL_AUDIT_2026-08-22.md)  
Ready-to-paste Discord submission: [`docs/BUILD_FOR_GOOD_DISCORD_SUBMISSION.md`](docs/BUILD_FOR_GOOD_DISCORD_SUBMISSION.md)

## Terraforming Planet — short mission

**Terraforming Planet** is an open research initiative focused on understanding how water, terrain and environmental systems change — and how better observation can help people restore damaged landscapes instead of reacting only after the damage is visible on the ground.

A long-term goal is to study **deserts, drylands and ancient river systems** to understand where water once flowed, where it is disappearing today, and where future restoration, water retention or carefully planned agriculture may be physically possible. The project does not assume that every desert can or should be converted to farmland. It aims to provide evidence that can help researchers decide where intervention may be realistic, safe and environmentally responsible.

## Why Terra Observation System matters

Terra Observation System is being built to help answer practical questions such as:

- Where are **lakes, ponds and wetlands losing visible surface water**?
- Where has a **river channel narrowed, shifted, fragmented or become blocked by sediment or other obstacles**?
- Where can historical imagery reveal **old riverbeds, paleochannels and former water routes** that deserve field or hydrological investigation?
- Which dryland areas may have enough water, terrain and soil potential to justify future research into **agriculture, retention or landscape restoration**?
- Which areas show conditions associated with **flood risk, drought, wildfire, landslides, coastal change or other hazards**?
- Can multiple official datasets help identify **risk indicators** before a disaster causes loss of life, homes, farms or infrastructure?

The project combines official/public Earth-observation data, deterministic measurements, NVIDIA L4 training and evaluation, an interactive 3D Earth, reproducible evidence records and a guarded OpenAI **Evidence / Research Explainer**.

The central rule is simple: **satellites and deterministic analysis produce the evidence; AI helps people understand, compare and prioritize it.** OpenAI never replaces measurements, source metadata or scientific verification.

## Public-good vision

The most important use case is **water and land resilience**.

If a lake is shrinking, a pond disappears, a river changes course or a historical channel becomes disconnected, the system should help researchers find that change early, compare it with older observations and determine what needs to be investigated next. In the future, the same architecture can support large-scale studies of drylands and former river networks to help identify places where water retention, channel restoration or agriculture may be worth testing.

The hazard side is equally important. Better satellite and environmental monitoring can support earlier recognition of areas exposed to **flooding, drought, wildfire, landslides, volcanic activity, severe storms and other hazards**. For earthquakes, the project can in future combine public seismic catalogues, ground-deformation products and other scientific indicators to support **risk research and anomaly review**. It must not claim that AI can currently predict the exact place and time of an earthquake.

The goal is practical: **give people more time and better evidence before environmental damage or a natural hazard costs lives, destroys homes, damages farms or wipes out years of work and savings.**

## Live demo and public repository

- **Live application:** <https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/>
- **Public GitHub repository:** <https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis>

## BUILD FOR GOOD submission summary

Terra Observation System helps communities, researchers, educators, NGOs and environmental responders investigate environmental change using legal, official and publicly available Earth-observation data. Its primary use cases are the long-term study of **drying lakes, disappearing ponds, river morphology, water connectivity, desert hydrology, old river systems and environmental hazards**.

Instead of asking an AI model to guess what happened, the system first collects and processes satellite/public-source evidence, preserves dates and provenance, and computes reproducible metrics. NVIDIA L4 training helps develop and evaluate the image-processing pipeline. The OpenAI Responses API is then used as a final explanation layer over structured findings, training/evaluation artifacts and real-data test results.

## What we built

The project currently combines:

- an interactive 3D Earth for environmental and satellite context;
- water, lake, river, wetland, terrain and environmental-change research workflows;
- desert, dryland and paleochannel research for studying former and present water pathways;
- multi-year and multi-region Earth-observation experiments;
- official/public data integrations including NASA, NASA GIBS, NASA EONET/FIRMS, ESA/Copernicus/CDSE, USGS, NOAA and other documented sources;
- reproducible manifests, timestamps, hashes, source references and evidence classes;
- NVIDIA L4 GPU training and streaming research pipelines;
- published L4 training reports with explicit limitations and reproducibility information;
- an OpenAI-powered Evidence / Research Explainer grounded in already-produced scientific artifacts;
- environmental hazard monitoring and a framework that can grow toward flood, drought, wildfire, landslide, storm, volcanic and seismic-risk research;
- Arctic, Sahara, Ocean and Earth–Space research stations;
- NASA JPL Horizons astronomy/polar research as an additional scientific module;
- privacy safeguards and no person tracking.

For BUILD FOR GOOD, the main story is **Earth, water, land restoration and community protection**. The astronomy and Earth–Space modules remain part of the wider research platform, but they are not the primary example of community impact.

## The problem we want to help solve

Satellite archives contain decades of evidence, but turning those observations into something useful for a local community, student, NGO or researcher is difficult. A person may notice that a pond has disappeared, a lake shoreline has retreated, a river contains more exposed sediment than decades ago or an old channel is no longer carrying water, but visual inspection alone does not establish the magnitude or cause of that change.

Terra Observation System is designed to make that process more rigorous:

1. locate the area of interest;
2. collect comparable public satellite observations;
3. preserve acquisition date, source, sensor and provenance;
4. derive water masks, shoreline/channel measurements, exposed-bed metrics or other documented indicators;
5. compare matched periods where possible;
6. identify old river routes, paleochannels or landscape features that deserve additional hydrological investigation;
7. label the result by evidence class;
8. use GPU/AI tooling to improve analysis and evaluate the pipeline;
9. explain the verified result in language that non-specialists can understand;
10. state clearly what additional evidence would be required before claiming a physical cause or recommending intervention.

A visually suspected obstruction or constriction is therefore recorded as a `flow_connectivity_candidate` or `possible_constriction`, **not** as proof that an outlet is blocked. Confirming cause can require discharge records, DEM/bathymetry, hydraulic structures, groundwater information, rainfall history or field inspection.

For desert and agricultural research, satellite evidence may help identify former drainage, water-retention opportunities, soil/vegetation signals and terrain constraints. Any real agricultural or restoration proposal would still require field hydrology, soil science, ecology, water-balance analysis and local legal/environmental review.

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
- structured logs cross-check the window counts, content hashes and failures.

The 75-region program includes water and climate cases such as the **Aral Sea, Lake Chad, Lake Mead, Great Salt Lake, Lake Kuchnia / forest pond, Vistula Grudziądz–Gniew, Nogat / Vistula Delta, Okavango Delta, wetlands, glaciers, deserts and control areas**.

Crucially, the report also states what the run did **not** establish: 200,016 training windows are not 200,016 independent satellite scenes, and training alone is not a before/after environmental measurement. Real environmental findings require a separate reproducible analysis stage.

Published report and structured evidence:

- <https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/published/training-runs/stream_gibs_20260820T013036Z/>
- [`docs/published/training-runs/stream_gibs_20260820T013036Z/analysis.json`](docs/published/training-runs/stream_gibs_20260820T013036Z/analysis.json)

That distinction is intentional. For BUILD FOR GOOD, **scientific honesty is part of the product**.

## A real-data example: Vistula Test 014

The repository also contains a long-range Vistula test covering the Gniew–Grudziądz reach. Its validated integrity index contains **74 records, of which 72 are accepted**, spanning **1990–2026**, with spring/autumn sampling and per-record provenance such as observation date, satellite platform, product/item identifier, SHA-256 and perceptual hash.

For the OpenAI integration we added a compact structured context derived from that real test metadata:

[`docs/evidence/test-014-vistula-real-data-context.json`](docs/evidence/test-014-vistula-real-data-context.json)

This context deliberately carries:

- `environmental_finding_claim: false`
- `water_loss_claim: false`
- `causal_claim: false`

That means OpenAI can understand that the Vistula test has real, provenance-checked satellite observations **without being allowed to invent a water-loss measurement or blockage conclusion before the dedicated analysis stage produces one**.

## Who it helps

Terra Observation System is designed for:

- **local communities** trying to understand visible changes in nearby lakes, ponds, rivers, wetlands or drylands;
- **farmers, land and water managers** who may benefit from better long-term information about water availability, flood exposure, drainage and landscape change;
- **educators and students** learning Earth observation, hydrology, climate science and uncertainty;
- **researchers and citizen scientists** who need transparent provenance and reproducible comparisons;
- **NGOs and environmental organizations** reviewing water loss, drought, desertification, river change, floods, fires and ecosystem stress;
- **environmental and emergency-response professionals** who need rapid context from official public sources;
- **open-source developers** building transparent tools for environmental protection and the common good.

The application is research and educational software. It does not replace official emergency warnings, professional field/hydrological assessment or authoritative earthquake forecasting/seismic-hazard services.

## How it will be used — and how it is already used

A practical water-loss or river-restoration workflow can look like this:

1. choose a lake, pond, river reach, wetland, dryland basin or AOI;
2. retrieve historical and recent observations from official/public sources;
3. use matched seasons and quality filters where possible;
4. compute water-area, shoreline, channel, exposed-bed or morphology metrics;
5. save the source dates, sensor information, hashes and analysis configuration;
6. compare the result with previous tests and relevant L4 training/evaluation artifacts;
7. classify the evidence as `OBSERVATION`, `DERIVED_VALUE`, `MODEL_ESTIMATE`, `HYPOTHESIS` or `UNKNOWN`;
8. identify locations that deserve hydrological, geological, agricultural or field verification;
9. optionally send that **structured evidence bundle** to the OpenAI Evidence Explainer;
10. show users a clear explanation of what changed, why it may matter, what remains uncertain and what should be checked next.

This creates a path from **satellite data → reproducible measurement → GPU research → understandable evidence → better human decisions**, instead of satellite image → unsupported AI claim.

## Future hazard and resilience research

The same evidence-first architecture can be extended to additional public-good problems:

- **floods** — combine rainfall, river level, topography, soil moisture, flood history and satellite observations to identify elevated-risk areas and changing floodplains;
- **drought and desertification** — monitor surface water, vegetation, soil-moisture proxies and long-term land change;
- **wildfires** — use official active-fire, thermal and burn-scar products;
- **landslides** — combine terrain, rainfall and ground-change indicators;
- **storms and coastal hazards** — monitor storm systems, coastal flooding and shoreline change;
- **volcanic activity** — use official alerts plus thermal/deformation products where available;
- **earthquake-risk research** — examine public seismic catalogues, known faults, ground-deformation measurements and other validated indicators.

AI can help compare many datasets and flag areas that deserve expert attention. For floods and some weather-related hazards, earlier identification can directly improve preparedness. For earthquakes, **current science cannot reliably predict the exact time and location of a future earthquake**, so Terra Observation System must present seismic outputs as risk indicators, anomalies or research hypotheses — never guaranteed predictions.

The public-good objective is still substantial: better situational awareness and earlier investigation can help communities protect **life, homes, infrastructure, farmland, water resources and personal property**.

## How the OpenAI API adds value

The OpenAI integration lives in [`terra_research_node/openai_summary.py`](terra_research_node/openai_summary.py).

The **Evidence / Research Explainer** uses the OpenAI Responses API after the scientific and training pipelines have produced structured artifacts. It can receive three evidence layers in one request:

1. **Primary finding** — for example, a measured surface-water or river-channel change;
2. **L4 training/evaluation context** — structured metrics from GPU runs such as Training #2 or Training #3;
3. **Real-data test context** — structured results or integrity/evaluation records from tests performed on real public satellite observations.

The API returns four human-readable fields:

- `summary`
- `why_it_matters`
- `uncertainty`
- `next_checks`

### Why this is useful

A community user should not need to understand WMS windows, SHA-256 provenance, CUDA training logs, segmentation metrics and hydrological caveats just to understand a result. OpenAI can translate that evidence into a clear explanation **without changing the underlying measurements**.

For example, if a dedicated real-data analysis later measures reduced mapped surface water in a lake, while L4 evaluation shows how the pipeline was trained and the Vistula/Landsat integrity records show the provenance of comparable observations, OpenAI can explain the combined evidence and recommend verification steps. It may **not** turn successful training or visual morphology into a claim that a lake dried because of a blocked river.

In future hazard modules, OpenAI can perform the same explanatory role: combine structured outputs from deterministic models and official sources into a concise public-facing explanation of **what is known, what is uncertain, who may be affected and what should be checked next**. It is not an emergency authority and must not invent alerts.

### Guardrails

- OpenAI does **not** create satellite measurements;
- OpenAI does **not** invent dates, source URLs, acquisition IDs, environmental events or missing observations;
- L4 loss/throughput metrics are never treated as environmental ground truth;
- OpenAI does **not** promote a candidate into a confirmed cause;
- OpenAI does **not** claim deterministic earthquake prediction;
- original evidence classes and explicit `false` / `UNKNOWN` claim flags remain part of the input;
- deterministic results remain usable when OpenAI is disabled;
- if `OPENAI_API_KEY` is missing, the explainer fails clearly instead of producing a fake result.

The default API model is `gpt-5.6-luna`, selected for a cost-conscious explanation task, and can be overridden with `OPENAI_MODEL`.

Example using the real published L4 Training #3 analysis and the real Vistula Test 014 context:

```bash
export OPENAI_API_KEY="your-key-from-your-secure-environment"
python -m terra_research_node.openai_summary \
  path/to/water-or-river-finding.json \
  --training-context docs/published/training-runs/stream_gibs_20260820T013036Z/analysis.json \
  --test-context docs/evidence/test-014-vistula-real-data-context.json \
  --output explanation.json
```

The primary finding must still come from a real deterministic analysis. The L4 and Test 014 artifacts provide grounded context; they do not manufacture the missing measurement.

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

These modules broaden the scientific platform, but the BUILD FOR GOOD environmental use case is centered on **Earth observation, water, drylands, hazards and environmental change**.

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

Run the OpenAI Evidence Explainer with the real L4 and Vistula context:

```bash
export OPENAI_API_KEY="your-key-from-your-secure-environment"
python -m terra_research_node.openai_summary \
  path/to/real-finding.json \
  --training-context docs/published/training-runs/stream_gibs_20260820T013036Z/analysis.json \
  --test-context docs/evidence/test-014-vistula-real-data-context.json
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
- Desert greening or agricultural suitability cannot be established from imagery alone; water balance, soil, ecology and field validation are required.
- Flood-risk indicators are not equivalent to an official warning.
- Current science does not support reliable exact-time-and-place earthquake prediction from satellite imagery or AI alone.
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
