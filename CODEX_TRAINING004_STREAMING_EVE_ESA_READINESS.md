# CODEX MASTER TASK — Training #4 real streaming + EVE parity + ESA-readiness evidence

Repository: Terraforming-Planet/Polar-Sun-Moon-Analysis
Branch/PR: agent/eve-terra-l4-comparative-benchmark / PR #248
Target machine: Windows NVIDIA L4

## Mission

Extend the existing green Training #4 Water Cycle pipeline without rewriting historical results. The current orchestrator proves the pipeline and scientific Landsat access, but the present run has `packs_in_recipe=500000` while only one real scientific temporal window is trained. Replace that proof-only limitation with a staged, resumable, real multi-window streaming experiment, then run a fair Terra Agentic EO vs EVE-Instruct parity evaluation and generate an ESA-reviewable evidence report.

Do not merge PR #248. Do not fabricate data, results, EVE access, satellite pixels, throughput, provider success, environmental findings, or partnerships.

## Preserve frozen evidence

Do not modify or relabel historical results from PRs #239, #246, #247 or earlier Training #1/#2/#3/#4A. Preserve B01-B10 and M001-M006 as evaluation-only holdouts. Do not train on them.

## 1. Real multi-window streaming run

Implement a new production-grade streaming path rather than pretending 500k manifest recipes equal 500k trained scientific windows.

Required staged runs:

1. `stream-1k`: target 1,000 distinct quality-gated temporal scientific windows.
2. `stream-10k`: target 10,000.
3. `stream-50k`: target 50,000.

The runner must support resume so an interrupted 1k/10k/50k run continues from checkpoints and persisted acquisition/cache state.

### Data rules

- Use only official/public/legal sources.
- Historic optical core: USGS/NASA Landsat Collection 2 Level-2 scientific assets with QA_PIXEL.
- Recent detail may add Copernicus Sentinel-2 L2A through an already legal/available CDSE path; if unavailable, mark it unavailable and continue with valid Landsat rather than fabricating it.
- Do not download whole mission archives.
- Use windowed/range reads, local cache, acquisition-key deduplication and bounded retries/backoff.
- Cache catalogue resolution and reusable raster blocks.
- Preserve exact item/product IDs, acquisition timestamps, provider, sensor, processing level, native resolution and quality information.
- Landsat 7 SLC-off gaps must be masked, never treated as water loss.
- Cloud/fill/shadow/invalid pixels must be quality-gated.
- Tropical/polar windows must remain scientifically valid; unresolved slots are UNKNOWN, not invented.

### Streaming architecture

Implement an iterable/streaming dataset or equivalent bounded-memory producer-consumer path. Do not materialize 50k raster pairs in RAM.

Use a pipeline conceptually equivalent to:

`manifest recipes -> acquisition plan -> cache lookup -> official catalogue -> bounded raster window -> QA -> tensor queue -> CUDA training -> checkpoint -> metrics/provenance`

Requirements:

- asynchronous/bounded producer queue where safe;
- configurable worker count;
- bounded in-flight downloads;
- deterministic seed and stable split manifest;
- no train/final-holdout geographic leakage;
- checkpoint contains model, optimizer, scheduler if used, trained scientific-window count, acquisition cursor/state, seed and run schema;
- resume must not silently restart from zero;
- failed provider records are retained with reason/status but do not become fake training samples;
- skip/UNKNOWN counts are explicit;
- target count means **successfully quality-gated real temporal scientific windows actually consumed by training**, not manifest rows attempted.

### GPU utilization

The L4 must be genuinely exercised by training, not merely detected.

Capture at least every 2 seconds:
- timestamp
- GPU name
- GPU utilization %
- VRAM used/total
- memory utilization
- power draw
- temperature

Also capture CPU %, RAM used, queue depth where practical, data-wait time and training-step time.

Do not fail merely because utilization temporarily drops during provider I/O; report GPU starvation/data-wait explicitly.

### Scale gates

Run 1k first. Only continue to 10k when 1k passes all integrity/quality gates. Only continue to 50k when 10k passes.

A stage PASS requires:
- real_scientific_windows_trained equals requested stage target;
- no frozen benchmark/mission leakage;
- checkpoint exists and resume test passes;
- provider failures summarized;
- no NaN/inf training loss;
- provenance records exist for all consumed windows;
- training telemetry and elapsed time recorded.

If a provider or quota prevents the exact target, return `PROVIDER_BLOCKED` or `PARTIAL`, preserving exact count and reason. Never label partial work PASS.

## 2. Terra Agentic EO vs EVE-Instruct parity harness

Implement and execute at least a smoke comparison over:

- frozen B01-B10 Agentic EO benchmark;
- frozen M001-M006 ESA-aligned mission suite.

### Fairness

Main track: `Terra Agentic EO` vs `EVE-Instruct + the same read-only Terra parity tool capabilities`.

Do not compare Terra-with-tools to tool-less EVE and call it meaningful.

Normalize capabilities rather than internal function names:
- controlled source discovery;
- bounded official catalogue search;
- evidence/provenance verification;
- deterministic geospatial calculation;
- immutable training-context lookup;
- evidence-gap/next-observation candidates.

No arbitrary shell, unrestricted filesystem or arbitrary network tool is exposed to either model through the parity harness.

