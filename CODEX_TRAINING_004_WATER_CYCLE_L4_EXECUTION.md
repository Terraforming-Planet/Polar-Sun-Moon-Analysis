# CODEX MASTER TASK — Training #4 Water Cycle + Agentic EO on NVIDIA L4

Repository:
https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis

Experimental PR:
https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/pull/248

Expected working branch:
`agent/eve-terra-l4-comparative-benchmark`

Primary research target:
ESA Φ-lab — Agentic AI Systems for Earth Observation

Secondary research targets:
- ESA Φ-lab — AI for Reconstruction of the Terrestrial Water Cycle
- ESA Φ-lab — AI for SAR Foundation Models

Hardware target:
**NVIDIA L4 cloud GPU**

## Mission

Turn PR #248 into a reproducible, scientifically honest Training #4 implementation that learns
multi-year seasonal Earth-observation change, especially water loss/gain/stability, and then exposes
compact provenance-rich evidence packages to Terra Agentic EO and EVE-Instruct under a fair tool-parity
harness.

The primary public-good objective is to improve our ability to detect and explain environmental change
using official/public data while refusing unsupported causal, hydrological or engineering claims.

This task is implementation + smoke/full-run preparation. It is **not permission to merge PR #248**.
Do not merge the PR.

---

# 0. FIRST: synchronize and audit, do not rewrite history

The PowerShell launcher updates this worktree with the current `origin/main` before invoking this brief.
Assume recent merged work is important.

Read these first:

- `docs/TRAINING_004_LAST_20_PR_SYNTHESIS.md`
- `config/training-004-water-cycle-30y.json`
- `docs/TRAINING_004_WATER_CYCLE_30Y.md`
- `docs/TRAINING_004_EXTERNAL_AI_REFERENCE_MATRIX.md`
- `CODEX_TRAINING_004_ESA_MCP_AGENTIC_EO.md`
- `CODEX_EVE_TERRA_AGENTIC_EO_L4_BENCHMARK.md`
- `CODEX_TRAINING_004_PLANET_OBSERVATION.md`
- `config/training-004-esa-agentic-missions-v1.json`
- `config/eve-terra-agentic-eo-comparison-v1.json`
- `config/agentic-eo-public-good-training-v1.json`
- `docs/resource-stewardship-agentic-eo-training.md`
- `CODEX_RESOURCE_STEWARDSHIP_AGENTIC_EO_TRAINING.md`
- `CODEX_ESA_AGENTIC_EO_APPLICATION_READINESS.md`
- `terra_research_node/agentic_eo.py`
- `terra_research_node/global_public_dataset.py`
- `terra_research_node/water_cycle_manifest.py`
- `terra_research_node/water_cycle_acquisition.py`
- `scripts/run_training_004_l4.ps1`
- `scripts/run_streaming_gibs_l4.ps1`
- existing TP-26/SAR/adaptor code and tests
- TEST 001 repository evidence
- frozen B01-B10 benchmark and published historical benchmark artifacts

The old `scripts/run_training_004_l4.ps1` is historical **Training #4A / GIBS throughput evidence**.
Do not silently rewrite or relabel it as the final Water Cycle experiment.

Historical facts that must remain immutable:

- PR #239 Agentic EO architecture and published live evidence;
- PR #246 benchmark result: **120/125 = 96.0%, 6/10 strict cases**;
- B07 historical GRACE/GRACE-FO routing miss;
- PR #247 provenance/live-run hardening;
- any published Training #1/#2/#3/#4A artifacts and their original claims.

Never edit an old result to improve a new comparison.

---

# 1. SCIENTIFIC CLAIM CONTRACT — mandatory everywhere

Use explicit evidence classes:

- `OBSERVATION`
- `AUTHOR_FIELD_OBSERVATION`
- `DERIVED_VALUE`
- `MODEL_ESTIMATE`
- `HYPOTHESIS`
- `UNKNOWN`

Hard rules:

1. Satellite morphology does not prove physical cause.
2. 2-D mapped water area is not water depth or volume.
3. SWOT water-surface elevation alone is not bathymetry or stored volume.
4. GRACE/GRACE-FO regional TWS is not a local aquifer/fracture map.
5. SMAP shallow surface-soil moisture is not deep groundwater.
6. A paleochannel candidate is not a confirmed buried river.
7. A model training loss/accuracy is not an environmental finding.
8. A flood/spill output is `MODEL_ESTIMATE` until independently validated.
9. A river-restoration/diversion scenario is a `HYPOTHESIS` or `MODEL_ESTIMATE`, not a construction
   instruction.
