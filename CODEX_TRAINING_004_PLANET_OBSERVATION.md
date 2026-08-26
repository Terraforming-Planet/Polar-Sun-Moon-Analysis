# CODEX TASK — Training #4 Planet Observation Multi-Source Streaming + ESA/EVE Agentic EO Lessons

Repository:
https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis

Branch:
`agent/eve-terra-l4-comparative-benchmark`

## Mission

Implement **Training #4** as the next reproducible Terra Observation research run.

The objective is not to determine whether Terra or ESA/EVE is globally "better". The objective is to build a better public-good planetary observation system by combining:

1. a faster, better-instrumented large-stream Earth-observation vision training pipeline on NVIDIA L4; and
2. a fair Agentic EO reasoning/evaluation track where Terra and EVE learn lessons from the same structured evidence and failures.

Preserve all existing scientific guardrails. Do not fabricate observations, labels, environmental findings or causal mechanisms.

Use `config/training-004-planet-observation.json` as the machine-readable contract.

## Training #3 evidence to preserve

Reference run:
`docs/published/training-runs/stream_gibs_20260820T013036Z/`

Observed facts:
- 200,016 remote geospatial/time windows were decoded and used for optimization;
- elapsed ~3293.797 s;
- 60.7251 windows/s;
- 2.5345 steps/s;
- batch size 24;
- 32 workers;
- 1,822,759,168 downloaded bytes;
- only 2 recorded failures;
- 156,863 unique payload hashes (78.43% content unique).

Important diagnosis:
`24 * 2.5345 ~= 60.8 samples/s`, almost identical to the observed 60.7 streamed windows/s. The existing `streaming_gibs_training.py` couples fetch completion, PIL decoding, batch accumulation and GPU optimization in one control loop. Training #4 must explicitly decouple these stages and measure data starvation instead of merely increasing worker count.

Do not claim that Training #3 proved an environmental finding. Its own published analysis states that environmental conclusions were not established by that training run alone.

## Phase 1 — instrument before optimizing

Before changing concurrency, add measurable timing and utilization for:
- remote fetch latency p50/p95;
- bytes/s per source host;
- HTTP status/retry/backoff counts;
- image decode/preprocess latency p50/p95;
- CPU utilization;
- decoded-ready queue depth;
- pinned-memory-ready queue depth if separate;
- GPU utilization;
- GPU memory used;
- GPU power where `nvidia-smi` exposes it;
- time GPU training waits for data;
- training step duration;
- cache hit/miss counts;
- unique content hashes and duplicate rate.

Write machine-readable JSONL telemetry during the run and aggregate into `metrics.json`.

## Phase 2 — producer/consumer pipeline v2

Replace the single tightly-coupled loop with bounded stages.

Suggested architecture:

`task planner -> async/network producers -> raw-byte cache/queue -> decode/preprocess workers -> pinned-memory batch queue -> GPU trainer`

Requirements:
- bounded queues to prevent unbounded RAM growth;
- clean cancellation at time/target boundary;
- no deadlock if a producer fails;
- explicit sentinels/shutdown;
- every accepted patch retains source provenance;
- failures are logged, not silently dropped;
- use exponential backoff/jitter for temporary upstream failures and HTTP 429/5xx;
- respect provider rate limits; do not use aggressive concurrency as a substitute for good batching/caching.

Prefer async HTTP or persistent connection pools for network-bound work. Use a process pool for CPU-heavy image decode/resize only if profiling shows decode is a material bottleneck. Do not assume more CPU is automatically better.

## Phase 3 — reduce HTTP request amplification

Training #3 treated each 512x512 WMS window as a separate remote fetch.

For Training #4, where the official source supports it:
- prefer WMTS/tiled access over repeated custom WMS rendering;
- fetch larger official tiles/chunks and split them into multiple local 512x512 training patches;
- for COG/range-capable assets, read only AOI windows;
- for STAC, query metadata first and retrieve only required assets/windows;
- never download entire satellite archives;
- never bypass service terms/rate limits.

Count separately:
- remote source requests;
- remote source bytes;
- decoded source chunks;
- training patches derived from those chunks.

Do not call multiple local crops "multiple source scenes".

## Phase 4 — source adapters

Keep each provider modular and official/public only.

Priority image sources for the vision lane:
1. NASA GIBS MODIS/VIIRS imagery — preserve as a reliable public baseline.
2. USGS/NASA Landsat — long record, using official catalogue/windowed assets where practical.
3. Copernicus/CDSE Sentinel-1/2/3 — only through official/public/legal interfaces available to the environment.

Do not require every source for the first smoke run. Training #4 must remain capable of running a NASA-GIBS-only smoke test, then progressively add adapters.

Do not mix sensor products blindly. Record sensor/source family and normalization choices so the model does not silently treat radar and RGB imagery as identical modalities.

## Phase 5 — vision training target

Initial full target:
- 500,000 **training patches actually used for optimization**;
- 512x512;
- self-supervised objective allowed;
- target content-unique rate >= 85% if source coverage permits;
- preserve independent geography/time validation/holdout partitions.

This is not a requirement for 500,000 HTTP requests. Reuse larger fetched source chunks responsibly.

Before full run, execute:
1. 5-minute pipeline calibration;
2. 20,000-patch smoke run;
3. only if smoke gates pass, run the 500,000-patch target.

No fixed runtime promise. Report achieved throughput and limiting stage honestly.

## Phase 6 — hardware adaptation

Target environment:
- NVIDIA L4 ~24 GB VRAM;
- recommended 12–16 vCPU;
- recommended 32–64 GB RAM;
- fast ephemeral NVMe/cache.

Automatic logic:
- detect GPU/VRAM/CUDA;
- choose safe batch size and mixed precision;
- use pinned memory/non-blocking transfer;
- adapt prefetch depth;
- do not crash just because optional telemetry is unavailable.

