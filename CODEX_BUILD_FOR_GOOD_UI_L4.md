# Codex build brief — BUILD FOR GOOD / Terra Observation UI + L4 Research Sprint

## Mission
Modernize the existing Terra Observation System without deleting working science or the current interface. The old UI must remain accessible as a clearly labelled **Legacy / Classic Interface**. Build an evidence-first public Earth-observation application that helps communities, researchers, educators, NGOs and environmental responders inspect environmental change using legal, official and public data.

This is a BUILD FOR GOOD implementation. Preserve scientific honesty, privacy and provenance. Never fabricate measurements, satellite scenes, confidence scores or discoveries.

## Non-negotiable constraints
1. Work on the current branch. Do not rewrite the project from scratch.
2. Inspect existing code/tests before edits, especially `web/src/`, `web/index.html`, `docs/GLOBE_UI_AUDIT_2026-08-15.md`, `docs/experiment-016/training-plan.json`, `docs/sahara-station/`, `docs/arctic-90n/`, `docs/ocean-station/` and deployment workflows.
3. Preserve the currently corrected Cesium/WGS84 tiled globe behavior, LOD/cache behavior and scientific/fallback renderer separation.
4. Do not regress existing TEST 001–016, stations, Copernicus pages, hazard pages, forum or reports.
5. All new data integrations must use official/legal/public sources. No person tracking, private-data enrichment or surveillance features.
6. Never put API keys, secrets, tokens or `.env` files in Git. Add/retain ignore rules and secret-scan tests where appropriate.
7. The public GitHub Pages frontend must never contain an OpenAI API key. OpenAI API calls must run server-side/local-research-node only and read `OPENAI_API_KEY` from the environment.
8. Keep evidence classes explicit: OBSERVATION, DERIVED_VALUE, MODEL_ESTIMATE, HYPOTHESIS, UNKNOWN.
9. A visually suspected blocked inlet/outlet is **not** a confirmed blockage. Label it `flow_connectivity_candidate` / `possible_constriction` until independent hydrological evidence supports the cause.
10. Do not download complete satellite archives. Query STAC/catalogues, download only required scenes/assets/tiles, cache them, keep manifests and hashes.
11. Detect NVIDIA CUDA automatically. Prefer NVIDIA L4 when present; fall back to CPU without manual source-code changes.
12. The 1990–2026 study is a reproducible sampled research program, not a claim that every square meter of Earth was exhaustively analysed in one hour.

## Phase 0 — audit before editing
Create `docs/UI_AUDIT_BUILD_FOR_GOOD_2026-08.md` containing:
- current information architecture and duplicate navigation;
- broken/dead/duplicated links discovered by automated checks;
- mobile/responsive issues;
- globe lifecycle/zoom/marker/layer risks;
- station UX inconsistencies;
- data-size/performance risks (especially very large JSON assets);
- accessibility issues: keyboard, focus, reduced motion, contrast, labels;
- exact list of existing features that must remain reachable.

Add automated link/navigation regression tests so this audit can be repeated.

## Phase 1 — new modern interface
Replace the overloaded top-level navigation with a modern application shell while retaining all existing pages.

Target primary sections:
1. **Earth Live** — Cesium/WGS84 globe, timeline, satellite/source status.
2. **Hazards** — fires, floods and other existing hazard layers.
3. **Water & Climate** — hydrology, drought, lakes, river morphology.
4. **Research Stations** — Arctic 90°N, Sahara, Oceans as coherent station cards/workspaces.
5. **AI Area Lab** — polygon/rectangle AOI selection and research-job builder.
6. **Experiments & Findings** — TEST 001–016 and future experiments, searchable/filterable instead of 16 permanent top-level buttons.
7. **Methods & Sources** — provenance, limitations, privacy, data sources.
8. **Legacy UI** — preserve the previous interface/navigation in a dedicated route/view.

UI requirements:
- dark scientific/space visual language, clean typography, restrained glow, glass/panel depth;
- smooth transitions between sections but honor `prefers-reduced-motion`;
- desktop + Android/mobile layouts;
- keyboard navigation and visible focus;
- no transition may recreate or dispose the Cesium viewer unnecessarily;
- lazy-load heavy station/experiment modules;
- preserve URL/deep-link usability;
- loading skeletons, source/status badges, error boundaries;
- no fake “LIVE” state when a product is daily or delayed.

Do not hide science behind visual effects. Numeric result + source + observation date + evidence class remain more important than animation.

## Phase 2 — Research Stations redesign
Create a shared station design system so the three stations look related while keeping their specialized tools.

### Arctic 90°N
Add research cards for:
- Sun/Moon polar geometry and seasonal comparison;
- sea-ice/snow observation availability;
- cloud/temperature/wind source availability where public official data exists;
- time-series comparison with explicit source and resolution;
- clearly separated simulation vs observation.