10. `UNKNOWN` is correct when evidence is missing. Never invent a clear image, product ID, sensor
    reading, cause, river direction, water level or result.
11. No generated replacement satellite pixels in the scientific dataset.
12. Any live-run flag must be set only by a successful real execution path, preserving PR #247 logic.

---

# 2. DATASET CONTRACT — exactly preserve the intended research design

## 2.1 Time

The exact training core is:

**1996-2025 inclusive = 30 complete calendar years.**

Do not call 1990-2026 a 30-year interval.

TEST 001 keeps its full project research context from 1990 through 2026, but incomplete current/future
seasonal pairs are never fabricated.

## 2.2 Balanced target

Generate/retain **500,000 temporal training/evidence packs**:

- 150,000 green/water-rich = 30%
- 150,000 dry/arid/desert = 30%
- 150,000 polar/cryosphere = 30%
- 50,000 paleochannel/counterfactual experimental = 10%

This is an explicit sampling policy, not a claim about the percentage of Earth's surface.

A pack is a provenance-linked temporal recipe/evidence bundle. It does not require one unique remote
satellite scene per pack. Reuse scientific assets and use different valid local windows/crops where
appropriate. Do not generate one million redundant catalogue requests.

## 2.3 Seasonal logic

- Northern mid-latitudes: spring March-May, autumn September-November.
- Southern mid-latitudes: hemisphere-aware reversed windows.
- Tropics: derive two local hydrological windows from an official precipitation climatology; never
  falsely name them European-style spring/autumn.
- Polar: use scientifically valid illumination/season windows; where optical evidence is invalid,
  record the gap and route to appropriate SAR/cryosphere evidence.
- Default cross-year task compares the same season across years.
- Separate within-year seasonal-response task compares the two valid local seasonal windows.

## 2.4 TEST 001 — anchor holdout, no leakage

`test-001-forest-pond-kuchnia` is the foundational project lesson but must remain an **anchor holdout**.

Allowed:
- learn the general scientific methodology: matched seasons, loss vs gain vs stability, uncertainty,
  field validation, no unsupported cause.

Forbidden:
- training/validation on exact TEST 001 AOI pixels plus its known outcome;
- special-casing its coordinates or expected answer;
- tuning thresholds after seeing its final holdout result and then reporting that same result as
  independent.

Its current repository report is `AUTHOR_FIELD_OBSERVATION`, not independently verified hydrological
ground truth. Preserve that distinction.

---

# 3. ONE CONTROLLED DATA PLANE — reuse PR #250 architecture

Resource Stewardship, Terra Agentic EO, EVE, UI summaries and intervention studies must consume
**versioned Training #4 evidence packages**.

Do not create parallel uncontrolled downloaders.

Logical flow:

`official source registry/catalogue -> acquisition resolver -> quality gate -> windowed scientific raster read -> derived EO measurements -> terrain/hydrology context -> versioned evidence package -> downstream agents/models`

Provider-specific code must be modular.

Suggested structure, adapting to repository conventions rather than forcing names blindly:

- `terra_research_node/training004_sources/landsat.py`
- `.../sentinel2.py`
- `.../sentinel1.py`
- `.../opera.py`
- `.../dem.py`
- `.../jrc_water.py`
- `.../hydrology.py`
- common source/evidence dataclasses and cache utilities

Do not create one huge source file.

---

# 4. LANDSAT — make the 30-year core scientific, not preview-based

The historic core must use **USGS/NASA Landsat Collection 2 Level-2 Surface Reflectance scientific
assets plus official QA**, not browser preview JPGs.

Extend the existing official STAC resolver instead of creating a second unrelated resolver.

Requirements:

1. Use the controlled official USGS Landsat STAC endpoint/collection already configured.
2. Resolve and store real STAC item IDs and asset identifiers.
3. Inspect the live STAC asset schema before assuming asset key names.
4. Build a mission-aware semantic band mapper so equivalent physical bands are selected correctly
   across Landsat 5/7/8/9.
5. At minimum support green, red, NIR, SWIR1 and QA_PIXEL when those assets are present and valid.
6. Preserve native 30 m information content; do not upsample to 10 m and claim new detail.
7. Read **only the required AOI window/block/range** from Cloud-Optimized GeoTIFFs where the official
   asset supports it. Do not mirror whole mission archives.
