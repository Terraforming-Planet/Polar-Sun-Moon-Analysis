# CODEX TASK — ESA Φ-lab Agentic AI application readiness

Repository:
https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis

Target opportunity:
ESA Φ-lab — Opportunity for Visiting Researchers in Agentic AI Systems for Earth Observation
Official deadline: 31 August 2026.

## Mission

Make the public repository a concise, reproducible and scientifically honest technical portfolio for the Agentic AI Systems for Earth Observation opportunity.

Do **not** optimize for marketing claims or imply guaranteed acceptance. Do not claim ESA partnership, affiliation, endorsement, privileged data access, or completed work that cannot be evidenced. The strongest application is verifiable engineering/research work plus clearly separated limitations and next research steps.

All long-run evidence handling is governed by `docs/TRAINING_EVIDENCE_POLICY.md`.

## Canonical training history

Preserve this numbering exactly:

1. Training #1 — 60-minute NVIDIA L4 baseline.
2. Training #2 — 60-minute expanded site-corpus NVIDIA L4 run.
3. Training #3 — global NASA GIBS streaming run.
4. Training #4 — **two 60-minute NVIDIA L4 sessions on 2026-08-28, 120 minutes total**.

The second 60-minute session of Training #4 is **not** Training #5. Refer to the two runs as Training #4 session 1 and Training #4 session 2 (or by immutable run IDs).

Do not create a Training #5 label unless a genuinely new training stage is later designed and executed.

## Training #4 evidence status

Training #4 is no longer merely a planned research design. Real NVIDIA L4 training was executed.

The public `docs/research/training-004/summary.json` currently contains verified metrics for a completed 60-minute Landsat spectral-temporal session, including real scientific temporal pairs, CUDA execution, optimization metrics, validation metrics and checkpoint SHA-256.

A second 60-minute L4 session is part of the same Training #4 stage. The Windows L4 disk must be searched and exported before deletion so both sessions' original evidence can be classified correctly.

Until recovery/export is complete:

- do not invent metrics for a session whose original saved output has not been verified;
- do not describe screenshot reconstruction as original raw console output;
- distinguish `RAW_VERIFIED`, `RAW_FOUND_UNVERIFIED`, `DERIVED_EVIDENCE`, `RECOVERED_EVIDENCE` and `MISSING`;
- state exactly which session a public metric belongs to.

Use `scripts/export_all_training_logs_l4.ps1` on the existing Windows NVIDIA L4 machine to recover/export Training #1–#4 evidence before the disk is removed.

## Existing evidence to preserve

Audit and reuse rather than rewriting history:

- `terra_research_node/agentic_eo.py`
- `scripts/run_agentic_eo_live.py`
- `docs/ESA_AGENTIC_EO.md`
- `docs/AGENTIC_EO_BENCHMARK.md`
- `config/agentic-eo-benchmark-v1.json`
- published Agentic EO benchmark artifacts
- TP-26 provider/adaptor registry
- Sentinel-1 / NASA OPERA RTC-S1 Sahara SAR runtime
- `data/training/paleoriver_8/` SAR/DEM/optical schema
- published NVIDIA L4 Training #1/#2/#3 evidence
- published Training #4 Landsat spectral-temporal evidence
- recovered Training #4 console evidence, clearly labelled as recovered where raw transcript is absent
- historical full-log archive hashes
- PR #248 and related EVE/Terra research only where its own evidence gates are satisfied

Historical benchmark results and historical training artifacts are immutable evidence. Never edit an old score after seeing a new model result.

## Mandatory evidence standard for application claims

A completed long-run claim should include or point to:

- immutable run/session ID;
- exact Git commit/ref;
- exact command/arguments;
- full stdout/stderr where originally persisted;
- shell transcript where available;
- GPU/CPU/software preflight;
- data/provenance manifest;
- periodic and final metrics;
- failures/retries/fallbacks;
- checkpoint/model hash when weights changed;
- evidence package SHA-256;
- explicit limitations and non-claims.

If required raw evidence is missing, say so. Missing raw logs reduce auditability but must not be hidden by rewriting history.

## Primary research alignment

### OBJ1 — Reliable Agentic AI for EO
Show the existing manager/specialist architecture, constrained tool use, official/public EO source registry, provenance and uncertainty handling.

