# Training #4 — synthesis of the latest 20 pull requests

Reviewed range: **PR #252 through PR #233** on 2026-08-26.

Purpose: prevent the L4 Water Cycle / Agentic EO experiment from forgetting important work that
already exists elsewhere in the repository. This is an integration map, not a rewrite of historical
PRs or benchmark results.

## Executive decision

Training #4 has one controlled EO data plane and several downstream consumers:

`official catalogues/products -> quality gate -> versioned evidence packages -> temporal EO model -> hydrology/terrain features -> Resource Stewardship reasoning -> Terra/EVE parity harness -> deterministic evaluation`

Do not create a second uncontrolled downloader for Resource Stewardship, EVE, UI research cards or
intervention hypotheses. They consume versioned evidence packages produced by the Training #4 data
plane.

## PR-by-PR review

| PR | Status | Main lesson to preserve in Training #4 |
| --- | --- | --- |
| #252 | open | Rapid-response doctrine is separate from hydrology training. Preserve only the general principles of lawful source access, provenance, expiry and audit. Do not import investigation targeting concepts into the environmental dataset. |
| #251 | merged | Human/legal authorization remains mandatory for restricted operational workflows. This is not a water-training feature; retain the broader human decision boundary. |
| #250 | merged | **Resource Stewardship is the downstream reasoning curriculum.** It must consume verified/versioned Training #4 evidence packages, distinguish observation/derived/model/in-situ/hypothesis, allow `insufficient evidence`, and never issue autonomous excavation/diversion instructions. |
| #249 | merged | TP-26 is a virtual research federation/router, not satellite ownership. Preserve Sentinel-1 + OPERA implementation evidence, JAXA L-band as verified/public cross-sensor research, Terra/EVE as a shared-lessons experiment, and the ESA application-readiness evidence-first framing. |
| #248 | open/current | EVE-Instruct + Terra MCP parity harness, 30-year Water Cycle dataset, public-good curriculum, SAR federation, GPU telemetry, frozen external benchmark and mission suite. This is the execution branch. |
| #247 | merged | Live-run claims must fail closed: only the real execution path can mark a run as live. Public artifacts need exact source/worktree provenance and no secret/private-reasoning leakage. |
| #246 | merged | Freeze historical B01-B10 and the verified 120/125 = 96.0%, 6/10 strict result. Never tune or rewrite it after seeing new outputs. B07 remains a real historical GRACE routing miss. |
| #245 | merged | Keep detailed Agentic EO explanation in its correct Advanced tab; training work should not destabilize public UI layout. |
| #244 | merged | Preserve clean Simple UI and keep research detail out of the Simple shell. Dataset work should be backend/data-plane first. |
| #243 | merged | Mobile/cache reliability is a real product constraint; do not reintroduce stale helper/runtime assumptions when publishing Training #4 evidence. |
| #242 | merged | Public Agentic EO explanation must retain provenance-first selection and explicit scientific limits. |
| #241 | merged | Agentic EO remains discoverable from Simple mode, but the shortcut is UI only and must not be confused with scientific execution evidence. |
| #240 | merged | Preserve Agentic EO evidence in root `published/` so Pages rebuilds do not destroy durable research artifacts. Public TEST 014 non-claims remain intact. |
| #239 | merged | Core architecture: Terra Coordinator + EO Source Scout + Evidence Verifier + deterministic registry/calculations + sanitized tool-lifecycle trace. Training #4 extends this; it does not replace it. |
| #238 | merged | Public satellite gallery has exact bounded 4/8 display limits. Training may process more evidence internally, but UI publication must remain bounded and provenance-backed. |
| #237 | merged | Contest/public build normalizes static pages consistently. Any new Training #4 public page must survive the same build/runtime path. |
| #236 | merged | Official upstream imagery only; no generated replacement satellite pixels. Missing/invalid/black imagery becomes unavailable/fallback, not fabricated evidence. Preserve Worker provenance and bounded analysis rules. |
| #235 | merged | Terrain Lab gives reusable principles: explicit LOADING/READY/FALLBACK/ERROR states, timeout and stale-request guards, DEM-validated river-flow direction, and no arrow when direction cannot be defended. Elevation/flow features should reuse this scientific caution. |
| #234 | merged | Keep deployment portable and honest. GPU-capable environments are preferred for large EO workloads but code should retain CPU fallback where feasible. Do not claim institutional/domain privileges. |
| #233 | merged | Reuse exact-year-set logic, progressive seasonal search, capped parallelism, per-year timeout, Sentinel-2 -> Landsat scientific-source preference, explicit cloud value and explicit unavailable years. The current Training #4 30-year design generalizes these ideas rather than starting over. |