8. Cache catalogue resolution and reusable COG blocks/assets safely to prevent redundant requests.
9. Record exact item + asset + acquisition date + native resolution + processing level + QA + source.
10. Implement retry/backoff and explicit provider failure states.

## Landsat-7 SLC-off

After the 2003 SLC failure, invalid scan gaps must be masked as invalid/NoData. They must **never** be
interpreted as surface-water disappearance.

Add tests locking this behavior.

---

# 5. QUALITY GATE — this runs before a scene becomes evidence

Create/reuse a testable Quality Gate Service.

For optical imagery:

- prefer scenes <= 15% cloud at catalogue level;
- documented fallback may search <= 30%;
- evaluate actual AOI valid-pixel quality using QA masks after the window is read;
- mask cloud, cloud shadow, fill/NoData and documented sensor artifacts;
- snow/ice must remain a separately known condition rather than silently becoming water/non-water;
- store valid-pixel ratio and mask statistics;
- if a scientifically valid observation cannot be obtained, return `UNKNOWN/optical_unavailable`;
- SAR may be complementary evidence, not fabricated optical replacement.

Borrow the explicit state philosophy from PR #235:

- `LOADING/RESOLVING`
- `READY`
- `FALLBACK_READY`
- `UNKNOWN/UNAVAILABLE`
- `ERROR`

A timeout or stale response must never overwrite a newer AOI/source request.

---

# 6. SENSOR-ERA HARMONIZATION

A 30-year temporal model can otherwise learn sensor changes instead of environmental changes.

Implement metadata and normalization that explicitly distinguishes Landsat mission/sensor eras.

At minimum:

- semantic band mapping by mission;
- documented Collection 2 scale/offset handling;
- QA mask differences where relevant;
- sensor identifier as metadata/conditioning feature or documented harmonization factor;
- no assumption that Sentinel-2 and Landsat pixels are identical merely because they are resampled to
  the same tensor size;
- cross-sensor evaluation rather than hiding source differences.

Where cross-calibration is not scientifically defensible, preserve sensor identity and uncertainty.

---

# 7. RECENT DETAIL + ALL-WEATHER COMPLEMENT

## Sentinel-2

Use CDSE Sentinel-2 Level-2A for recent 10 m detail where a valid public/authorized access path exists.
Retain native-resolution metadata.

If CDSE credentials/access are unavailable on the L4, mark the source unavailable and continue the
valid Landsat core rather than inventing Sentinel data.

## Sentinel-1 / OPERA

Reuse existing Sentinel-1 and NASA OPERA paths where possible.

Requirements:

- radar evidence remains physically distinct from optical evidence;
- calibrated/analysis-ready products only for scientific features;
- do not call preview brightness calibrated backscatter;
- no direct water-depth claim;
- preserve known roughness/vegetation/geometry limitations;
- use radar especially for cloud-limited flood/surface-water context.

## JAXA / NISAR

Keep JAXA L-band and NISAR as cross-sensor/cross-frequency research/holdout sources only where public,
legal, reproducible products are actually accessible.

Do not claim partnership, privileged access or mission ownership.

---

# 8. SPATIAL WINDOWS AND TERRAIN CONTEXT

Default windows from the frozen contract:

- Landsat 30 m × 512 = 15.36 km side historic core;
- Sentinel-2 10 m × 512 = 5.12 km recent detail;
- GLO-90 90 m × 512 = 46.08 km regional terrain context.

Allow the manifest's nearby deterministic AOI sampling. Do not take the identical central crop tens of
thousands of times.

Reuse PR #235 principles for elevation/flow, but recompute training-side terrain features with a
reproducible geospatial method.

Potential features:

- elevation;
- local relief;
- slope/aspect;
- flow direction;
- flow accumulation;
- HAND / height above nearest drainage;
- DEM NoData/uncertainty.

Each feature must store source DEM, native resolution and derivation/version. If river-flow direction
cannot be defended, leave it UNKNOWN rather than drawing/inventing a direction.

The public Terrain Lab elevation flags can later visualize these values, but UI flags are not ground
truth labels by themselves.

---

# 9. WATER-CYCLE CONTEXT — separate channels, never one fake truth value

Add modular provenance-linked context where data/access permit:

