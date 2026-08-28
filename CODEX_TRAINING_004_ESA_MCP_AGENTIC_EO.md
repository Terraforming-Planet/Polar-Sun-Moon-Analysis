# CODEX TASK — Training #4: ESA-aligned MCP Agentic EO Mission Protocol

Repository:
https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis

Branch / research PR:
`agent/eve-terra-l4-comparative-benchmark` / PR #248

## Why this exists

Training #4 must be more than a larger image stream and more than a Terra-vs-EVE scorecard.

The research question is:

> Can a provenance-first Agentic EO system turn a high-level environmental objective into a reliable, auditable, multi-source observation workflow, recover from missing/bad data, and explain what evidence is still needed before a decision?

This directly supports the public-good goal of making planetary resource management easier to understand: river and lake change, flood response, dryland/water restoration research, protected-area monitoring and other lawful environmental uses.

The comparison with ESA EVE is a shared-learning experiment, not an organizational ranking.

## ESA alignment

Design the protocol so the evidence maps naturally to the current ESA Φ-lab Agentic AI Systems for Earth Observation research directions:

- OBJ1 — reliable Agentic AI for EO;
- OBJ3 — long-horizon planning and scientific reasoning;
- OBJ4 — trustworthy tool use, verification, self-correction and uncertainty;
- OBJ5 — reproducible benchmarking and evaluation.

Do not claim selection, partnership, endorsement or privileged ESA access.

## High-leverage addition: MCP interoperability

Create a minimal **read-only MCP-compatible adapter** around deterministic Terra EO capabilities.

The adapter exists to make the tool layer interoperable with multiple agent runtimes, including a future EVE-compatible test, without giving a model unrestricted shell/network access.

### Initial allow-listed logical tools

Expose only narrowly-scoped capabilities such as:

1. `eo_source_search`
   - query approved official/public source registry;
   - return source/sensor/temporal/spatial availability and limitations;
   - no arbitrary URL fetch.

2. `stac_scene_search`
   - search approved STAC/catalog endpoints for an AOI/time/sensor;
   - enforce AOI/time/result-count limits;
   - return scene/product identifiers and provenance.

3. `evidence_verify`
   - validate required provenance fields;
   - distinguish observation, derived metric, model output and hypothesis;
   - return explicit UNKNOWN/INSUFFICIENT states.

4. `deterministic_geo_calculate`
   - bounded deterministic calculations already supported by the repository;
   - no model-generated code execution.

5. `training_context_lookup`
   - retrieve immutable Training #1/#2/#3 metadata/results and Training #4 configuration;
   - never rewrite historical scores.

6. `next_observation_candidates`
   - rank only approved sensors/sources against explicit evidence gaps;
   - return reasons and limitations, not a fabricated observation.

### MCP security boundary

The MCP layer must NOT provide:

- shell execution;
- arbitrary Python execution;
- arbitrary file reads;
- arbitrary URL/network access;
- secret/environment-variable access;
- write/delete operations against external services;
- unrestricted surveillance or private-data tools.

All external EO data must remain official/legal/public or explicitly authorized for the experiment.

## Training #4 data plane

Keep the planned large-stream architecture, but separate the data plane from the reasoning plane.

### Data plane A — vision / EO streaming

Use real official EO observations and deterministic preprocessing.

Priority sources:

- Sentinel-1 / NASA OPERA RTC-S1 (SAR C-band);
- Sentinel-2 optical;
- Landsat historical optical;
- Sentinel-3 where scientifically appropriate;
- Copernicus DEM;
- NASA OPERA DSWx-S1 where available for surface-water reference;
- JAXA PALSAR/PALSAR-2 L-band as an independent cross-sensor/holdout source only where legal/public access is verified.

Do not download whole archives. Query AOI/time windows and cache only required chunks.

### Data plane B — evidence package

Convert each observation batch into a compact, machine-readable evidence package containing at minimum:

- mission/task id;
- AOI geometry and CRS;
- acquisition UTC;
- source/provider;
- mission/platform;
- sensor/product;
- product/scene/catalog id;
- processing level;
- quality/cloud/valid-pixel fields when available;
- deterministic derived metrics;
- uncertainty/limitations;
- evidence class: OBSERVED / DERIVED / MODEL / HYPOTHESIS / UNKNOWN;
- immutable provenance links/identifiers;
- missing-evidence list.

The language agent reasons over the evidence package. Do not pretend current EVE-Instruct directly interprets raw EO pixels if the tested runtime is text-only.

## Producer-consumer streaming architecture

Training #3 coupled fetch/decode/batch/training too tightly. Training #4 must measure and decouple the stages:

`catalog/API -> chunk cache -> parallel decode/preprocess -> bounded queue -> L4 vision step -> evidence package -> agent mission`

Requirements:

- producer/consumer queues;
- configurable prefetch depth;
- local ephemeral cache/NVMe when available;
- async/concurrent catalog/data acquisition with provider-friendly rate limits;
- bounded retries with jitter/backoff;
- resumable manifests;
- no silent replacement of failed data with synthetic observations.

Capture:

- fetch throughput;
- request latency p50/p95;
- decode/preprocess time;
- queue depth;
- GPU utilization/VRAM;
- GPU wait-for-data time;
- training/inference step time;
- bytes downloaded;
- cache hit rate;
- failure/retry counts.

## Mission-style Agentic EO evaluation

