# CODEX TASK — ESA Agentic EO live evidence hardening

Repository: Terraforming-Planet/Polar-Sun-Moon-Analysis
Branch: agent/esa-agentic-eo-mvp
PR: #239

## Goal
Turn the existing experimental OpenAI Agents SDK multi-agent EO coordinator into a reproducible, public, evidence-safe live demonstration suitable as supporting material for an ESA Phi-lab visiting-researcher application.

Do NOT merge anything. Work only in the current branch/worktree.

## Existing architecture to preserve
- `Terra Agentic EO Coordinator` manager agent
- `EO Source Scout` specialist agent exposed as a tool
- `EO Evidence Verifier` specialist agent exposed as a tool
- deterministic EO source registry tools
- deterministic Vistula TEST 014 evidence/claim verification
- deterministic surface-water area calculation
- published NVIDIA L4 training context treated as pipeline/training context, never environmental ground truth

## Required implementation

### 1. Public trace, never private reasoning
Extend `terra_research_node/agentic_eo.py` with a supported way to run the coordinator and return BOTH:
- final public answer;
- a compact PUBLIC execution trace derived from the OpenAI Agents SDK result items/events.

The trace may include only observable execution metadata such as:
- agent names involved;
- tool/function names invoked;
- specialist-agent tool calls;
- tool success/failure state;
- high-level result item types;
- run/model metadata.

The trace MUST NOT expose hidden reasoning, chain-of-thought, API keys, authorization headers, raw environment variables, or internal model reasoning summaries.

Prefer documented/public SDK result APIs. Inspect the installed `openai-agents` package if needed rather than guessing field names.

### 2. Live-run evidence script
Create exactly:
`scripts/run_agentic_eo_live.py`

It must support this exact CLI contract:

```bash
python scripts/run_agentic_eo_live.py \
  --case-id vistula-test-014 \
  --question "Using the repository evidence for Vistula TEST 014, state what is actually established, select the most suitable official/public EO sources for investigating possible surface-water or river-channel change, and recommend the next scientific checks. Do not infer a physical cause that the evidence does not establish." \
  --json-output docs/published/agentic-eo/vistula-test-014-live.json \
  --markdown-output docs/published/agentic-eo/vistula-test-014-live.md
```

The script must:
- require `OPENAI_API_KEY` but never print or persist it;
- execute a REAL OpenAI Agents SDK run via the existing coordinator;
- record UTC timestamp, git SHA when available, Python version, `openai-agents` version and configured model;
- include the exact research question;
- include a compact public execution trace;
- include the final model answer;
- include deterministic TEST 014 claim verification from repository data;
- include the relevant source-registry matches returned deterministically for `surface_water` and/or river/flood investigation;
- include explicit scientific safety assertions;
- write both JSON and readable Markdown;
- create parent directories if needed.

### 3. Prove the multi-agent path was actually exercised
The live-run script must fail non-zero if the public trace does not show BOTH specialist-agent consultations:
- `consult_eo_source_scout`
- `consult_evidence_verifier`

Do not fake this evidence. If the SDK trace does not expose enough information, add minimal explicit instrumentation at the public tool boundary so the trace records actual specialist tool invocations. Do not record model reasoning.

### 4. Scientific guardrails
The final implementation and report must preserve these rules:
- TEST 014 establishes dataset integrity/temporal coverage, not by itself a water-loss finding;
- `environmental_finding_claim=false`, `water_loss_claim=false`, `causal_claim=false` remain authoritative;
- NVIDIA L4 optimization/training metrics are not environmental ground truth;
- mapped-area change does not establish volume change without bathymetry/area-elevation-volume evidence;
- morphology does not establish hydrological causation;
- recommendations must be framed as next checks, not as confirmed causes.

### 5. Documentation
Create/update:
`docs/ESA_AGENTIC_EO.md`

Explain concisely:
- the manager + specialist-agent architecture;
- OpenAI Agents SDK usage;
- deterministic tools and provenance;
- public trace design and why chain-of-thought is intentionally excluded;
- how to reproduce the live run;
- what the run proves and what it does NOT prove scientifically;
- how this maps to agentic EO concepts: planning/orchestration, tool use, multi-agent collaboration, verification, uncertainty awareness and reproducibility.

### 6. Tests
Add deterministic tests for:
- public trace sanitization / absence of secret-like fields;
- enforcement that both specialist consultations are required for a successful evidence run;
- live-report serializer structure without making a network call;
- existing scientific claim flags remaining false for TEST 014.

Tests must not require a real API key.

## Validation Codex should perform offline
Run focused checks that do not require network access:

```bash
python -m ruff check terra_research_node/agentic_eo.py scripts/run_agentic_eo_live.py tests
python -m pytest -q tests
python -m compileall terra_research_node scripts/run_agentic_eo_live.py tests
```

If whole-repository tests are reasonably fast, run them too.

## Important constraints
- Do not change `main`.
- Do not merge PR #239.
- Do not edit this brief or `.github/workflows/codex-esa-agentic-eo-live.yml`.
- Do not commit secrets, `.env`, `.dev.vars`, credentials or raw authorization data.
- Do not fabricate an agent trace or scientific finding.
- Do not use successful model/training execution as proof of environmental change.
- Keep changes focused on the Agentic EO evidence demonstration.

## Completion condition
Leave the working tree with production-quality code that the surrounding GitHub Actions workflow can then execute against the real OpenAI API using the repository secret. The workflow, not Codex, will perform the live API run, secret scan and final commit/push.