## Historical components that must be reused rather than duplicated

### Agentic EO

- `terra_research_node/agentic_eo.py`
- `scripts/run_agentic_eo_live.py`
- `docs/ESA_AGENTIC_EO.md`
- `docs/AGENTIC_EO_BENCHMARK.md`
- `config/agentic-eo-benchmark-v1.json`
- root `published/agentic-eo/` evidence

### Resource Stewardship

- `docs/resource-stewardship-agentic-eo-training.md`
- `CODEX_RESOURCE_STEWARDSHIP_AGENTIC_EO_TRAINING.md`

This layer consumes Training #4 evidence packages. It must not create a competing imagery or catalogue
pipeline.

### TP-26 / SAR / ESA readiness

- `CODEX_ESA_AGENTIC_EO_APPLICATION_READINESS.md`
- TP-26 constellation provider/adaptor concepts
- Sentinel-1 / OPERA RTC-S1 existing paths
- `data/training/paleoriver_8/` where still valid and provenance-backed
- planned verified/public JAXA L-band holdout

### Terrain / hydrology UI knowledge

Reuse concepts from PR #235:

- DEM provenance;
- flow direction only when defensible;
- timeout / AbortController / version guards in UI-facing fetches;
- explicit fallback/error state;
- no invented flow direction.

Do not treat a UI arrow as hydrological ground truth. Training-side flow direction/HAND/accumulation
must be recomputed by a documented geospatial method and retain DEM resolution and datum metadata.

### Yearly observation workflow

Reuse concepts from PR #233:

- explicit year lists rather than date-overlap arithmetic;
- matched seasonal windows;
- progressive source search;
- bounded concurrency and timeout;
- explicit cloud metadata;
- explicit missing-year state;
- source and scale shown with every observation.

Training #4 changes the scale from the public 5/20-year gallery to an exact **1996-2025 30-complete-year
core**, while TEST 001 keeps the full 1990-2026 research context.

## Training #4 dataset contract after synthesis

### A. 500,000 temporal evidence/training packs

- 30% green / water-rich = 150,000
- 30% dry / arid / desert = 150,000
- 30% polar / cryosphere = 150,000
- 10% experimental paleochannel / counterfactual = 50,000

This is deliberate balanced sampling, not a claim about natural Earth-surface percentages.

### B. Exact time policy

- training core: 1996-2025 inclusive = exactly 30 complete calendar years;
- TEST 001 historical context: 1990-2026;
- incomplete future/current seasonal pairs are not fabricated;
- northern/southern seasons are hemisphere-aware;
- tropical comparisons use locally derived official hydroclimatic windows rather than false
  spring/autumn labels;
- polar optical gaps use explicit UNKNOWN and appropriate SAR/cryosphere evidence.

### C. TEST 001

`test-001-forest-pond-kuchnia` is an **anchor holdout**.

The project may learn the general methodology from TEST 001, but its exact AOI pixels and known outcome
must not enter train/validation data. After adaptation, it is used to test whether the method transfers
to the known project case without answer leakage.

The existing report remains `AUTHOR_FIELD_OBSERVATION` unless independently verified. Visible water
loss/gain does not establish cause.

### D. Evidence packages

Every accepted package must retain at least:

