# UI / architecture audit — BUILD FOR GOOD — 2026-08

Status: preliminary source audit before local browser/Codex regression pass.

## Executive result
The project already contains the important scientific core and many specialized pages. The main UX problem is not missing functionality; it is that too much functionality is exposed at once and several independently evolved station/test interfaces compete for the same top-level navigation.

The redesign should therefore preserve the corrected Earth renderer and existing research pages, then place them behind a coherent application shell instead of replacing the scientific core.

## What is already strong and should be preserved
- Active 3D Earth family is separated into Cesium/WGS84 scientific renderer plus explicit fallback/experimental renderers.
- Previous globe audit already corrected the full-globe cloud composition and stopped presenting regional GOES/Himawari discs as global coverage.
- NASA GIBS global imagery is treated as tiled imagery rather than one stretched planet texture.
- Evidence classes distinguish observation, derived value, estimate, hypothesis and unknown.
- TEST 016 already defines useful water/river/paleochannel labels and explicitly prevents a causal hypothesis from becoming training truth.
- Sahara station already separates scenario/sandbox geometry from claims about real hydrology and contains DEM/drainage/paleoriver work.
- Ocean station includes a provenance/knowledge registry and important limits on bathymetry and speculative claims.
- Existing test/navigation regression work protects TEST pages from accidentally disappearing during deployment.

## Priority findings

### P0 — overloaded duplicate navigation
`web/index.html` exposes TEST 001–016, three research stations, Copernicus tools, reports, constellation, multi-angle, investigation and forum in one permanent navigation block. The React application then adds its own separate primary tabs.

Impact:
- poor scanability on desktop;
- very high cognitive load on mobile;
- new features make the problem worse linearly;
- users do not know which links are primary workflows and which are historical experiments.

Fix:
- use 7–8 stable product sections;
- move TEST 001–016 into searchable/filterable Experiments & Findings;
- move stations into Research Stations;
- preserve the old navigation as Legacy / Classic Interface.

### P0 — keep renderer lifecycle stable while changing UI
The Earth renderer has recently been stabilized. A UI rewrite must not mount/unmount Cesium on every tab animation or route transition.

Fix:
- keep viewer lifecycle isolated from page-shell transitions;
- use lazy-loaded panels around a stable globe host;
- add lifecycle regression tests.

### P1 — data polling ignores browser cache
The generic JSON loader appends `refresh=<timestamp>` and some datasets are polled every 10 seconds. `web/public/data/hazards.json` is currently about 402 kB. If a browser really re-downloads that file every 10 seconds, the theoretical transfer is roughly 145 MB per hour for that one open view alone.

Fix:
- publish a very small freshness/index manifest;
- fetch large data only when its version/hash changes;
- use ETag/Last-Modified or versioned filenames where practical;
- split data by hazard category/time/region when the catalogue grows;
- pause refresh while document is hidden.

### P1 — `main.tsx` owns too many responsibilities
`web/src/main.tsx` is already a large file containing data fetching, timeline behavior, hazard filtering, Three.js polar visualization and the whole app composition.

Fix:
- extract route/workspace definitions, data hooks and station/feature panels;
- keep each API/source adapter independent;
- keep visual components free of source-specific request logic where possible.

### P1 — broad CSS selectors increase cross-page coupling
The main stylesheet uses broad selectors such as `header`, `nav`, `nav button`, `main` and `footer`. The project also contains separate topbars/navigation systems in standalone station pages.

Impact:
Future composition of pages/components can create unintended cascade conflicts.

Fix:
- scope the modern shell under `.terra-app` / component classes;
- use design tokens;
- avoid styling bare `nav`, `header`, `main` globally.

### P1 — station interfaces are not one product family yet
Arctic, Sahara and Ocean stations evolved as separate experiences. Sahara already has a rich standalone laboratory; Ocean uses a research registry; the main React application also has polar workspaces.

Fix:
- shared station header/card/status/source/evidence components;
- station-specific tool modules remain independent;
- consistent labels for Observation / Simulation / Hypothesis / Limitation.

### P1 — GitHub Pages cannot safely host an OpenAI secret
The public site is static. A browser-side OpenAI API key would violate security requirements.