- SWOT WSE / river slope / width / area / discharge estimates for recent valid coverage;
- GPM IMERG precipitation from its valid era;
- SMAP surface soil moisture from its valid era;
- GRACE/GRACE-FO regional TWS context;
- ERA5-Land reanalysis/model context;
- JRC Global Surface Water official derived history/cross-check;
- official gauges/in-situ public data where reproducibly accessible;
- GloFAS/Copernicus hydrological model/forecast evidence where suitable.

Do not force these sources into years before their missions existed.

Every channel records its own temporal availability, scale, evidence class and limitation.

---

# 10. TRAIN / VALIDATION / HOLDOUT — geography first

Split by geographic/watershed groups **before random pixel/window splitting**.

Requirements:

- no same/adjacent AOI leakage between train and final holdout;
- no same event copied into train and holdout through neighboring crops;
- keep category balance visible in each split;
- retain a final internal geographic holdout used once;
- retain cross-time holdouts;
- retain cross-provider/cross-sensor tests;
- TEST 001 stays outside train/validation;
- B01-B10 and M001-M006 never become training examples.

Write a split manifest with stable IDs/hashes so the same experiment can be reproduced.

---

# 11. EO VISUAL/TEMPORAL TRAINING — realistic L4 scope

Raw satellite rasters train a **geospatial EO representation/change model**, not EVE-Instruct itself.
Keep this separation explicit.

Inspect existing Training #1/#2/#3/#4A PyTorch code and reuse stable CUDA, multiprocessing/threading,
checkpoint, telemetry and archive patterns where appropriate.

Do not claim a new planetary foundation model merely because 500,000 temporal packs were processed.

Recommended staged objective:

## Stage V0 — representation pretraining

Use a compact L4-feasible shared spatial encoder + temporal comparison mechanism, or an existing
repository architecture if better supported.

Prefer self-supervised/weakly supervised objectives that do not require pretending pseudo-labels are
field ground truth, for example:

- multi-temporal representation consistency;
- masked feature reconstruction;
- same-AOI temporal contrastive objectives;
- cross-sensor consistency where physically appropriate;
- missing-observation awareness.

## Stage V1 — high-confidence water-change head

Where scientifically valid derived water masks exist, train/evaluate direction classes such as:

- `surface_water_loss`
- `surface_water_gain`
- `stable/no_material_change`
- `reversible_seasonal_change`
- `persistent_change`
- `shoreline_or_channel_migration`
- `unknown`

Labels derived from NDWI/MNDWI/JRC/SAR logic remain `DERIVED_VALUE` or `MODEL_ESTIMATE` as appropriate.
Do not call them universal ground truth.

Use a confidence/valid-pixel gate. Ambiguous samples should be excluded from supervised loss or assigned
UNKNOWN rather than forced into a false class.

## Stage V2 — spill/flood context

Do not train a public flood-warning model merely from elevation + water area.

If enough validated historical reference data exist, implement an experimental `MODEL_ESTIMATE` track
combining terrain/HAND, upstream topology, observed water state, antecedent precipitation and available
hydrological evidence. Evaluate false-alert and missed-event rates on geographic holdouts.

If validated data are insufficient, publish the feature/evidence package and leave the model head
blocked/experimental. This is preferable to a fake flood predictor.

---

# 12. GPU + STREAMING PERFORMANCE

The L4 run must actually use CUDA when available.

Capture:

- GPU name;
- driver/CUDA/PyTorch versions;
- VRAM total/used/peak;
- GPU utilization;
- power and temperature where available;
- wall-clock duration;
- packs/s and valid raster windows/s;
- bytes/s or MiB/s from remote data plane;
- catalogue cache hit ratio;
- raster/cache hit ratio;
- provider retry/backoff/failure counts;
- fetch/decode/transform p50/p95 when feasible;
- queue depth / GPU wait-for-data when feasible;
- training loss by phase;
- examples rejected by Quality Gate.

Do not force GPU utilization to 98% by unsafe busy work. Optimize bottlenecks honestly. If the GPU waits
for data, report that and improve prefetch/cache/worker scheduling.

CPU fallback should exist where practical, but the publishable Training #4 run must record the actual
L4 environment if L4 is used.

Do not download full satellite archives. Use batch processing, manifests, caches and windowed reads.

---

# 13. 500K DOES NOT MEAN 500K REMOTE CATALOGUE SEARCHES