Do not evaluate only isolated questions. Add a small frozen mission suite representing multi-step EO work.

Use `config/training-004-esa-agentic-missions-v1.json`.

Each mission must require some combination of:

- objective decomposition;
- source selection by era/physics;
- catalog/STAC lookup;
- evidence verification;
- deterministic calculation;
- cross-sensor validation;
- adaptation when an expected source fails;
- explicit uncertainty;
- a stop condition when evidence is insufficient;
- a next-observation recommendation.

### Mission examples

1. **Lake decline / recovery evidence**
   - determine whether surface-water area changed over a defined multi-year window;
   - distinguish area from volume;
   - identify what extra evidence is needed before proposing restoration feasibility research.

2. **Flood under cloud**
   - optical source is unusable due cloud;
   - agent should route to Sentinel-1/approved SAR evidence;
   - avoid interpreting event catalogs as flood-depth measurements.

3. **Historic river-channel change**
   - require Landsat-era source selection for old dates and Sentinel-era evidence for recent dates;
   - separate channel morphology observation from causal claims.

4. **Dryland / paleochannel candidate**
   - combine optical + SAR + DEM;
   - report a candidate for hydrological/geological investigation, not an instruction to excavate or redirect water.

5. **Tool outage / source failure**
   - inject one controlled catalog/API failure;
   - agent must retry within policy, choose an allowed alternative or stop honestly.

6. **Cross-sensor generalization**
   - build primary reasoning on Sentinel-1 C-band;
   - evaluate an unseen or held-out JAXA L-band evidence package where access permits;
   - measure whether conclusions rely on source-specific appearance or transferable evidence semantics.

## Terra + EVE shared-learning protocol

Run the same mission/evidence contracts through:

- Terra Agentic EO;
- EVE-Instruct configuration available to the experiment.

Preferred EVE order:

1. official hosted EVE/API access if legitimately available;
2. otherwise official open checkpoint on cloud L4, not the user's personal device;
3. record exact model/runtime/quantization so results are not attributed to an untested full ESA stack.

If EVE is tested through the Terra MCP parity layer, label it exactly:

`EVE-Instruct + Terra MCP parity harness`

Do not label that as the complete official ESA agent platform.

## Before/after learning design

Do not train on the frozen evaluation missions.

Use:

1. baseline BEFORE;
2. separate training/curriculum split;
3. validation;
4. untouched holdout;
5. AFTER evaluation;
6. frozen historical B01-B10 external control.

No leakage from B01-B10 or mission holdout into training prompts/examples/LoRA data.

For Terra, learning may improve orchestration, routing, retrieval, validators and prompts unless a legitimately trainable model component is explicitly introduced.

For EVE, do not fine-tune until the baseline is captured. If LoRA/adapters are later attempted, preserve the original baseline and exact adapter configuration.

## Metrics

Report separate metrics rather than one winner score:

- mission completion rate;
- plan validity;
- tool-selection accuracy;
- tool-call success rate;
- evidence/provenance completeness;
- unsupported-claim rate;
- explicit-UNKNOWN correctness;
- self-correction/recovery rate;
- cross-sensor consistency;
- next-observation usefulness against deterministic rubric;
- latency;
- number of agent turns/tool calls;
- GPU/VRAM telemetry where comparable;
- data-plane efficiency metrics.

Never hide scientific correctness behind a weighted speed score.

## Deterministic scoring

The final benchmark score must not be decided by another LLM.

Use deterministic assertions for:

- required source families;
- forbidden unsupported claims;
- provenance fields;
- expected deterministic numeric calculations;
- correct UNKNOWN behavior;
- expected response to injected tool failures;
- stop/continue conditions.

An LLM may generate a qualitative lessons section, but self-evaluation is not ground truth.

## Lessons artifact

After the final run create a reviewer-readable report with:

1. what both systems did well;
2. shared failure modes;
3. Terra-specific failure modes;
4. tested EVE-configuration failure modes;
5. data/provider bottlenecks;
6. MCP/tool-schema weaknesses;
7. streaming/GPU bottlenecks;
8. scientific evidence gaps;
9. concrete changes for Training #5.

Use wording such as `tested Terra configuration` and `tested EVE-Instruct configuration`, never `Terra beats ESA`.

## ESA application evidence artifact

If Training #4 produces real completed artifacts before the application deadline, add a short linkable evidence note that shows:

- exact mission contract;
- exact tool contract;
- one sanitized execution trace;
- one controlled failure/self-correction trace;
- deterministic score summary;
- L4/data-plane telemetry;
- known limitations;
- what would be researched next at Φ-lab.

Do not claim completed evidence before the run exists.

## Acceptance gates

Do not merge experimental Training #4 work into `main` until:

- MCP adapter implementation is read-only and allow-listed;
- unit tests run without external credentials;
- no secrets/weights/cache committed;
- mission suite is frozen before model results are inspected;
- baseline runs are preserved;
- real L4 smoke test is captured or a reproducible blocker is documented;
- public artifacts are generated from real run outputs;
- Ruff, MyPy, Pytest and repository CI are green;
- scientific and attribution boundaries remain explicit.

## Success criterion

A reviewer should be able to see that Terraforming Planet is not merely using an LLM to answer EO questions. It is experimenting with an interoperable, provenance-first agent architecture that can plan multi-source Earth-observation work, call bounded tools, recover from failures, expose uncertainty and learn from reproducible mission-level evaluation.