### Sahara
Keep the existing DEM/sandbox and 1:1 material logic. Improve presentation and add research cards for:
- paleochannel candidate mapping;
- drainage/flow accumulation from DEM;
- surface-water recurrence;
- vegetation trend;
- matched-season comparison;
- uncertainty/false-positive review;
- cross-check candidates against known basins and official source metadata.

Never present speculative terraforming geometry as a validated engineering recommendation.

### Oceans
Improve the station around:
- GEBCO/bathymetry evidence availability;
- coastline/estuary change;
- sea-surface temperature and ocean-color source availability;
- earthquake/volcanic catalogue overlays where already supported by official feeds;
- clear limitation that satellite altimetry-derived bathymetry is not equivalent to multibeam sonar.

## Phase 3 — AI Area Lab frontend
Add a new `AI Area Lab` workspace integrated with the main globe.

AOI interaction:
- rectangle and polygon draw modes;
- clear/edit/undo selection;
- display area km² and bounding box;
- hard safety/performance limits for huge AOIs;
- export/import a small JSON research job;
- preset examples from existing TEST cases;
- no precise-person or address surveillance mode.

Analysis modes:
- `surface_water_change`
- `lake_shoreline_change`
- `river_width_and_channel_shift`
- `flow_connectivity_candidate`
- `dry_exposed_bed`
- `sandbar_sediment_change`
- `desertification_or_vegetation_stress`
- `paleochannel_candidate`
- `flood_extent_candidate`
- `glacier_snow_ice_change`
- `coastal_estuary_change`

The UI must show job state, data sources, date coverage, sensor limitations, cached/non-cached status and evidence class.

Because GitHub Pages is static, implement two honest modes:
1. **Public demo/read-only mode** — browses committed/precomputed reproducible findings and can compose/export an AOI job.
2. **Local GPU Research Node mode** — optional local backend for real analysis. It must clearly show CONNECTED/DISCONNECTED; never pretend a backend exists.

## Phase 4 — Local GPU Research Node
Implement a modular local service, preferably FastAPI unless the repo already has a better pattern.

Suggested package layout (adapt to repo conventions):
- `terra_research_node/api.py`
- `terra_research_node/device.py`
- `terra_research_node/jobs.py`
- `terra_research_node/provenance.py`
- `terra_research_node/analysis/water.py`
- `terra_research_node/analysis/rivers.py`
- `terra_research_node/analysis/desert.py`
- `terra_research_node/analysis/ice.py`
- `terra_research_node/openai_summary.py`

Endpoints should be minimal and local-first, for example health/device, submit job, job status/results. Restrict CORS to documented local/dev origins and the public project origin only if needed.

Device logic:
- detect PyTorch CUDA;
- record GPU name, CUDA version, VRAM, driver where available;
- if L4 is present use CUDA + mixed precision where safe;
- otherwise CUDA GPU or CPU fallback;
- log device selection; no crash just because GPU is unavailable.

## Phase 5 — reproducible 1990–2026 research protocol
Build a station-driven global comparison protocol. Do **not** claim full exhaustive Earth coverage in a one-hour run.

Use a deterministic benchmark manifest with geographically diverse AOIs and existing project cases. Include at minimum:
- existing Polish lake/river cases;
- Vistula Grudziądz–Gniew;
- Great Salt Lake;
- Aral Sea;
- Sahara/Tanezrouft or other documented arid/paleodrainage case;
- Himalaya/Tibetan Plateau terrain/hydrology case;
- one coastal/estuary case;
- one glacier/ice case;
- one control case expected to be relatively stable.

Historical data rules:
- use Landsat-family data for the long 1990–2026 record where suitable;
- use Sentinel-1/2 only for years they actually cover;
- compare matched seasons/month windows when possible;
- mask cloud/shadow/snow when needed;
- preserve acquisition IDs, dates, sensor, processing level, resolution, cloud metadata and source URL/catalog ID;
- never invent missing years. Record `no_suitable_observation`.

Official-source preference includes NASA, USGS, ESA/Copernicus/CDSE, NOAA, JPL, GEBCO and other already documented official project sources. Reuse existing source registries/adapters rather than duplicating them.

## Phase 6 — analysis and training logic
For water-change analysis, establish deterministic geospatial baselines first (water masks/indices, shoreline geometry, river width/centerline, exposed-bed/sediment segmentation) before ML claims.

