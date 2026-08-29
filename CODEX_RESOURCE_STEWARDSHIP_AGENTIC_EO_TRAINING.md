# CODEX TASK — Resource Stewardship Agentic EO Curriculum

Repository:
https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis

## Goal

Implement a rigorous, provenance-first training/evaluation curriculum that teaches Terra Observation System to reason about water resources, river/lake change, drylands, flood exposure, protected areas and earthquake impact without crossing scientific or legal boundaries.

Use `docs/resource-stewardship-agentic-eo-training.md` as the scientific specification and `docs/TRAINING_EVIDENCE_POLICY.md` as the mandatory experiment-recording policy.

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
11. Logging/provenance is part of the experiment. A long run with missing full evidence is `EVIDENCE_INCOMPLETE`, even if the training process exits successfully.
12. Never renumber repeated sessions of the same training stage. Training #4 contains two 60-minute NVIDIA L4 sessions (120 minutes total); the second session is not Training #5.

## Mandatory experiment evidence gate

Before any long GPU/CPU run:

- create an immutable run/session ID;
- create the evidence directory;
- start full stdout/stderr capture before the training process starts;
- start shell/PowerShell transcript where supported;
- record Git commit/ref, exact command, hardware, CUDA/framework versions and dependencies;
- run a short smoke test through the same code/data path;
- verify non-empty logs and hashes;
- block the long run if evidence initialization or smoke verification fails.

After the run:

- preserve final status/exit code;
- preserve periodic metrics and failure/retry records;
- preserve provenance/data manifests and split information;
- hash checkpoints when weights changed;
- hash every evidence file and the exported evidence package;
- copy the package off ephemeral/cloud compute before deleting the VM/disk;
- publish limitations and missing evidence explicitly.

Use `scripts/export_all_training_logs_l4.ps1` to recover/export Training #1–#4 evidence from the existing Windows L4 machine before that disk is removed.

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
- missing-data honesty;
- missing experiment evidence package for a claimed completed training run.

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
- reproducibility pass rate;
- experiment-evidence completeness rate.

Publish regressions and failures, not just aggregate success.

### G. Training #4 integration

Training #4 is one training stage containing **two 60-minute NVIDIA L4 sessions, 120 minutes total**. Treat them as `Training #4 / session 1` and `Training #4 / session 2`, never as Training #4 and Training #5.

Resource Stewardship should consume versioned evidence packages from Training #4 / TP-26 where available. Do not create a second uncontrolled satellite-data path.

The high-throughput/model-learning pipeline and the reasoning curriculum are separate concerns:

- Training #4: real spectral-temporal EO training/evidence packaging and performance;
- Resource Stewardship: scientific reasoning, uncertainty, resource implications and decision boundaries.

Historical Training #4 evidence must retain its real status: original raw evidence, derived evidence or recovered evidence. Do not present a reconstruction as an original transcript.

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
- evidence-policy checks for long-run launchers where practical

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
- full experiment evidence package for every newly executed long run;
- concise README section explaining the research goal and scientific boundaries.

## Success criterion

The system should become better at answering:

**What does the evidence actually show about this resource or hazard, what remains unknown, what additional measurement would reduce uncertainty most, and which decisions must remain with qualified humans?**

Do not optimize for impressive language. Optimize for provenance, scientific restraint, reproducibility, auditability and useful next actions.
