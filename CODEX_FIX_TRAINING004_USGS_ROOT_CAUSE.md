# CODEX TASK — Training #4 Water Cycle: root-cause repair and live L4 execution

Repository: Terraforming-Planet/Polar-Sun-Moon-Analysis
Branch / PR: `agent/eve-terra-l4-comparative-benchmark` / PR #248

## Mission

Stop the repeated Training #4 failure loop. Diagnose and repair the **real scientific Landsat pixel-access path**, validate it live on the current NVIDIA L4 environment, and only then allow the 500k Training #4 run to start.

Do not bypass scientific gates, fabricate pixels, relabel metadata as imagery, weaken TEST 001 holdout, or mark a blocked run as successful.

## Context already verified on L4

The following have already passed repeatedly and are NOT the primary bug:

- USGS EROS Application Token login: `USGS M2M LOGIN OK`
- NVIDIA L4 detected
- PyTorch CUDA available
- Ruff full repository passes
- MyPy Training 004 modules passes
- full Pytest passes (287 tests in the latest observed run)
- compileall passes
- 500k manifest builds
- TEST 001 remains excluded from training

The failure occurs in `REPRESENTATIVE WATER-CYCLE SMOKE RUN` before meaningful CUDA training.

Observed failure summary:

- `core_scientific_landsat = BLOCKED`
- repeated `Authenticated USGS M2M individual-band resolution failed`
- tropical records may also report `Tropical climatology windows are unresolved`
- runner tries up to 8 unique acquisition keys and exits `2` if none yields a real Landsat raster pair

## Audit before editing

1. Inspect the current PR #248 diff and the last 20 PRs in this repository for relevant design decisions. Preserve merged provenance/safety/scientific constraints from PRs #239, #246, #247, #249 and #250.
2. Inspect at minimum:
   - `scripts/run_training_004_water_cycle_l4.ps1`
   - `scripts/run_training_004_water_cycle_l4.py`
   - `terra_research_node/water_cycle_acquisition.py`
   - `terra_research_node/training004_sources/landsat.py`
   - `terra_research_node/training004_sources/usgs_m2m.py`
   - Training #4 tests
3. Confirm the exact current USGS M2M API contract from the live API response. Do not infer product structure from memory when the authenticated API can be queried directly.

## Root-cause diagnostic — MUST run live

Using the already-populated environment variables from `scripts/start_training004_usgs.ps1` / encrypted local credential:

1. Query one real non-tropical Landsat Collection 2 Level-2 scene selected by the existing official USGS STAC searcher.
2. Record sanitized structures (field names and non-secret identifiers only) for:
   - selected STAC item id / display id
   - `scene-list-add` result or the replacement lookup path if scene-list is wrong
   - `download-options` top-level keys
   - product `id`, `entityId`, `displayId`, `productName`, `available`, `bulkAvailable`
   - `secondaryDownloads` structure
   - `download-request` response buckets
   - `download-retrieve` response buckets when polling is required
3. Never print API keys or application tokens.
4. Preserve the precise underlying M2M error in logs. Remove the current generic exception masking in `RasterioCogBackend._access_href/read`.

## Required functional fix

Implement the smallest correct solution supported by the live USGS response.

The solution must:

- use official USGS Landsat Collection 2 Level-2 scientific data;
- retrieve only required bands plus `QA_PIXEL`, not full archives;
- map `green`, `red`, `nir`, `swir1`, `qa_pixel` mission-aware for Landsat 4/5/7/8/9;
- use exact identifiers expected by current M2M endpoints;
- correctly handle top-level products and/or `secondaryDownloads` according to the live API structure;
- accept string or numeric product/entity IDs where USGS returns them;
- correctly consume `availableDownloads`, `preparingDownloads`, `requestedDownloads` and the actual current response bucket names;
- poll only when preparation is genuinely pending;
- use bounded retry/backoff for 429/5xx/transient provider errors;
- cache resolved signed URLs per scene/band during one run;
- distinguish provider outage from schema/identifier bugs;
- fail closed when no scientific pixels are available;
- keep `QA_PIXEL` quality gating and Collection 2 scale/offset intact;
- keep provenance fields and OBSERVATION/UNKNOWN boundaries intact.