The 500,000-pack manifest is a training recipe universe.

Build a deduplicated acquisition plan keyed by scientifically relevant combinations such as:

`provider + sensor + spatial cell/scene + year + season/window + quality policy`

Resolve catalogue metadata once per useful key, cache it, and map many local training windows onto
verified scientific assets.

Persist:

- acquisition plan;
- cache index;
- provider request counters;
- asset reuse count;
- unresolved/UNKNOWN count;
- deterministic hashes.

The system should resume after interruption without corrupting the manifest or redoing completed work.

---

# 14. RESOURCE STEWARDSHIP — downstream reasoning only

After evidence packages exist, reuse PR #250's Resource Stewardship schema.

Every intervention-oriented report must include:

- Observed;
- Derived;
- Unknown;
- Possible explanations/Hypotheses;
- Resource implications;
- Next evidence;
- Human/expert decision boundary.

For paleochannel/restoration/diversion counterfactuals, quantify potential benefits and potential harms.
Mandatory consequence matrix:

- downstream environmental flow;
- delta/estuary freshwater and salinity;
- sediment and nutrients;
- wetlands/aquatic habitat;
- groundwater recharge;
- evaporation;
- soil salinization/waterlogging;
- flood/drought redistribution;
- pumping/head energy;
- reservoir/navigation effects;
- transboundary/legal constraints;
- public aggregate community impacts;
- uncertainty;
- required hydrological/ecological/field validation;
- evidence that could falsify the hypothesis.

No autonomous excavation, diversion, dam/gate control or other engineering actuation.

---

# 15. AGENTIC EO EVIDENCE PACKAGES

Create a compact, stable evidence-package schema consumable by both Terra and EVE.

A package should contain conclusions only at the evidence level supported by its inputs, plus compact
references to raster/product artifacts rather than dumping giant arrays into the language model.

Include at minimum:

- question/mission ID;
- AOI/time/season;
- selected and rejected source choices with reason;
- product/granule IDs;
- quality metrics;
- derived area/change metrics;
- terrain/hydrology features;
- evidence classes;
- uncertainty/limitations;
- missing evidence;
- recommended next observation/check;
- deterministic provenance hash.

Do not expose chain-of-thought.

---

# 16. TERRA ADAPTATION — label honestly

Terra Agentic EO uses a hosted OpenAI model plus deterministic tools.

Allowed adaptation in this repository:

- source registry improvements;
- routing rules;
- prompts/instructions;
- retrieval examples;
- tool schemas;
- validators;
- deterministic calculations;
- MCP/evidence-package interfaces.

Do **not** call this retraining the hidden OpenAI foundation-model weights.

Keep `datasets/agentic-eo-public-good-v1` separate from frozen evaluation cases.

Run baseline before adaptation, then validation, then final holdout once.

---

# 17. EVE-INSTRUCT — fair parity harness, no fake training claim

Main label:

**EVE-Instruct + Terra MCP parity harness**

This is not automatically ESA's complete official agent stack.

Prefer, in order:

1. documented/authorized official hosted EVE access if actually available;
2. otherwise the official `eve-esa` open checkpoint on the **cloud L4**, not the user's local PC.

Known constraint:

- full BF16 EVE-Instruct does not fit one L4 comfortably;
- official Q4 GGUF can be used for inference if reproducibly configured;
- label exact quantization/runtime;
- do not pretend the Q4 GGUF inference file is automatically a trainable QLoRA target.

If hosted EVE/API access is unavailable, document that fact. Do not emulate a private ESA endpoint or
claim official ESA agent performance.

EVE consumes the same logical evidence/tool capabilities as Terra for the main comparison.

No unrestricted model-generated shell/file/network access.

---

# 18. FROZEN EXTERNAL EVALUATION

Never train on:

- B01-B10;
- M001-M006;
- exact TEST 001 holdout pixels/outcome;
- copied EVE benchmark/training examples that would create unfair leakage.

Evaluation order:

1. acquisition/QA unit and integration gates;
2. internal validation;
3. final internal geographic holdout once;
4. M001-M006 frozen mission suite;
5. B01-B10 external benchmark;
6. TEST 001 anchor holdout;
7. pre/post deterministic failure table.

Do not change a test after seeing a model answer unless creating a new benchmark version with the old
result preserved.

---

# 19. TEST 001 FINAL LESSON