Fix:
- public site supports precomputed findings and AOI job export;
- optional local GPU Research Node performs actual processing and OpenAI API summaries;
- key only from `OPENAI_API_KEY` environment variable;
- deterministic scientific result exists even if OpenAI API is disabled.

### P1 — AI must not overclaim river blockage causality
Satellite imagery can measure/derive shoreline position, open-water masks, channel width, centerline shift, exposed sediment and morphology. It usually cannot by itself prove that a specific blockage caused a lake-level decline.

Fix:
Use `flow_connectivity_candidate` / `possible_constriction` for visual morphology. Promote causal language only after independent hydrological evidence (gauge/discharge, structures, DEM/bathymetry, groundwater/field evidence) supports it.

### P1 — one-hour “global 1990–2026” run must be a benchmark, not fake exhaustive coverage
A real exhaustive global 36-year optical/radar analysis cannot be honestly completed as a one-hour desktop training run.

Fix:
- deterministic geographically diverse AOI benchmark;
- Landsat-family long record where suitable;
- Sentinel only for its actual mission years;
- matched-season sampling;
- scene manifests and cache;
- publish `no_suitable_observation` instead of inventing missing data.

### P2 — tiny paleoriver feature table is useful for tests, not enough for global supervised training
The existing Sahara `training_features.csv` contains a very small number of geographically diverse examples and simple image/color features.

Fix:
- keep it as a regression/feature prototype;
- do not market it as a trained global paleoriver model;
- supervised segmentation training runs only if legitimate masks/labels are found or created with a documented protocol;
- otherwise run deterministic baselines + candidate ranking and explicitly log that supervised training was skipped/limited.

### P2 — dependency reproducibility
`web/package.json` uses `latest` for the core frontend dependencies. The committed lockfile makes `npm ci` reproducible today, but regenerating the lock can introduce unrelated major-version changes.

Fix:
- after the redesign stabilizes, pin sensible compatible ranges/versions and update intentionally;
- continue to use `npm ci` in CI.

### P2 — accessibility and motion need to be first-class in the new shell
The current CSS already includes a reduced-motion rule, which is good, but the new animated UI must preserve it.

Required checks:
- keyboard-only navigation;
- visible focus;
- dialog/drawer focus management;
- correct labels for AOI drawing controls;
- `prefers-reduced-motion` removes nonessential movement;
- contrast review;
- Android/mobile touch targets;
- no information encoded only by color.

## Target information architecture
1. Earth Live
2. Hazards
3. Water & Climate
4. Research Stations
5. AI Area Lab
6. Experiments & Findings
7. Methods & Sources
8. Legacy UI

## AI Area Lab research contract
The AOI tool should create a compact, reproducible job containing:
- geometry and area;
- requested date range / matched-season rule;
- analysis modes;
- allowed official source families;
- maximum scene/tile budget;
- evidence requirements;
- run ID and configuration hash.

Outputs must retain provenance and uncertainty, not just a colored overlay.

## L4 run output contract
Each run should create a local run directory with at least:
- `device.json`
- `config.json`
- `source_manifest.json`
- `scene_manifest.json`
- `metrics.json`
- `candidates.geojson`
- `findings.json`
- `failures.json`
- machine-readable JSONL execution log
- readable `report.md`

Raw scenes/caches are local artifacts and should not be committed. Only compact validated public findings should be copied into the GitHub Pages data tree.

## Publication rule
Interesting is not enough. A public finding needs reproducibility, source provenance, acceptable scene quality and an evidence status. The site should distinguish:
- candidate
- replicated candidate
- supported finding
- rejected/explained candidate
- insufficient evidence

No “discovery” is prewritten into the code or README before a real run produces it.

## Remaining audit work to be performed locally by Codex/browser checks
This source audit cannot prove every runtime/mobile interaction. The implementation pass must still run:
- recursive internal-link/deep-link check;
- desktop + mobile smoke navigation;
- browser console/network error check;
- Cesium zoom/layer/marker lifecycle tests;
- station control tests;
- keyboard and focus pass;
- bundle/data transfer measurements;
- existing Python + frontend CI suite.