### OBJ3 — Long-horizon planning and scientific reasoning
Show how a question is decomposed into source selection, acquisition/evidence verification, deterministic calculation, cross-sensor validation and next-observation planning.

### OBJ4 — Trustworthy tool use and autonomous decision making
Show allow-listed tools, failed-tool recovery, source limitations, no fabricated observations, evidence classes and explicit UNKNOWN states.

### OBJ5 — Benchmarking and evaluation
Preserve deterministic benchmarks, public traces, reproducibility and failure reporting. Do not use a second LLM as the final judge of scientific correctness.

## Public-good research purpose

The project aims to improve how official/public Earth-observation evidence can support work on water, floods, fires, drought, glaciers, ecosystems and infrastructure.

The technical objective is not autonomous control of the environment. The objective is faster, better-audited decision support: identify what changed, quantify what can be measured, expose uncertainty, recommend the next evidence check and keep consequential decisions with qualified humans and authorities.

Do not claim that a model run itself saves lives. The defensible claim is that reliable, timely EO evidence can support people who make safety, environmental and emergency decisions.

## TP-26 public portfolio section

Verify the public `/constellation/` Agentic EO / multi-sensor material remains scientifically accurate.

It must explain that TP-26 is a virtual research federation/router, not a claim that Terraforming Planet owns or controls provider satellites.

The section should communicate:

- Sentinel-1 C-band + NASA OPERA RTC-S1 are integrated where evidenced;
- JAXA PALSAR/PALSAR-2 L-band is used/planned only where legal/public access is verified;
- optical + SAR + DEM + official water products provide complementary evidence;
- completed Training #4 evidence is linked without overstating raw-log completeness;
- Terra + EVE comparisons are research comparisons, not organizational rankings;
- listing ESA/NASA/JAXA/USGS/NOAA etc. does not imply partnership or endorsement.

Keep `docs/constellation/index.html` and `web/public/constellation/index.html` semantically synchronized when editing this section.

## Application evidence packet

`docs/ESA_AGENTIC_EO_APPLICATION_PACKET.md` should let a reviewer scan the technical evidence quickly.

Include:

1. Project name and one-sentence public-good purpose.
2. Public repository and live demo links.
3. What is implemented today.
4. Agentic EO architecture in no more than 8 bullets.
5. Reproducible runner commands.
6. Existing benchmark evidence and exact limitations.
7. Existing Sentinel-1 SAR / TP-26 evidence.
8. Training #1–#4 evidence, with Training #4 explicitly described as two 60-minute sessions / 120 minutes total.
9. Evidence completeness status for every long run.
10. Proposed research contribution if selected: trustworthy multi-source Agentic EO planning, cross-sensor evidence packages, failure analysis and scalable routing.
11. Explicit non-claims: no ESA affiliation, no guaranteed environmental ground truth, no earthquake prediction claim, no causal conclusion from satellite morphology alone.

Link only to real repository files/pages and official/public sources.

## Live demonstration gate

Before declaring application readiness, reproduce the existing Agentic EO demo using the real coordinator where credentials are available. If credentials are unavailable in CI, tests may verify deterministic tool behavior but must not fabricate a live-run claim.

A public run may record observable tool lifecycle boundaries and provenance, but must not expose:

- API keys/tokens;
- environment variables containing secrets;
- private prompts;
- raw authorization data;
- hidden chain-of-thought.

## Quality and scientific honesty

Required before merge of application-readiness changes:

- Ruff green;
- Pytest green;
- MyPy green;
- repository CI green;
- no secrets;
- no broken links introduced;
- no unsupported claims;
- no claim that a provider registry entry proves an observation was downloaded or analysed;
- no claim that SAR preview brightness is calibrated backscatter unless calibration evidence exists;
- no claim that mapped area alone proves water volume or hydrological cause;
- no long-run completion claim without an explicit evidence completeness state.

## Success criterion

A technically experienced reviewer should be able to open the repository and quickly verify what Terraforming Planet actually executed, what each training stage learned or demonstrated, what evidence exists, what evidence is still missing, and what research questions remain open.

Do not optimize for “looking finished”. Optimize for evidence, reproducibility, scientific restraint and learning value.
