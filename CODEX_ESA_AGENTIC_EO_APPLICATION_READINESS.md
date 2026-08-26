# CODEX TASK — ESA Φ-lab Agentic AI application readiness

Repository:
https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis

Target opportunity:
ESA Φ-lab — Opportunity for Visiting Researchers in Agentic AI Systems for Earth Observation
Official deadline: 31 August 2026.

## Mission

Make the public repository a concise, reproducible and scientifically honest technical portfolio for the Agentic AI Systems for Earth Observation opportunity.

Do **not** try to optimize for marketing claims or pretend that acceptance is guaranteed. Do not claim ESA partnership, affiliation, endorsement, privileged data access, or completed work that has not been run. The strongest application is evidence that the existing system already performs relevant Agentic EO work and that the proposed next research steps are technically credible.

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
- open PR #248 for EVE-Instruct comparison and Training #4 research design

Historical benchmark results and historical training artifacts are immutable evidence. Never edit an old score after seeing a new model result.

## Primary research alignment

Demonstrate concrete alignment with the ESA call without copying buzzwords into the UI.

### OBJ1 — Reliable Agentic AI for EO
Show the existing manager/specialist architecture, constrained tool use, official/public EO source registry, provenance and uncertainty handling.

### OBJ3 — Long-horizon planning and scientific reasoning
Show how a question is decomposed into source selection, acquisition/evidence verification, deterministic calculation, cross-sensor validation and next-observation planning.

### OBJ4 — Trustworthy tool use and autonomous decision making
Show allow-listed tools, failed-tool recovery, source limitations, no fabricated observations, evidence classes and explicit UNKNOWN states.

### OBJ5 — Benchmarking and evaluation
Preserve the deterministic B01-B10 benchmark, public traces, reproducibility, failure reporting and the planned Terra ↔ EVE comparison. Do not use a second LLM as the final judge.

## TP-26 public portfolio section

Verify the new public section on `/constellation/` titled:

`Training #4 · Multi-Sensor SAR · Agentic EO`

It must explain that TP-26 is a virtual research federation/router, not a claim that Terraforming Planet owns or controls provider satellites.

The section should communicate:

- Sentinel-1 C-band + NASA OPERA RTC-S1 are already integrated;
- JAXA PALSAR/PALSAR-2 L-band is a planned independent cross-sensor research source only where legal/public access is verified;
- optical + SAR + DEM + official water products can provide complementary evidence;
- Training #4 is planned, gated and not presented as completed;
- Terra + EVE is a shared-lessons experiment, not an organizational ranking;
- listing ESA/NASA/JAXA/USGS/NOAA etc. does not imply partnership or endorsement.

Keep `docs/constellation/index.html` and `web/public/constellation/index.html` semantically synchronized.

## Application evidence packet

Create `docs/ESA_AGENTIC_EO_APPLICATION_PACKET.md` as a reviewer-readable technical evidence index.

Keep it short enough to scan in about 2 minutes. Include:

1. Project name and one-sentence public-good purpose.
2. Public repository and live demo links.
3. What is already implemented today.
4. Agentic EO architecture in no more than 8 bullets.
5. Reproducible runner command.
6. Existing benchmark evidence and exact limitations.
7. Existing Sentinel-1 SAR / TP-26 evidence.
8. Training #1/#2/#3 evidence and why Training #4 is the next step.
9. Proposed research contribution if selected by Φ-lab: trustworthy multi-source Agentic EO planning, cross-sensor evidence packages, EVE/Terra failure analysis and scalable TP-26 routing.
10. Explicit non-claims: no ESA affiliation, no guaranteed environmental ground truth, no earthquake prediction claim, no causal conclusion from satellite morphology alone.

Link only to real repository files/pages and official/public sources.

## Live demonstration gate

Before declaring application readiness, reproduce the existing Agentic EO demo using the real coordinator where credentials are available. If credentials are not available in CI, tests must still verify the deterministic tool layer without making a fake live-run claim.

A public run is valid only if it records observable tool lifecycle boundaries and verifies provenance without exposing:

- API keys/tokens;
- environment variables;
- chain-of-thought;
- private prompts;
- raw authorization data.

## PR #248 boundary

Do NOT merge PR #248 merely to make the application look more advanced.

PR #248 remains experimental until its own merge gates are satisfied, including real EVE access/runtime evidence, comparison implementation, L4 smoke evidence and green CI.

The application packet may link to PR #248 as **ongoing planned research**, clearly labelled as such.

## Quality and scientific honesty

Required before merge of this application-readiness work:

- Ruff green;
- Pytest green;
- MyPy green;
- repository CI green;
- no secrets;
- no broken links introduced;
- docs/public constellation copies checked;
- no unsupported claims;
- no claim that a provider registry entry proves an observation was downloaded or analysed;
- no claim that SAR preview brightness is calibrated backscatter;
- no claim that mapped area alone proves water volume or hydrological cause.

## Deliverables

1. `docs/ESA_AGENTIC_EO_APPLICATION_PACKET.md`
2. tests protecting the TP-26 Agentic EO public section and non-affiliation wording
3. any minimal link/navigation improvement needed so a reviewer can reach the Agentic EO evidence quickly
4. a final PR summary that separates:
   - implemented now;
   - reproduced in this PR;
   - planned next research;
   - known limitations.

## Success criterion

A technically experienced ESA Φ-lab reviewer should be able to open the repository and quickly verify that Terraforming Planet already contains a real provenance-first Agentic EO experiment, SAR/optical/DEM evidence paths and reproducible evaluation — while also seeing that the project is careful about uncertainty, source limitations and unfinished research.

Do not optimize for “looking finished”. Optimize for evidence, reproducibility and learning value.
