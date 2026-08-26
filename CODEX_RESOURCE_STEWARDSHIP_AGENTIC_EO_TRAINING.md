# CODEX TASK — Resource Stewardship Agentic EO Curriculum

Repository:
https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis

## Goal

Implement a rigorous, provenance-first training/evaluation curriculum that teaches Terra Observation System to reason about water resources, river/lake change, drylands, flood exposure, protected areas and earthquake impact without crossing scientific or legal boundaries.

Use `docs/resource-stewardship-agentic-eo-training.md` as the specification.

## Required principles

1. Use only legal, official or public sources already supported by the repository or added through a documented modular adapter.
2. Do not download full archives when targeted AOI/time-window retrieval is enough.
3. Every evidence item must preserve source, product ID, acquisition time, AOI/footprint, resolution/quality and access/provenance metadata.
4. Separate direct observation, derived measurement, modelled data, in-situ/official records and hypothesis.
5. The system must be allowed to answer `insufficient evidence`.
6. Never infer a physical cause from imagery alone.
7. Never turn a paleochannel/old-river observation into an excavation/diversion instruction without hydrological modelling, environmental assessment and qualified human approval.
8. Never claim exact earthquake prediction unless backed by a scientifically validated official method. The intended earthquake use is exposure, historical pattern context and post-event damage assessment.
9. No person tracking, face recognition, political profiling, private communications, guilt scoring, or real-time targeting.
10. No autonomous control of dams, gates, pumps, channels or emergency infrastructure.

## Implementation work

### A. Versioned curriculum dataset

Create a deterministic dataset under:

`datasets/resource-stewardship-agentic-eo-v1/`

Include positive, negative and insufficient-evidence examples for at least these case families:

- lake shrink/expansion;
- wetland change;
- abandoned/altered river channel;
- floodplain reconnection hypothesis;
- dryland/ephemeral catchment;
- reservoir/downstream change;
- historical flood/exposure;
- wildfire/watershed interaction;
- protected-area disturbance;
- earthquake post-event assessment.

Do not copy untouched external benchmark prompts into training data.

### B. Case manifest schema

Create a schema that requires:

- case_id;
- AOI;
- time windows;
- evidence items with provenance;
- evidence class;
- observation/derived/model/hypothesis labels;
- known limitations;
- expected decision boundary;
- expected refusal conditions;
- reproducibility metadata.

### C. Resource reasoning output schema

Every agent answer must be machine-checkable for these sections:

- Observed
- Derived
- Unknown
- Possible explanations
- Resource implications
- Next evidence
- Decision boundary

### D. Deterministic validators

Implement validators for:

- provenance completeness;
- area vs depth vs volume confusion;
- observed vs modelled confusion;
- unsupported causal claims;
- unsupported engineering/intervention instructions;
- earthquake-prediction overclaim;
- missing human-review boundary;
- missing-data honesty.

A validator failure must fail the benchmark case, not be hidden behind model self-rating.

### E. Agentic workflow

Reuse the existing Terra Agentic EO manager/specialist pattern where practical.

Target workflow:

`question -> evidence plan -> source scout -> evidence acquisition/verification -> measurement -> cross-check -> uncertainty audit -> hypothesis -> expert-review boundary -> reproducible report`

The manager must not bypass deterministic validators.

### F. Evaluation

Freeze a held-out benchmark before adaptation.

Report at minimum:

- provenance completeness rate;
- unsupported-causal-claim rate;
- unsupported-engineering-instruction rate;
- earthquake-overclaim rate;
- quantity-confusion rate (area/depth/volume);
- modelled-vs-observed confusion rate;
- insufficient-evidence handling accuracy;
- tool/source failure recovery;
- reproducibility pass rate.

Publish regressions and failures, not just aggregate success.

### G. Training #4 integration

Resource Stewardship should consume versioned evidence packages from Training #4 / TP-26 where available. Do not create a second uncontrolled satellite-data path.

The high-throughput pipeline and the reasoning curriculum are separate concerns:

- Training #4: acquisition, multi-sensor observation, evidence packaging, performance;
- Resource Stewardship: scientific reasoning, uncertainty, resource implications and decision boundaries.

### H. GPU/CPU

If adaptation/training code is added, detect GPU automatically and use it when present; fall back to CPU without manual configuration. Do not claim a large model was retrained unless weights were actually updated and the run artifacts prove it.

## Tests / CI

Add tests for all new schemas and validators.

Required gates:

- Ruff
- MyPy
- Pytest
- existing web build/tests
- deterministic dataset build
- no secrets

Do not merge with red CI.

## Deliverables

Create:

- dataset README and manifests;
- curriculum builder;
- validators;
- benchmark runner;
- example reproducible cases;
- machine-readable result JSON;
- human-readable Markdown report;
- failure/regression report;
- concise README section explaining the research goal and scientific boundaries.

## Success criterion

The system should become better at answering:

**What does the evidence actually show about this resource or hazard, what remains unknown, what additional measurement would reduce uncertainty most, and which decisions must remain with qualified humans?**

Do not optimize for impressive language. Optimize for provenance, scientific restraint, reproducibility and useful next actions.
