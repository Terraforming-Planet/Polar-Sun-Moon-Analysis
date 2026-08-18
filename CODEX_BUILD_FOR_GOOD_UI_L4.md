# Codex build brief v2 — BUILD FOR GOOD / English Terra Observation UI + L4 Research Sprint + Earth–Space 512

## Mission
Modernize the existing Terra Observation System without deleting working science or the current interface. The old UI must remain accessible as a clearly labelled **Legacy / Classic Interface**. Build an evidence-first public Earth/space observation application that helps communities, researchers, educators, NGOs and environmental responders inspect environmental change using legal, official and public data.

**The entire public website must be English after this migration:** landing page, application tabs, every public subpage, TEST/experiment page, public report, research station, button, form label, status/error message, accessibility label, caption and navigation item. Preserve source-native proper nouns, mission/product names, catalogue IDs, scientific symbols and quoted/raw source material when translation would damage provenance.

This is a BUILD FOR GOOD implementation. Preserve scientific honesty, privacy and provenance. Never fabricate measurements, satellite scenes, confidence scores or discoveries.

Also add a fourth research station: **Earth–Space 512 Research Station**, based on the project's open-source 8×8×8 = 512 addressable-cell spatial model. Read and implement `docs/EARTH_SPACE_512_RESEARCH_STATION.md`.

## Non-negotiable constraints
1. Work on the current branch `agent/build-for-good-ui-l4`. Do not rewrite the project from scratch.
2. Inspect existing code/tests before edits, especially `web/src/`, `web/index.html`, public `docs/`, `docs/GLOBE_UI_AUDIT_2026-08-15.md`, `docs/experiment-016/training-plan.json`, `docs/sahara-station/`, `docs/arctic-90n/`, `docs/ocean-station/`, `docs/EARTH_SPACE_512_RESEARCH_STATION.md` and deployment workflows.
3. Preserve the currently corrected Cesium/WGS84 tiled globe behavior, LOD/cache behavior and scientific/fallback renderer separation.
4. Do not regress existing TEST 001–016, stations, Copernicus pages, hazard pages, forum or reports. They must remain reachable, but their public UI must be English.
5. All new data integrations must use official/legal/public sources. No person tracking, private-data enrichment or surveillance features.
6. Never put API keys, secrets, tokens or `.env` files in Git. Add/retain ignore rules and secret-scan tests where appropriate.
7. The public GitHub Pages frontend must never contain an OpenAI API key. OpenAI API calls must run server-side/local-research-node only and read `OPENAI_API_KEY` from the environment.
8. Keep evidence classes explicit: OBSERVATION, DERIVED_VALUE, MODEL_ESTIMATE, HYPOTHESIS, UNKNOWN.
9. A visually suspected blocked inlet/outlet is **not** a confirmed blockage. Label it `flow_connectivity_candidate` / `possible_constriction` until independent hydrological evidence supports the cause.
10. Do not download complete satellite archives. Query STAC/catalogues, download only required scenes/assets/tiles, cache them, keep manifests and hashes.
11. Detect NVIDIA CUDA automatically. Prefer NVIDIA L4 when present; fall back to another CUDA GPU or CPU without manual source-code changes.
12. The 1990–2026 study is a reproducible sampled research program, not a claim that every square meter of Earth was exhaustively analysed in one hour.
13. Keep all public navigation/routes stable where practical; if routes change, add redirects/compatibility links.
14. Do not translate scientific data values, IDs, mission names, catalogue IDs, URLs or source-native proper nouns merely to satisfy language checks.
15. Every user-visible string introduced or retained on public pages must be English unless it is a source quotation/name that must remain original.

# Phase 0 — full audit before editing
Create/update `docs/UI_AUDIT_BUILD_FOR_GOOD_2026-08.md` containing:
- current information architecture and duplicate navigation;
- all public routes/pages generated or copied to GitHub Pages;
- broken/dead/duplicated links discovered by automated checks;
- mobile/responsive issues;
- globe lifecycle/zoom/marker/layer risks;
- station UX inconsistencies;
- data-size/performance risks (especially large JSON assets and cache-busting refreshes);
- accessibility issues: keyboard, focus, reduced motion, contrast, labels;
- exact list of existing features that must remain reachable;
- a **language inventory** identifying every public page/string source still containing Polish UI text.

Add automated link/navigation regression tests so this audit can be repeated.

# Phase 1 — complete English public-site migration
Translate the **website, not only documentation summaries**.