- pack/region/AOI identifier;
- actual acquisition dates and seasonal definition;
- provider, mission, instrument, collection/product/granule ID;
- native spatial resolution and processing level;
- cloud/QA/NoData/sensor-artifact metadata;
- exact bands/features used;
- source catalogue/product URL or reproducible identifier;
- transformation/mask/metric code version;
- evidence class;
- limitations;
- train/validation/holdout assignment;
- no-leakage group key.

### E. Scientific image quality

- use Landsat Collection 2 Level-2 Surface Reflectance scientific assets, not browser previews;
- use official QA masks;
- Landsat-7 SLC-off gaps are invalid pixels, never water loss;
- recent Sentinel-2 is high-detail context with its native resolution explicitly retained;
- Sentinel-1/OPERA is complementary all-weather SAR, not a fake optical replacement;
- if no valid observation exists, write UNKNOWN;
- never generate replacement satellite pixels.

### F. Terrain and water-cycle context

Evidence packages may add separately provenance-linked channels for:

- elevation, local relief, slope/aspect;
- flow direction/accumulation and HAND when reproducibly derived;
- SWOT water-surface elevation/slope/width where valid;
- GPM precipitation;
- SMAP surface soil moisture;
- GRACE/GRACE-FO regional terrestrial-water-storage context;
- ERA5-Land/model/reanalysis context;
- official gauges/in-situ records where public/legal;
- JRC Global Surface Water as an official derived cross-check.

Do not collapse these into one undifferentiated truth channel.

### G. Water-change learning targets

At minimum distinguish:

- water loss;
- water gain;
- stable/no-material-change;
- reversible seasonal change;
- persistent change;
- shoreline/channel migration;
- wetland inundation change;
- possible overbank/spill context;
- unknown/insufficient evidence.

Mapped area is not depth or volume.

### H. Experimental 10%

Paleochannel/intervention cases stay `HYPOTHESIS` or `MODEL_ESTIMATE` and must include negative and
falsification controls. Every water-routing counterfactual must report possible benefits and harms,
including downstream environmental flow, delta/estuary salinity, sediment/nutrients, wetlands,
groundwater recharge, evaporation, soil salinization/waterlogging, flood/drought redistribution,
energy, navigation/reservoir effects, transboundary/legal constraints and required field validation.

No case may become an autonomous engineering instruction.

## Model/training separation

### EO visual/temporal model

The actual L4 imagery training is a separate geospatial representation/change model. It can learn from
scientific raster windows and temporal pairs.

### Terra Agentic EO

Terra consumes compact evidence packages through deterministic tools/MCP. Allowed adaptation includes
routing, prompts, retrieval examples, registry improvements and validators. Do **not** describe this
repository as retraining hidden OpenAI foundation weights.

### EVE-Instruct

EVE-Instruct is a text Earth-Intelligence model. Raw raster Training #4 pixels do not magically become
EVE weight training. The fair baseline is `EVE-Instruct + Terra MCP parity harness`, using the same
logical evidence/tool capabilities as Terra.

Prefer official hosted EVE access if a documented endpoint/authorization is available. Otherwise an
official `eve-esa` checkpoint may run on the cloud L4; exact model/quantization must be reported and no
weights need be downloaded to the user's personal machine. A Q4 GGUF inference checkpoint must not be
mislabelled as a directly trainable QLoRA checkpoint.

## Evaluation hierarchy

1. data acquisition/QA gates;
2. internal geographically separated validation;
3. final internal holdout once;
4. frozen M001-M006 missions;
5. frozen external B01-B10 benchmark;
6. TEST 001 anchor holdout;
7. deterministic pre/post failure table and lessons.

Neither Terra nor EVE may grade itself. Models may suggest lessons, but the published scores come from
deterministic evaluators and measurable EO references where valid.

## Execution rule

Before the L4 run, update the experimental branch with current `origin/main`. PR #248 currently diverges
from main because newer merged PRs and automatic data refreshes landed after it was created. Codex must
work from the merged current worktree, not from the old PR base snapshot.

Do not merge PR #248 merely because implementation/tests pass. Its existing real-EVE/L4/public-evidence
merge gates remain in force.