Training requirements:
- inspect whether the repository has enough legitimate labels/masks for supervised training;
- if labels are insufficient, DO NOT fake a trained segmentation model. Run benchmark/inference and log that supervised training was skipped or limited;
- existing `paleoriver-tests/training_features.csv` is a tiny feature set and must not be represented as a global training dataset;
- if a lightweight model is trained, use train/validation/test separation by geography/time to reduce leakage;
- fixed seed, config snapshot, package versions, git SHA and model/checkpoint hash;
- log loss/metrics at intervals;
- save confusion metrics/IoU/F1 where labels make them meaningful;
- save failures and excluded scenes, not only successes.

Causal guardrail:
Satellite morphology can nominate a `flow_connectivity_candidate`; causal attribution such as “blocked outlet caused lake loss” requires independent hydrology (gauges/discharge, structures, DEM/bathymetry, groundwater or field evidence). Preserve this distinction in code, UI and reports.

## Phase 7 — one-hour NVIDIA L4 research sprint
Create a Windows PowerShell entrypoint, e.g. `scripts/run_l4_research.ps1`, and a Python runner. Required user-facing command after implementation:

```powershell
./scripts/run_l4_research.ps1 -DurationMinutes 60 -StartYear 1990 -EndYear 2026
```

The runner must:
- run for a wall-clock budget of about 60 minutes and stop cleanly at the budget boundary;
- prioritize diverse station-driven AOIs instead of trying to download Earth;
- resume from cache/manifests;
- save every run under `research_runs/<run_id>/`;
- continuously write machine-readable JSONL logs plus a readable log;
- write `device.json`, `config.json`, `source_manifest.json`, `scene_manifest.json`, `metrics.json`, `candidates.geojson`, `findings.json`, `failures.json`, and `report.md`;
- save plots/thumbnails only when generated from source data with provenance;
- record exact start/end time and whether the 60-minute budget completed normally;
- never commit raw secrets or huge raw scenes.

## Phase 8 — finding validation and publication gate
A “new fact” may be published only when the pipeline actually produced it from data. Never hard-code an exciting discovery in advance.

Use statuses:
- `candidate`
- `replicated_candidate`
- `supported_finding`
- `rejected_or_explained`
- `insufficient_evidence`

Publish to the site only a compact subset that meets a documented gate such as:
- reproducible run manifest;
- at least two suitable epochs;
- matched-season quality acceptable;
- source provenance complete;
- no obvious cloud/sensor artifact;
- geometry/metric repeatable;
- when practical cross-sensor or independent-source check;
- causal language remains a hypothesis unless independently supported.

Generate a public `docs/data/research/latest-findings.json` (or equivalent) from validated outputs. Never publish local paths, tokens or private metadata.

## Phase 9 — OpenAI API integration where it adds value
Use the OpenAI API for **evidence-grounded explanation/summarization**, not for inventing measurements.

Implement server-side/local-node summarization through the Responses API using the official OpenAI SDK. Input should be the structured finding, uncertainty, provenance summary and limitations; output should be a concise human-readable explanation with evidence class and explicit uncertainty.

Rules:
- read `OPENAI_API_KEY` only from environment;
- if key is absent, the scientific pipeline still works and produces deterministic reports;
- no browser-side secret;
- no API response can overwrite measured geometry/metrics;
- log model ID and request metadata needed for reproducibility, but never secret material;
- add tests with mocked API responses, no paid calls in CI.

## Phase 10 — BUILD FOR GOOD README / submission readiness
Update README with clear sections:
- What we built
- Who it helps
- How it will be used
- How Codex helped
- How to run it
- Data sources and scientific limitations
- Privacy and safety
- Local L4 Research Sprint
- OpenAI API integration
- Demo link

Emphasize practical beneficiaries: communities monitoring water availability, researchers/educators, environmental NGOs and public-interest responders. Do not claim official emergency-authority status.

## Phase 11 — quality gates
Before declaring the work complete, run all relevant checks and fix failures caused by this change:

```text
python -m ruff check .
python -m mypy polar_equinox_analysis terra_hazards tests
python -m pytest -q
cd web
npm ci
npm test
npm run build
```

Also add focused tests for:
- new navigation + Legacy route;
- every existing TEST 001–016 still reachable;
- three research stations reachable;
- reduced-motion behavior;
- AOI geometry serialization/validation;
- scientific evidence-class labels;
- GPU/CPU device fallback;
- log/provenance schema;
- publication gate;
- OpenAI API disabled-without-key behavior;
- no secret in built frontend.

If browser automation already exists, add a smoke test for desktop and mobile viewport. Do not add a heavyweight framework solely for one screenshot unless justified.

## Final Codex deliverable
At the end:
1. print a concise audit summary;
2. list changed files;
3. report tests/build status;
4. state exactly what remains unverified;
5. show the PowerShell command for the 60-minute L4 sprint;
6. do not claim the sprint discovered anything until it has actually run on real data;
7. leave the worktree in a reviewable state on `agent/build-for-good-ui-l4`.