Required scope includes, at minimum:
- `web/index.html` and all React UI strings under `web/src/`;
- every public static HTML page under `docs/` or other deployment source directories;
- all navigation menus and cards;
- TEST/experiment 001–016 public pages;
- Arctic 90°N station;
- Sahara station;
- Ocean station;
- Copernicus/flood/hazard/research/forum public UI where stored in this repository;
- public reports rendered as website content;
- image `alt` text, `aria-label`, form labels, validation text, loading states and error states;
- public JSON fields that are directly rendered as UI copy, when safe to translate without changing scientific identifiers/provenance.

Translation rules:
- write natural technical/scientific English, not word-for-word machine-like English;
- preserve data meaning, units and evidence classes;
- preserve Polish geographic proper names where they are official names, optionally add an English description in parentheses when useful;
- do not translate source URLs, dataset IDs, acquisition IDs, satellite/mission names or raw source payloads;
- do not alter numerical results during translation;
- never silently drop content because it is difficult to translate.

Create `scripts/audit_public_language.py` (or equivalent) that scans the actual public-site source/build for likely Polish UI remnants. It must:
- inspect deployable HTML/JS/TSX/JSON/Markdown used as public site content;
- support an explicit allowlist for proper nouns/source quotations/raw data;
- fail CI when clearly user-facing Polish UI strings remain outside the allowlist;
- print file + line/string context;
- avoid false claims that a page is English merely because it lacks Polish diacritics.

After build, run the language audit against the generated public output too.

# Phase 2 — new modern interface
Replace the overloaded top-level navigation with a modern application shell while retaining all existing pages.

Target primary sections:
1. **Earth Live** — Cesium/WGS84 globe, timeline, satellite/source status.
2. **Hazards** — fires, floods and other existing hazard layers.
3. **Water & Climate** — hydrology, drought, lakes, river morphology.
4. **Research Stations** — Arctic 90°N, Sahara, Oceans, Earth–Space 512.
5. **AI Area Lab** — polygon/rectangle AOI selection and research-job builder.
6. **Experiments & Findings** — TEST 001–016 and future experiments, searchable/filterable instead of permanent top-level buttons.
7. **Methods & Sources** — provenance, limitations, privacy, data sources.
8. **Legacy UI** — preserve previous interface/navigation in a dedicated route/view, translated to English as public UI.

UI requirements:
- dark scientific/space visual language, clean typography, restrained glow, glass/panel depth;
- smooth transitions between sections but honor `prefers-reduced-motion`;
- desktop Windows + Android/mobile layouts;
- keyboard navigation and visible focus;
- no transition may recreate or dispose the Cesium viewer unnecessarily;
- lazy-load heavy station/experiment modules;
- preserve URL/deep-link usability;
- loading skeletons, source/status badges, error boundaries;
- no fake “LIVE” state when a product is daily or delayed;
- source date, resolution/latency where known, evidence class and uncertainty remain visible.

Do not hide science behind visual effects. Numeric result + source + observation date + evidence class remain more important than animation.

# Phase 3 — Research Stations redesign
Create a shared station design system so all four stations look related while keeping specialized tools.

## Arctic 90°N
Add/improve research cards for:
- Sun/Moon polar geometry and seasonal comparison;
- sea-ice/snow observation availability;
- cloud/temperature/wind source availability where public official data exists;
- time-series comparison with explicit source and resolution;
- clearly separated simulation vs observation.

Translate all station UI to English.

## Sahara
Keep existing DEM/sandbox and 1:1 material logic. Improve presentation and add research cards for:
- paleochannel candidate mapping;
- drainage/flow accumulation from DEM;
- surface-water recurrence;
- vegetation trend;
- matched-season comparison;
- uncertainty/false-positive review;
- cross-check candidates against known basins and official source metadata.

Never present speculative terraforming geometry as a validated engineering recommendation. Translate all public station UI to English.

## Oceans
Improve the station around:
- GEBCO/bathymetry evidence availability;
- coastline/estuary change;
- sea-surface temperature and ocean-color source availability;
- earthquake/volcanic catalogue overlays where already supported by official feeds;
- clear limitation that satellite altimetry-derived bathymetry is not equivalent to multibeam sonar.

Translate all public station UI to English.

## Earth–Space 512 Research Station
Implement `docs/EARTH_SPACE_512_RESEARCH_STATION.md` as a real public research station and navigation destination.