If official EVE-Instruct weights/runtime cannot be accessed reproducibly on the L4, record `EVE_RUNTIME_BLOCKED` with the exact public blocker. Do not emulate EVE with another model and label it EVE.

### Evaluation

No second-model judge. Use deterministic rubrics/frozen assertions.

Record separately:
- mission completion;
- plan validity;
- logical tool-routing success;
- provenance correctness;
- scientific claim safety;
- correct UNKNOWN behavior;
- controlled failure recovery;
- cross-sensor consistency where applicable;
- next-observation quality;
- latency;
- turns/tool calls;
- model/runtime/quantization;
- token counts when available;
- GPU/VRAM for local EVE execution.

For publishable comparison target 3 repetitions per case/system if resources permit. Retain every result. Never cherry-pick best runs. Smoke may use one repetition.

The public report must never say `Terra beats ESA`. State the exact tested configuration and limitations.

## 3. ESA-readiness report

Generate machine-readable JSON plus reviewer-readable Markdown under a new run-specific directory outside tracked Git by default, and create a sanitized compact publishable summary only after evidence validation.

Required sections:

### Reproducibility
- repository
- branch
- exact HEAD SHA
- UTC start/end
- command/launcher version
- config hashes
- random seed
- OS/Python

### Hardware/runtime
- NVIDIA L4 exact detected name
- torch version
- CUDA runtime
- driver version
- VRAM
- CPU model/logical cores when available
- RAM

### Scientific data execution
For 1k/10k/50k:
- requested target
- actual real scientific windows trained
- attempted/resolved/rejected/UNKNOWN counts
- provider distribution
- sensor/mission distribution
- year distribution
- category distribution
- QA/valid-pixel summary
- cache hits/misses
- bytes downloaded if measurable
- provider errors grouped by endpoint/status/reason
- acquisition throughput
- tensor/training throughput
- GPU wait-for-data fraction if measurable

### Training
- model architecture/version
- objective and explicit statement that training loss is not environmental truth
- steps
- batch size
- workers
- loss statistics
- checkpoint path/hash
- resume proof
- GPU telemetry summary: mean/p50/p95/max utilization, peak VRAM, power where available

### Agentic comparison
For Terra and EVE separately:
- exact model/runtime
- B01-B10 results
- M001-M006 results
- repetitions
- deterministic assertion totals
- strict case/mission passes
- tool-routing/provenance/UNKNOWN/failure-recovery dimensions
- latency and tool-call statistics
- raw result locations/hashes

### Provenance and safety
- evidence-class contract
- source IDs/hashes
- secret scan status
- TEST 001 leakage=false
- B01-B10 leakage=false
- M001-M006 leakage=false
- no generated satellite pixels

### Limitations / blockers
Explicitly list all unavailable providers, unresolved scientific windows, provider outages, EVE limitations, scale limitations and non-validated environmental claims.

## 4. Files and implementation quality

Keep modules small and testable. Reuse existing Training #4 architecture rather than introducing a disconnected pipeline.

Expected additions may include, adapting names to repository conventions:
- `terra_research_node/water_cycle_streaming.py`
- streaming cache/acquisition helpers under `training004_sources/`
- `scripts/run_training004_streaming_l4.py`
- `scripts/run_eve_terra_parity_l4.py`
- `scripts/build_training004_esa_readiness_report.py`
- `scripts/run_training004_esa_readiness_l4.ps1`
- tests for streaming/resume/count integrity/cache/leakage/parity/report schemas.

Before live execution require:
- tracked secret scan PASS
- Ruff PASS
- MyPy PASS for affected modules
- full Pytest PASS
- compileall PASS

Do not commit credentials, local Windows Credential Manager material, model weights, raw research runs, raster caches or large checkpoints.

## 5. Execution order on L4

After implementation and green tests:

1. verify USGS M2M login + scientific download preflight;
2. verify CUDA/NVIDIA L4;
3. run streaming smoke/resume test;
4. execute stream-1k;
5. if PASS execute stream-10k;
6. if PASS execute stream-50k;
7. execute Terra B01-B10 + M001-M006 smoke parity;
8. execute EVE B01-B10 + M001-M006 smoke parity if official EVE runtime is available;
9. optionally run 3 repetitions if stable and affordable;
10. build ESA-readiness JSON + Markdown;
11. validate/sanitize report;
12. print final compact summary.

## Final console contract

Print exactly one final status block containing at least:

`TRAINING004_ESA_READINESS=<PASS|PARTIAL|BLOCKED|FAIL>`
`HEAD=<sha>`
`STREAM_1K=<PASS|PARTIAL|BLOCKED|FAIL> real_windows=<n>`
`STREAM_10K=<PASS|PARTIAL|BLOCKED|FAIL> real_windows=<n>`
`STREAM_50K=<PASS|PARTIAL|BLOCKED|FAIL> real_windows=<n>`
`TERRA_PARITY=<PASS|PARTIAL|FAIL>`
`EVE_PARITY=<PASS|BLOCKED|PARTIAL|FAIL>`
`GPU=NVIDIA L4`
`REPORT_JSON=<path>`
`REPORT_MD=<path>`
`RAW_RUN_DIR=<path>`

PASS is allowed only when all requested executed stages genuinely passed. A blocked external dependency must be reported honestly rather than hidden.