### Alternate official path

If authenticated M2M individual-band download is temporarily unavailable but the L4 environment already has valid AWS credentials for the official `s3://usgs-landsat/` requester-pays bucket, use that existing official path automatically.

Do NOT invent AWS credentials, require the user to paste cloud secrets into Git, or silently fall back to preview JPEG/PNG imagery.

## Representative smoke selection

Fix smoke selection so provider health can be tested efficiently without weakening the science:

- do not waste initial attempts on records whose tropical climatology windows are explicitly unresolved;
- choose a deterministic non-tropical representative set covering a supported Landsat era;
- still preserve all four 30/30/30/10 manifest categories for the dataset recipe;
- smoke only needs enough true scientific data to prove the pipeline path; it must not pretend all 500k pixels have been downloaded;
- TEST 001 remains holdout-only and must never enter training.

## Tests to add/update

Add deterministic unit tests using captured/sanitized response shapes for:

- M2M login-token response handling;
- scene/display/entity identifier resolution;
- download-options with individual bands in the location actually returned by USGS;
- `bulkAvailable` / `available` behavior;
- immediate `availableDownloads` URL;
- preparing -> download-retrieve -> available flow;
- exact QA_PIXEL and SR_B* matching;
- error propagation preserving endpoint/error code without secrets;
- deterministic representative smoke excluding unresolved tropical records from the initial provider-health attempts;
- no fallback to preview/non-scientific imagery.

## Validation gate

Run in this order on L4:

1. tracked secret scan
2. Ruff full repository
3. MyPy Training 004 modules
4. full Pytest
5. compileall
6. authenticated one-scene/one-band USGS live preflight
7. representative Training #4 smoke on CUDA

The smoke must demonstrate at least:

- real official Landsat Collection 2 L2 raster bytes opened by rasterio;
- `QA_PIXEL` read;
- at least green/red/nir/swir1 read;
- Collection 2 scale/offset applied;
- CUDA training step executed;
- checkpoint/resume verified;
- sanitized provenance saved;
- `run-summary.json` has `core_scientific_landsat=PASS` and `full_allowed=true`.

If the live USGS provider is externally unavailable, stop with a precise `PROVIDER_BLOCKED` report and evidence. Do not start the 500k full run.

## Full run

ONLY after the live smoke passes, start the full Training #4 target run with the existing frozen recipe:

- 30 complete years: 1996–2025
- target: 500,000 manifest packs
- categories: 30% green/water-rich, 30% dry/arid/desert, 30% polar/cryosphere, 10% experimental paleochannel counterfactual research
- spring/autumn temporal comparison where defined
- TEST 001 anchor is holdout-only
- official/public/legal sources only
- no unsupported environmental or causal claims

Retain:

- orchestrator console log
- GPU telemetry CSV
- run summary JSON
- acquisition plan
- split manifest
- evidence/provenance packages
- training metrics/checkpoints outside Git where appropriate

Do not commit raw datasets, model weights, tokens, `.env`, or large generated artifacts.

## Git/PR behavior

- Work only on PR #248 branch.
- Preserve current history; do not rewrite main.
- Commit the fix with a clear message.
- Push to `origin/agent/eve-terra-l4-comparative-benchmark`.
- Do NOT merge PR #248 automatically.
- At the end print a compact result block:

```
TRAINING004 ROOT-CAUSE REPAIR: PASS|PROVIDER_BLOCKED|FAIL
USGS LOGIN: PASS|FAIL
LANDSAT PIXEL PREFLIGHT: PASS|BLOCKED|FAIL
RUFF: PASS|FAIL
MYPY: PASS|FAIL
PYTEST: PASS|FAIL
CUDA SMOKE: PASS|BLOCKED|FAIL
FULL 500K: STARTED|PASS|NOT_STARTED|FAIL
HEAD: <sha>
RUN_DIR: <path>
ROOT_CAUSE: <one precise sentence>
```

Do not claim PASS unless the live scientific pixel path and CUDA smoke actually pass.