Bottleneck classification:
- **data/network bound:** GPU utilization is low, ready queue repeatedly empty, CPU is not saturated;
- **CPU/decode bound:** GPU low + ready queue empty + decode workers/CPU saturated;
- **GPU bound:** ready queue healthy + GPU utilization high;
- **remote latency bound:** low local CPU pressure, modest raw network bandwidth, but high fetch p95 and many small requests.

Generate a final `bottleneck_classification.json` with supporting metrics, not just a guess.

## Phase 7 — Agentic EO Public Good lane

Reuse the separate curriculum already added on this branch:
- `config/agentic-eo-public-good-training-v1.json`
- `datasets/agentic-eo-public-good-v1/`
- `scripts/build_agentic_eo_public_good_dataset.py`

Keep `config/agentic-eo-benchmark-v1.json` B01–B10 untouched and excluded from training/adaptation.

The public-good lane must evaluate behavior useful for planetary monitoring:
- selecting the correct official source for a phenomenon;
- stating sensor scale/limitations;
- flood/water monitoring under cloud;
- river morphology and multi-decadal comparability;
- fire vs temperature context;
- drought/vegetation stress;
- soil-moisture and terrestrial-water-storage scale limits;
- missing data and tool failures;
- provenance;
- unsupported-causality refusal;
- deterministic calculations.

## Phase 8 — shared evidence package

Create a versioned structure such as `terra-eo-evidence-package/v1` that both Terra and EVE can receive in the reasoning track.

Include only supported fields, for example:
- source agency;
- mission;
- instrument;
- acquisition/observation date;
- AOI/bbox;
- resolution;
- cloud/quality metadata where available;
- deterministic derived metrics;
- evidence class;
- known limitations;
- catalogue/product/acquisition identifiers;
- official source URL;
- hashes for locally derived artifacts where useful.

Do not include an answer key.

A catalogue entry is not proof a scene was analysed. A model output is not an observation. A training loss is not environmental ground truth.

## Phase 9 — EVE integration honesty

Preferred order:
1. use an official hosted EVE endpoint/API if documented and accessible;
2. otherwise use the official `eve-esa/EVE-Instruct-GGUF-Q4_K_M` checkpoint on an **ephemeral cloud L4**, not the user's local disk.

Never commit EVE weights/cache.

If using Q4, label the run `EVE-Instruct Q4_K_M`. Do not call it full BF16 EVE.

EVE-Instruct is treated as text-first for this experiment unless the exact tested endpoint/model proves direct image support. Therefore EVE receives the same structured evidence package rather than being falsely described as having inspected raw pixels.

Terra and EVE may each produce a readable "lessons learned" section after evaluation, but that self-reflection is qualitative. Benchmark scoring must remain deterministic and external to the models.

## Phase 10 — before/after protocol

Order is mandatory:
1. freeze pre-adaptation Terra/EVE baseline;
2. record baseline on internal holdout + frozen B01–B10;
3. run Training #4 vision lane and allowed system adaptation/curriculum work;
4. evaluate untouched internal holdout once;
5. evaluate untouched B01–B10 again;
6. publish all regressions and failures;
7. write system lessons.

Do not tune repeatedly on B01–B10.

Do not select the best random run and hide worse repetitions.

## Phase 11 — lessons report

Generate both JSON and Markdown with sections:
- What Training #4 improved in the data pipeline;
- Remaining data bottleneck;
- Shared Terra + EVE strengths;
- Shared failure modes;
- Terra-specific failure modes;
- EVE-specific failure modes for the tested configuration;
- Which problems are model problems vs tool/registry/data problems;
- Which observations require new sensors/data rather than more AI;
- Recommended next engineering changes;
- Recommended next scientific validation;
- What is still UNKNOWN.

The report must never use the headline "Terra beats ESA" or the reverse.

Preferred framing:
**What can these systems teach us about building a more reliable open planetary observation architecture?**

## Required outputs

Suggested run folder:
`research_runs/training_004_<timestamp>/`

Minimum artifacts:
- `config.json`
- `device.json`
- `source_manifest.json`
- `telemetry.jsonl`
- `metrics.json`
- `bottleneck_classification.json`
- `failures.jsonl`
- `vision_training_manifest.json`
- `agentic_dataset_manifest.json`
- `evidence_packages/`
- `evaluation_before.json`
- `evaluation_after.json`
- `lessons.json`
- `lessons.md`

Publish only compact, sanitized summaries under `published/training-runs/`. Do not publish checkpoints, caches, raw credentials or huge source data.

## Tests

Add unit/integration tests for:
- bounded queue shutdown;
- source retry/backoff;
- no duplicate task counting;
- source-chunk -> patch provenance;
- training patch vs source scene terminology;
- adaptive bottleneck classifier;
- B01–B10 exclusion from curriculum;
- evidence-package schema;
- secret/chain-of-thought exclusion from published artifacts;
- CPU fallback for non-training dry-run utilities;
- no fake environmental-ground-truth flags.

Run Ruff, MyPy, Pytest and existing CI.

## Acceptance gate

Do not merge until:
- Training #4 pipeline implementation exists;
- smoke dataset build succeeds;
- telemetry can identify GPU/data/CPU starvation;
- 20k smoke run succeeds on L4 or a reproducible infrastructure blocker is documented;
- EVE is either reached through an official hosted endpoint or run from an official checkpoint in ephemeral cloud storage;
- the internal holdout and B01–B10 remain untouched by optimization;
- report language is scientifically honest;
- CI is green.

The goal is not maximum throughput at any cost. The goal is a reproducible, scalable, evidence-first Earth-observation system that can improve through measured lessons.