After adaptation/training — not before — run the TEST 001 anchor workflow.

The output must answer separately:

- what water change is supported by reproducible EO evidence;
- what part comes from author field observation;
- whether nearby/wider water gain/loss is independently supported;
- what remains UNKNOWN;
- what would be needed to establish cause;
- whether the learned method generalizes without using TEST 001 in training.

Do not force the result to match the existing narrative. If independent EO disagrees or is ambiguous,
publish that honestly.

---

# 20. LESSONS LEARNED — both systems may reason, neither self-grades

Terra and EVE may each produce a concise `lessons_suggested` section after runs.

The actual score comes from deterministic evaluators and measurable EO references.

Publish:

- pre vs post metrics;
- every failed external case;
- error class: factual / source-selection / routing / provenance / uncertainty / recovery /
  calculation / data-quality;
- regressions;
- unknown handling;
- what Terra taught us;
- what EVE taught us;
- what the visual model taught us;
- what remains unproven.

If there is no improvement, say so.

Never collapse this into `Terra beats ESA`.

---

# 21. REQUIRED IMPLEMENTATION OUTPUTS

Audit existing names first, then implement the minimum modular set needed to make the following real.
Exact filenames may be adapted to repository conventions, but the logical capabilities are mandatory.

## Must exist after Codex succeeds

1. **scientific Landsat window reader**
   - real L2 SR COG assets + QA;
   - mission-aware bands;
   - windowed reads;
   - provenance.

2. **Quality Gate**
   - AOI valid/cloud/NoData/sensor-artifact checks;
   - explicit UNKNOWN/fallback.

3. **deduplicated acquisition-plan/cache layer**
   - resumable;
   - request/cache counters.

4. **versioned evidence-package builder**
   - deterministic hash;
   - compact agent-facing JSONL/JSON.

5. **geographic split builder**
   - train/validation/final holdout;
   - no TEST001/B01-B10/M001-M006 leakage.

6. **L4 water-cycle trainer**
   - CUDA auto-detect;
   - smoke and full modes;
   - telemetry;
   - checkpoints outside Git;
   - resume support;
   - scientifically honest objectives.

7. **deterministic evaluator/report generator**
   - no LLM judge;
   - public failures and uncertainty.

8. **Terra evidence-package adapter**
   - reuse Agentic EO/tool contracts.

9. **EVE parity adapter/runner**
   - only if a real configured EVE endpoint/runtime exists;
   - otherwise explicit reproducible BLOCKED status.

10. **TEST 001 holdout runner**
    - runs only after the relevant training/adaptation stage;
    - cannot access training labels for that AOI.

11. **PowerShell/Python CLI hooks** consumed by
    `scripts/run_training_004_water_cycle_l4.ps1`.

12. **unit/integration tests without network/model downloads** using small fixtures/fake STAC/raster
    windows.

---

# 22. EXPECTED CLI CONTRACT FOR THE POWERSHELL LAUNCHER

After implementation, provide a stable Python entrypoint, preferably:

`scripts/run_training_004_water_cycle_l4.py`

It must support at least:

```text
--mode smoke|full
--manifest <path>
--output-dir <path>
--resume
--seed 4004
--max-packs <N>              # smoke/debug limit
--device auto|cuda|cpu
--workers <N>
--batch-size <N>
```

Recommended additional flags if useful:

```text
--build-acquisition-plan
--resolve-data
--train
--evaluate
--test001-holdout
--terra-agentic
--eve-endpoint <URL>
```

Do not require the user's personal computer to store EVE weights.

The smoke mode must be representative across the 30/30/30/10 classes rather than simply taking the
first N manifest rows.

---

# 23. SMOKE GATE BEFORE FULL 500K

The PowerShell launcher will run smoke first.

Smoke must demonstrate:

- all four dataset categories represented;
- multiple years and both temporal modes;
- at least one real scientific Landsat raster window read if the official endpoint is reachable;
- QA mask application;
- no TEST 001 leakage;
- evidence package serialization;
- CUDA training step if CUDA is available;
- checkpoint/resume behavior on a tiny run;
- deterministic evaluator output;
- zero secrets/private reasoning in public logs;
- no provider flood from redundant requests.

Full mode must not start if smoke integrity gates fail.

A missing external provider may yield a documented source-specific degraded/UNKNOWN state if the
30-year Landsat core still works. A failure of the core scientific Landsat path blocks the full water
training run.

