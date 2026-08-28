# Terra Observation System — Training Evidence Policy

## Why this exists

Terra Observation System is intended as a public-good Earth-observation research platform. Its long-term value depends not only on model performance, but on whether another person can verify what data were used, what code ran, what hardware executed the job, what failed, what changed, and which conclusions are justified.

For environmental and hazard work, incomplete provenance can become a scientific and operational risk. A convincing chart or model score is not enough. Evidence must be reproducible, auditable and explicit about uncertainty.

This policy therefore treats logging and provenance as part of the experiment itself.

## Canonical training numbering

The current long-running NVIDIA L4 sequence is:

1. **Training #1** — first 60-minute L4 baseline run.
2. **Training #2** — expanded site-corpus 60-minute L4 run.
3. **Training #3** — global NASA GIBS streaming run.
4. **Training #4** — two separate 60-minute NVIDIA L4 sessions executed as one training stage, **120 minutes total**.

The two 60-minute sessions of Training #4 must be described as **Training #4 / session 1** and **Training #4 / session 2** (or equivalent run IDs). They must **not** be renumbered as Training #4 and Training #5.

## Hard rule

> **No full evidence package = the run is not considered complete for research claims.**

A process may finish successfully and still be classified `EVIDENCE_INCOMPLETE` if required logs or hashes are missing.

This rule applies to future training, adaptation, benchmark, inference-at-scale and recovery runs.

## Evidence must start before compute

The evidence writer must be initialized **before the first training process starts**. It is not acceptable to enable logging after a long run has already begun.

For Windows / PowerShell GPU runs, capture both:

- full native process stdout + stderr from byte one (for example with `2>&1 | Tee-Object`);
- a PowerShell transcript started before preflight and stopped only after post-run evidence is written.

The launcher must fail closed if the expected evidence file cannot be created.

## Minimum mandatory package

Every long run must preserve at least:

- immutable `run_id` / `run_tag`;
- training number and session number where applicable;
- start UTC and end UTC;
- exact Git commit SHA and branch/ref;
- exact runner command and normalized arguments;
- full stdout + stderr (`FULL-CONSOLE.log` or equivalent);
- PowerShell/shell transcript when available;
- exit code and final status;
- machine / OS context;
- GPU name, driver and `nvidia-smi` snapshot before and after;
- CPU / RAM context when practical;
- Python version;
- framework version (for example PyTorch) and CUDA runtime;
- dependency freeze or lock-file hash;
- source dataset/evidence manifest;
- source/product provenance required by the scientific task;
- training/validation/test split description;
- periodic metrics, not only the final metric;
- validation metrics when validation is part of the design;
- checkpoint/model hash when weights were updated;
- hashes for logs, manifests and exported evidence package;
- recorded failures, retries, fallbacks and OOM/batch-size changes;
- an explicit statement of what the run does **not** prove.

## Two-layer evidence model

### Layer 1 — immutable local/raw evidence

This is the strongest evidence package and should preserve complete logs and machine-readable artifacts. It may contain large files and therefore does not have to live directly in GitHub Pages.

It must be copied off ephemeral/cloud compute before the machine or disk is destroyed.

### Layer 2 — public research evidence

GitHub / GitHub Pages should expose a compact, reviewer-readable record containing:

- run identity;
- training/session numbering;
- configuration;
- source/provenance summary;
- key metrics and limitations;
- checkpoint/evidence hashes;
- integrity hash of the local full package where the package itself is not public;
- clear availability state: `PUBLIC`, `ARCHIVED_LOCAL`, `RECOVERED`, or `MISSING`.

Public reports must never imply that a reconstructed log is an original raw transcript.

## Recovery classification

Historical runs are classified using these terms:

- `RAW_VERIFIED` — original log/archive exists and its hash is verified.
- `RAW_FOUND_UNVERIFIED` — original-looking file exists but no prior trusted hash is available.
- `DERIVED_EVIDENCE` — metrics/manifests exist but original raw console is not verified.
- `RECOVERED_EVIDENCE` — evidence was reconstructed from screenshots, saved outputs or other secondary records.
- `MISSING` — no evidence item of the required class has been found.

Never upgrade `RECOVERED_EVIDENCE` to `RAW_VERIFIED` without finding the original persisted bytes.

## Training #1–#4 recovery rule

Before deleting or reformatting the existing NVIDIA L4 Windows disk, run:

`./scripts/export_all_training_logs_l4.ps1`

The exporter must:

- search Training #1–#4 paths and historical archives;
- preserve all discovered log/evidence files without changing originals;
- verify known historical archive hashes;
- include all Training #4 evidence directories from both 60-minute sessions when present;
- create a per-file SHA-256 inventory;
- create one ZIP suitable for copying off the VM;
- state clearly which raw logs were and were not found.

Do not delete the original L4 evidence until the exported ZIP has been copied to independent storage and its SHA-256 verified.

## Preflight gate for future long runs

Before a long GPU run:

1. Verify clean/known Git state.
2. Create the evidence directory.
3. Start transcript/log sinks.
4. Record Git/hardware/software preflight.
5. Run a short smoke test using the same code and data path.
6. Verify that the smoke produced non-empty full logs and hashes.
7. Only then start the long run.

A missing/empty log, failed preflight or failed smoke test blocks the long run.

## Post-run gate

Before calling a run complete:

1. Confirm exit code and final status.
2. Validate metric and provenance files.
3. Hash checkpoint/model artifacts.
4. Hash all evidence files.
5. Produce one evidence manifest.
6. Export/copy the evidence package off the compute instance.
7. Verify the copied package hash.
8. Publish only scientifically defensible summaries.

## Scientific boundaries

Training behavior is not automatically an environmental finding.

The project must continue to distinguish:

- direct observations;
- derived measurements;
- model estimates;
- official/in-situ records;
- hypotheses;
- unknowns.

Satellite morphology alone must not be presented as proof of hydrological cause or as authorization for engineering interventions. Flood, water-restoration, glacier, earthquake and other hazard work must keep appropriate scientific, legal and human-review boundaries.

## Public-good rationale

The goal is to make EO analysis more dependable for people working on water, floods, fires, drought, glaciers, infrastructure, ecosystems and disaster response. Reliable evidence can help researchers and authorities identify changes faster and decide what should be checked next.

The system must not claim that a model run itself saves lives. Its value is to support timely, evidence-grounded human decisions while preserving uncertainty, provenance and accountability.

## CI / review rule

Changes to training or evidence infrastructure should include tests where practical and pass the repository quality gates:

- Ruff;
- Pytest;
- MyPy;
- existing CI;
- secret scanning / no committed credentials.

Do not merge evidence-policy changes with red CI.