Core model:
- exactly **8 × 8 × 8 = 512 top-level addressable cells**;
- stable cell IDs + numeric index + x/y/z coordinate;
- eight selectable layers;
- transparent research cube with Earth-centered and sky-direction modes;
- click/hover cell selection and cell inspector;
- per-cell provenance, time, evidence class and uncertainty when scientific data is attached;
- optional local refinement/LOD without pretending the base grid has more than 512 top-level cells;
- never represent the cells as physical sensors unless a real instrument is explicitly mapped to them.

Required modes:
1. Near-Earth Orbit context.
2. Earth–Moon geometry.
3. Observer/sky-direction mode.
4. Solar/space-weather context.

Research topics:
- Earth–Sun–Moon verified geometry;
- eclipse/shadow/illumination geometry;
- selected NEO/small-body context from official sources;
- NOAA/NASA/ESA space-weather context where public official feeds exist;
- selected public scientific satellite/mission trajectories where authoritative data is legally/publicly available;
- observer location/time, horizon, azimuth/altitude and FOV/cell intersections.

Source preference:
- NASA JPL Horizons;
- NASA/JPL CNEOS / Small-Body Database where relevant;
- NOAA Space Weather Prediction Center;
- NASA DONKI;
- ESA official NEO/space-weather sources where public and appropriate;
- existing official source registries in the project.

Do not substitute a random TLE feed or community mirror for an official/authoritative source without clearly documenting provenance and limitations.

ES512 training/evaluation:
- map verified vectors/trajectories to correct cell sequences;
- exact cell-address accuracy;
- trajectory-cell intersection accuracy;
- observer FOV-to-cell accuracy;
- temporal consistency;
- distinguish angular-bin mode from physical-volume mode;
- compare coarse 512-cell reasoning with continuous source coordinates;
- never create synthetic labels and then present them as observations.

Visual requirement: scientific descendant of the project's open-source 512-cell cube/chess concept, not a literal chess game. Reuse the corrected Earth renderer/lifecycle where appropriate.

# Phase 4 — AI Area Lab frontend
Add a new `AI Area Lab` workspace integrated with the main globe.

AOI interaction:
- rectangle and polygon draw modes;
- clear/edit/undo selection;
- display area km² and bounding box;
- hard safety/performance limits for huge AOIs;
- export/import a small JSON research job;
- preset examples from existing TEST cases;
- no precise-person/address surveillance mode.

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
1. **Public demo/read-only mode** — browses committed/precomputed reproducible findings and composes/exports an AOI job.
2. **Local GPU Research Node mode** — optional local backend for real analysis. It must clearly show CONNECTED/DISCONNECTED; never pretend a backend exists.

# Phase 5 — Local GPU Research Node
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
- `terra_research_node/analysis/space512.py`
- `terra_research_node/openai_summary.py`

Endpoints should be minimal/local-first: health/device, submit job, job status/results. Restrict CORS to documented local/dev origins and the public project origin only if needed.

Device logic:
- detect PyTorch CUDA;
- record GPU name, CUDA version, VRAM, driver where available;
- if NVIDIA L4 is present use CUDA + mixed precision where scientifically/numerically safe;
- otherwise another CUDA GPU or CPU fallback;
- log device selection; no crash just because GPU is unavailable.

# Phase 6 — reproducible 1990–2026 Earth research protocol
Build a station-driven global comparison protocol. Do **not** claim full exhaustive Earth coverage in a one-hour run.

Use a deterministic benchmark manifest with geographically diverse AOIs and existing project cases. Include at minimum:
- existing Polish lake/river cases;
- Vistula Grudziądz–Gniew;
- Great Salt Lake;
- Aral Sea;
- Sahara/Tanezrouft or another documented arid/paleodrainage case;
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
- never invent missing years; record `no_suitable_observation`.

Official-source preference includes NASA, USGS, ESA/Copernicus/CDSE, NOAA, JPL, GEBCO and already documented official project sources. Reuse existing source registries/adapters rather than duplicating them.

# Phase 7 — analysis and training logic
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

# Phase 8 — one-hour NVIDIA L4 research sprint
Create/maintain Windows PowerShell entrypoint `scripts/run_l4_research.ps1` and a Python runner.

Required user-facing research command after implementation:

```powershell
./scripts/run_l4_research.ps1 -DurationMinutes 60 -StartYear 1990 -EndYear 2026
```

The runner must:
- run for a wall-clock budget of about 60 minutes and stop cleanly at the budget boundary;
- prioritize diverse station-driven AOIs instead of trying to download Earth;
- include deterministic ES512 geometry/indexing tests in the run without stealing the majority of Earth-analysis time;
- resume from cache/manifests;
- save every run under `research_runs/<run_id>/`;
- continuously write machine-readable JSONL logs plus a readable log;
- write `device.json`, `config.json`, `source_manifest.json`, `scene_manifest.json`, `metrics.json`, `candidates.geojson`, `findings.json`, `failures.json`, and `report.md`;
- save plots/thumbnails only when generated from source data with provenance;
- record exact start/end time and whether the 60-minute budget completed normally;
- never commit raw secrets or huge raw scenes.