---

# 24. CI / QUALITY

Before the PowerShell launcher is allowed to commit/push Codex implementation changes, make all of
these pass:

```powershell
python -m ruff check .
python -m mypy terra_research_node
python -m pytest -q
python -m compileall terra_research_node scripts tests
```

If full-repository MyPy exposes unrelated historical exclusions, do not weaken global type checking.
Add/adjust focused CI coverage so all new Training #4 modules are strictly checked.

Also preserve:

- repository secret scan;
- Worker guardrail tests;
- web build/tests if affected;
- `.github/workflows/training-004-water-cycle.yml`.

Do not skip/disable a failing test merely to make CI green.

---

# 25. SECURITY / PRIVACY / LEGALITY

Only legal/public/official EO/environmental sources.

Do not commit:

- API keys;
- tokens;
- `.env`;
- CDSE secrets;
- OpenAI secrets;
- raw EVE weights/cache;
- PyTorch checkpoints;
- massive raw raster caches;
- `research_runs/` raw execution data;
- chain-of-thought;
- private communications/person-level tracking data.

PR #251/#252 investigation workflows are **not** part of the hydrology training dataset.

Training #4 environmental evidence remains area/environment focused and privacy-preserving.

---

# 26. PUBLIC ARTIFACTS AFTER A REAL RUN

Keep large/raw artifacts local/cloud-side and outside Git.

Publish only compact sanitized evidence such as:

- exact git SHA/dirty-state status;
- config/manifest hashes;
- split counts;
- provider/product counts;
- UNKNOWN/rejection counts;
- QA statistics;
- telemetry summaries;
- training/evaluation metrics;
- deterministic failures;
- TEST 001 holdout summary;
- Terra/EVE run status and exact configuration;
- lessons;
- limitations;
- source IDs/provenance required to reproduce selected examples.

Every public result must distinguish:

- implemented;
- actually executed;
- measured;
- derived;
- planned/blocked.

No cherry-picking best runs.

---

# 27. GIT / PR BEHAVIOR

Work only on the current PR #248 branch.

Do not merge the PR.

Do not rewrite history or force-push.

Do not delete historical Training #4A evidence.

Do not stage large data/checkpoints/caches.

Leave the worktree in a state the PowerShell orchestrator can validate, commit and push safely.

If you create a commit yourself, use a normal non-force commit on the current branch and still leave all
quality gates green.

---

# 28. FINAL CODEX CONSOLE SUMMARY

At the end print a concise machine/human-readable summary containing:

```text
TRAINING 004 WATER CYCLE CODEX IMPLEMENTATION: PASS|BLOCKED|FAIL
Branch:
Head SHA:
Main synchronized: YES|NO
Scientific Landsat COG+QA path: PASS|BLOCKED
Quality Gate: PASS|FAIL
Acquisition dedupe/cache: PASS|FAIL
Evidence packages: PASS|FAIL
Geographic split/no-leakage: PASS|FAIL
L4 trainer: PASS|BLOCKED
Terra adapter: PASS|BLOCKED
EVE parity adapter: PASS|BLOCKED
TEST001 holdout isolation: PASS|FAIL
Ruff: PASS|FAIL
MyPy: PASS|FAIL
Pytest: PASS|FAIL
Secrets scan: PASS|FAIL
Full 500k run executed: YES|NO
Real EVE comparison executed: YES|NO
Known blockers:
Next command:
```

Do not print PASS for work that was not actually run.

---

# SUCCESS CRITERION

A technically experienced ESA Φ-lab reviewer should be able to verify that the repository now contains:

1. a real 30-complete-year seasonal EO training design;
2. scientific Landsat/QA window access rather than preview-image pretending;
3. balanced global green/dry/polar/experimental sampling;
4. TEST 001 protected as an independent anchor holdout;
5. terrain/hydrology evidence with provenance and uncertainty;
6. modular optical/SAR/water-cycle source architecture;
7. an L4-feasible temporal EO training pipeline;
8. versioned evidence packages reused by Resource Stewardship and Agentic EO;
9. fair Terra/EVE tool parity rather than organizational marketing;
10. deterministic evaluation, visible failures and explicit UNKNOWN;
11. public-good intervention reasoning that measures potential benefits **and harms** and requires
    hydrological/ecological/field validation before any real intervention.

Optimize for evidence, reproducibility and learning value — not for looking finished.