# Phase 9 — finding validation and publication gate
A “new fact” may be published only when the pipeline actually produced it from data. Never hard-code an exciting discovery in advance.

Use statuses:
- `candidate`
- `replicated_candidate`
- `supported_finding`
- `rejected_or_explained`
- `insufficient_evidence`

Publish to the site only a compact subset that meets a documented gate:
- reproducible run manifest;
- at least two suitable epochs for Earth-change findings;
- matched-season quality acceptable;
- source provenance complete;
- no obvious cloud/sensor artifact;
- geometry/metric repeatable;
- when practical cross-sensor or independent-source check;
- causal language remains hypothesis unless independently supported.

Generate public compact findings JSON from validated outputs. Never publish local paths, tokens or private metadata. All human-facing finding text must be English.

# Phase 10 — OpenAI API integration where it adds value
Use the OpenAI API for **evidence-grounded explanation/summarization**, not for inventing measurements.

Implement server-side/local-node summarization using the official OpenAI SDK. Input: structured finding, uncertainty, provenance summary and limitations. Output: concise English explanation with evidence class and explicit uncertainty.

Rules:
- read `OPENAI_API_KEY` only from environment;
- if key is absent, scientific pipeline still works and produces deterministic reports;
- no browser-side secret;
- no API response may overwrite measured geometry/metrics;
- log model ID and non-secret request metadata needed for reproducibility;
- add tests with mocked API responses, no paid calls in CI.

# Phase 11 — BUILD FOR GOOD README / submission readiness
Update README with clear English sections:
- What we built
- Who it helps
- How it will be used
- How Codex helped
- How to run it
- Data sources and scientific limitations
- Privacy and safety
- Local NVIDIA L4 Research Sprint
- Earth–Space 512 Research Station
- OpenAI API integration
- Demo link

Emphasize practical beneficiaries: communities monitoring water availability, researchers/educators, environmental NGOs and public-interest responders. Do not claim official emergency-authority status.

# Phase 12 — performance/data architecture cleanup
Address the current anti-cache/large-JSON risk. Do not repeatedly fetch a monolithic hazard catalogue with cache-busting when a small manifest/index and on-demand category/layer fetch can serve the UI.

Requirements:
- small status/latest manifest;
- split large layers/data by domain/category/time where justified;
- browser caching with explicit freshness metadata;
- request cancellation/deduplication;
- load only visible/selected layers;
- keep existing scientific behavior and data freshness honest.

# Phase 13 — quality gates
Before declaring work complete, run/fix all relevant checks:

```text
python -m ruff check .
python -m mypy polar_equinox_analysis terra_hazards tests
python -m pytest -q
python scripts/audit_public_language.py
cd web
npm ci
npm test
npm run build
```

Then run the language audit against the actual generated/deployable public build as supported by the implementation.

Also add focused tests for:
- new navigation + Legacy route;
- every existing TEST 001–016 still reachable;
- all four research stations reachable;
- public site English-language gate;
- reduced-motion behavior;
- AOI geometry serialization/validation;
- scientific evidence-class labels;
- GPU/CPU device fallback;
- log/provenance schema;
- publication gate;
- OpenAI API disabled-without-key behavior;
- no secret in built frontend;
- ES512 exactly 512 top-level cells;
- ES512 stable unique addressing for all 512 cells;
- ES512 vector/trajectory-to-cell intersection tests;
- ES512 coordinate-mode labels and scale are explicit;
- no claim that ES512 cells are physical sensors;
- deep links to existing pages remain valid.

If browser automation already exists, add smoke tests for Windows/desktop and mobile viewport. Do not add a heavyweight framework solely for one screenshot unless justified.

# Final Codex deliverable
At the end:
1. print a concise audit summary;
2. list changed files;
3. report tests/build/language-audit status;
4. explicitly report any public page still not translated and why;
5. report ES512 implementation status and verify exactly 512 top-level cells;
6. state exactly what remains unverified;
7. show the PowerShell command for the real 60-minute L4 sprint;
8. do not claim the sprint discovered anything until it actually ran on real data;
9. leave the worktree reviewable on `agent/build-for-good-ui-l4`;
10. do not merge while CI is red.
