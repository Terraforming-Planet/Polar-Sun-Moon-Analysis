# CODEX TASK — ESA EVE-Instruct vs Terra Agentic EO on NVIDIA L4

Repository:
https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis

Branch:
`agent/eve-terra-l4-comparative-benchmark`

Project:
**Terraforming Planet / Terra Observation System**

## Mission

Build a reproducible, scientifically honest comparison between:

1. the existing **Terra Agentic EO Coordinator** in this repository; and
2. ESA Φ-lab's public **EVE-Instruct** Earth-observation model, run locally on an NVIDIA L4.

The goal is not to prove that one organization or model is globally "better". The goal is to discover where each system is currently strong or weak in observable Earth-observation research behavior: source selection, tool use, provenance, uncertainty, scientific claim safety, deterministic calculations, latency and local GPU efficiency.

This must extend the already merged Agentic EO work rather than replacing it.

Existing baseline to preserve:
- `config/agentic-eo-benchmark-v1.json`
- `scripts/run_agentic_eo_benchmark.py`
- `tests/test_agentic_eo_benchmark.py`
- `docs/AGENTIC_EO_BENCHMARK.md`
- `published/agentic-eo/benchmark-v1-summary.json`
- `published/agentic-eo/benchmark-v1-summary.md`
- `terra_research_node/agentic_eo.py`

The previous 10-case benchmark is historical evidence. Do not modify its published score or rewrite the old run after seeing EVE outputs.

---

# 1. External public references

Use only legal, official/public sources.

Primary EVE references:
- EVE organization: https://github.com/eve-esa
- EVE-Instruct: https://huggingface.co/eve-esa/EVE-Instruct
- EVE-Instruct Q4_K_M: https://huggingface.co/eve-esa/EVE-Instruct-GGUF-Q4_K_M
- EVE public agent package: https://github.com/eve-esa/agents
- EVE MCP tool registry: https://github.com/eve-esa/mcp-tool-registry
- EVE evalkit: https://github.com/eve-esa/evalkit

EVE-Instruct is an EO/Earth-Science-specialized model derived from Mistral Small 3.2 24B. The public Q4_K_M GGUF is suitable for local inference experiments and is published under Apache-2.0 according to its model card.

Do not vendor the 14+ GB model into this repository. Do not commit model weights, caches or Hugging Face download artifacts.

---

# 2. Critical attribution rule

There are TWO different comparisons and they must never be confused.

## Track A — EVE-Instruct in Terra parity harness

Run EVE-Instruct locally and give it a controlled tool interface backed by the SAME deterministic Terra public source/evidence functions used by the benchmark.

This tests:
- the EVE model's planning and tool-use behavior;
- its EO knowledge and reasoning;
- its ability to use controlled evidence safely;
- its performance on an NVIDIA L4.

Label all results exactly as:

**EVE-Instruct + Terra parity harness**

Do NOT label Track A as "ESA agent performance" or "official ESA EVE agent benchmark" because the surrounding tool harness is ours.

## Track B — official public EVE agent stack (optional, separate)

Only add this track if the public `eve-esa/agents` package and associated public stack can be pinned and executed reproducibly without private ESA services.

If implemented, label it separately:

**EVE public LangGraph agent stack**

Record exact repository commit SHAs and dependency versions.

Never merge Track A and Track B results into one number.

---

# 3. First benchmark, not training

Do NOT fine-tune EVE or Terra in this PR.

First establish a clean baseline.

The order is:

1. reproduce the existing Terra benchmark behavior;
2. run EVE-Instruct on the same cases;
3. inspect failure categories;
4. identify whether gaps come from model knowledge, prompts, tool routing, source-registry recall, formatting, latency or runtime configuration;
5. only after the baseline is frozen should a future PR consider training or prompt/tool improvements.

Never tune a system on the final test cases and then present the post-tuning score as if it were an untouched baseline.

---

# 4. Hardware target

Primary local research hardware:

**NVIDIA L4, ~24 GB VRAM**

The implementation must automatically detect:
- NVIDIA GPU name;
- VRAM total;
- CUDA availability/version where available;
- driver version where available;
- CPU fallback if no compatible GPU exists.

EVE local inference should prefer the official public quantized model:

`eve-esa/EVE-Instruct-GGUF-Q4_K_M`

Expected model artifact is approximately 14.3 GB according to the public Hugging Face model card. Do not hard-code an assumption that it always fits: perform a startup health check and report OOM/runtime failures honestly.

Recommended vLLM-style launch path, based on the public model instructions:

```bash
vllm serve "eve-esa/EVE-Instruct-GGUF-Q4_K_M" \
  --tokenizer_mode mistral \
  --config_format mistral \
  --load_format mistral \
  --tool-call-parser mistral \
  --enable-auto-tool-choice \
  --gpu-memory-utilization 0.90
```

Allow runtime flags such as maximum context length to be adjusted from CLI/config if the L4 reports insufficient memory. Record the exact final launch configuration in the run artifact.

Do not silently fall back to a different EVE model and keep the old label.

---

# 5. Fair-comparison design

The comparison must be defensible.

## Same inputs

Both systems receive:
- exactly the same benchmark question text;
- the same public repository evidence;
- the same deterministic source registry;
- the same deterministic numeric calculator;
- the same maximum agent/tool turn budget;
- the same required final answer sections;
- no hidden answer key.

The scorer configuration (`required_terms_all`, `required_any_groups`, expected missions, etc.) must NEVER be inserted into either model prompt.

## Same evidence class rules

Both systems must preserve:
- OBSERVATION
- DERIVED_VALUE
- MODEL_ESTIMATE
- HYPOTHESIS
- UNKNOWN

Training metrics are not environmental ground truth.
A visual candidate is not proof of physical cause.
Mapped-area change is not automatically water-volume change.
A catalogue/source registry entry is not proof that a scene was downloaded or analysed.

## Same deterministic tools

Expose equivalent logical capabilities to both systems:

### source selection
Backed by:
- `search_eo_sources_data(...)`

### evidence loading/verifying
Backed by:
- `load_evidence_case_data(...)`
- `verify_evidence_case_data(...)`
- `load_training_context_data(...)`

### deterministic mapped-area calculation
Backed by:
- `compare_surface_water_areas_data(...)`

Do not allow EVE unrestricted network browsing during the parity benchmark while Terra uses a closed registry. If a future network-enabled track is added, run it as a separate experiment for both systems.

---

# 6. Reuse the existing 10 frozen cases

Use the questions already defined in:

`config/agentic-eo-benchmark-v1.json`

Do not rewrite them after seeing EVE results.

The frozen case set is:

- B01 — Vistula TEST 014 evidence scope
- B02 — unsupported causal claim challenge
- B03 — flood mapping under cloud
- B04 — 1980s-to-present river record
- B05 — SWOT water-surface elevation / volume boundary
- B06 — SMAP surface-soil moisture
- B07 — GRACE / GRACE-FO terrestrial-water-storage routing
- B08 — Sentinel-3 SLSTR thermal/cloud limitation
- B09 — deterministic 10.0 → 7.5 km² mapped-area calculation
- B10 — NVIDIA L4 training/evaluation is not environmental ground truth

The existing benchmark previously exposed a real recall/routing weakness around GRACE. Preserve that historical result. Do not special-case B07 in a way that gives Terra or EVE the answer.

---

# 7. New implementation layout

Add a modular comparison layer. Suggested structure:

```text
terra_research_node/
  comparative_eo/
    __init__.py
    common.py
    metrics.py
    gpu_monitor.py
    terra_adapter.py
    eve_adapter.py
    scorer.py
    report.py

scripts/
  run_eve_terra_comparison.py
  run_eve_terra_l4.ps1

config/
  eve-terra-agentic-eo-comparison-v1.json

tests/
  test_eve_terra_comparison.py

docs/
  EVE_TERRA_AGENTIC_EO_COMPARISON.md
```

Adapt naming to repository conventions if needed, but do not place the entire experiment in one giant script.

---

# 8. Terra adapter

The Terra side must use the real existing coordinator:

`run_agentic_eo_with_trace(...)`

Do not replace it with a mocked answer.

Record:
- model identifier;
- wall-clock duration;
- public allow-listed trace;
- completed logical capabilities/tools;
- final answer;
- API/runtime error if any.

Do not publish OpenAI credentials, prompts internal to the SDK, tool arguments, tool payloads or chain-of-thought.

---

# 9. EVE adapter

The EVE side should connect to a local OpenAI-compatible endpoint, default:

`http://127.0.0.1:8000/v1/chat/completions`

Make endpoint/model configurable by CLI/environment without editing source.

Suggested environment variables:
- `EVE_BASE_URL`
- `EVE_MODEL`

No API key should be required for a localhost-only EVE server. If a local token is optionally used, never log it.

## EVE tool loop

Implement a bounded tool-use loop compatible with the Mistral/EVE tool-calling format exposed by the local server.

The loop must:

1. send system + user messages;
2. provide only the allow-listed parity tools;
3. parse returned tool calls;
4. validate the tool name;
5. parse JSON arguments safely;
6. execute only deterministic local functions;
7. append tool results;
8. continue until a final answer or max-turn limit;
9. fail closed on malformed/unapproved calls.

Never execute shell commands, arbitrary Python, arbitrary URLs or arbitrary file reads requested by the model.

## Public EVE trace

Publish only allow-listed lifecycle fields, for example:

```json
{
  "event": "tool_end",
  "tool": "search_eo_sources",
  "status": "success"
}
```

Do not publish hidden reasoning.
Do not publish tool arguments or raw tool outputs in the public summary.
Raw local debug artifacts may contain more detail only if they are excluded from Git and pass secret/privacy review.

---

# 10. Logical capability normalization

Terra and EVE use different tool names. Score logical capabilities, not implementation-specific names.

Example mapping:

```text
Terra consult_eo_source_scout
  -> source_selection

EVE search_eo_sources
  -> source_selection

Terra consult_evidence_verifier
  -> evidence_verification

EVE load_evidence_case / verify_evidence_case / load_training_context
  -> evidence_verification

Terra compare_surface_water_areas
EVE compare_surface_water_areas
  -> deterministic_calculation
```

Keep raw tool names in the machine-readable artifact, but use normalized capabilities for direct comparison.

---

# 11. Scoring

Continue the existing principle:

**No second LLM grader.**

Use deterministic and inspectable assertions.

Report at least these dimensions separately:

## A. Observable assertion pass rate
Same answer-level requirements as v1, adapted to logical tool capabilities.

## B. Strict case pass rate
A strict case passes only if every required assertion for that system/case passes.

## C. Tool-routing success
- required logical capability invoked;
- tool completed successfully;
- invalid/unapproved calls count as failures.

## D. Provenance/scientific-safety success
Track failures such as:
- fabricated mission/source;
- unsupported environmental finding;
- unsupported water-loss claim;
- unsupported causal claim;
- training treated as ground truth;
- area change incorrectly upgraded to volume/cause.

## E. Self-recovery
If a tool fails or returns no result, record whether the agent:
- retries safely;
- selects a valid alternative;
- admits insufficient evidence;
- fabricates an answer.

## F. Efficiency metrics
Report separately; do not hide scientific failures behind speed.

For each system/case record when available:
- wall-clock seconds;
- total turns;
- tool calls;
- input/output token usage if runtime reports it;
- error count.

For local EVE/L4 additionally record:
- peak observed GPU memory used;
- average/peak GPU utilization if available;
- average/peak power draw if `nvidia-smi` exposes it;
- local model startup time separately from per-case inference time.

Do not invent unavailable metrics. Use null/UNKNOWN.

---

# 12. Repetitions and variance

Support configurable repetitions.

Recommended workflow:

## Smoke run
`repetitions = 1`

Purpose: verify runtime/tool compatibility.

## Publishable comparison
`repetitions = 3`

Run each frozen case three times per system with the same declared generation settings.

Report:
- per-run values;
- mean/median latency;
- minimum/maximum assertion score;
- consistency rate for strict-pass outcome.

Do not cherry-pick the best repetition.

If API cost prevents three Terra repetitions, publish the limitation explicitly and do not pretend the sample sizes are equal.

---

# 13. Generation settings

Prefer deterministic/low-variance generation for comparison.

For EVE:
- temperature: 0 or the lowest supported deterministic setting;
- explicit max output token limit;
- fixed max tool turns;
- no hidden web/RAG unless enabled equally for both systems in a separate track.

For Terra:
- preserve the existing coordinator configuration unless a setting can be controlled without changing system behavior.

Record every effective generation/runtime setting in `environment.json`.

---

# 14. GPU monitor

Implement a small optional NVIDIA monitor using `nvidia-smi`.

It should sample at a reasonable interval such as 0.5–1.0 s and record only technical device metrics.

Suggested fields:
- timestamp_utc
- gpu_index
- gpu_name
- memory_used_mib
- memory_total_mib
- utilization_gpu_percent
- power_draw_w

The benchmark must continue if `nvidia-smi` is unavailable; mark GPU telemetry unavailable.

No infinite monitoring thread. Start/stop cleanly around the intended EVE run.

---

# 15. Run artifact structure

Each run goes under ignored local research output, for example:

```text
research_runs/eve-terra/<run_id>/
  environment.json
  source_manifest.json
  config.snapshot.json
  gpu.jsonl
  terra/
    cases.json
    public-traces.json
  eve/
    cases.json
    public-traces.json
  comparison.json
  comparison.md
```

Include:
- git SHA;
- dirty/clean worktree state;
- benchmark config hash;
- EVE model id;
- EVE runtime/version;
- Terra model id;
- Python/package versions relevant to the run;
- GPU metadata;
- UTC timestamps.

Do not store secrets.

---

# 16. Public publication

After a successful final run, publish only sanitized, reproducible summary artifacts, for example:

```text
published/agentic-eo/eve-terra-v1-summary.json
published/agentic-eo/eve-terra-v1-summary.md
```

Public summary must state prominently:

- EVE result is `EVE-Instruct + Terra parity harness` unless the official public EVE agent stack was actually used;
- Terra and EVE runtime architectures differ;
- the benchmark measures the frozen 10-case observable behavior set;
- it is not environmental ground-truth validation;
- it is not a general ranking of ESA vs OpenAI vs Terraforming Planet;
- local GPU efficiency applies to EVE on the tested L4 configuration only;
- Terra may execute through a remote API, so GPU/energy numbers are not directly comparable unless equivalent telemetry exists.

Do not publish a marketing claim such as "Terra beats ESA".

---

# 17. Optional official EVE agent-stack track

After Track A works, investigate the public repositories:

- `eve-esa/agents`
- `eve-esa/mcp-tool-registry`
- `eve-esa/backend`
- `eve-esa/evalkit`

If a reproducible local route exists:

1. pin external commit SHAs in `source_manifest.json`;
2. install in an isolated environment;
3. do not copy private assumptions from Terra into EVE prompts;
4. connect only official/public tools available without private credentials;
5. run the same frozen questions;
6. publish as a separate system row.

If it cannot run without ESA-private services, document that limitation and stop. Do not emulate missing private infrastructure and call it official EVE.

---

# 18. Fault-injection subtests

After the clean baseline, add small deterministic failure-mode tests without modifying the original B01–B10 questions.

Examples:
- source registry returns no match;
- one tool throws a controlled timeout/error;
- evidence case is unknown;
- malformed tool arguments;
- unsupported request for arbitrary URL;
- request tries to convert a hypothesis into a confirmed finding.

Measure whether each system:
- recovers;
- asks for clarification/evidence;
- safely stops;
- fabricates.

Keep these results separate from the frozen 10-case headline score.

---

# 19. Security and privacy

Mandatory:

- no API keys in Git;
- no Hugging Face tokens in Git;
- no model weights in Git;
- no `.env` files;
- no unrestricted model-generated shell/tool execution;
- no private-person tracking;
- no hidden surveillance features;
- no private chain-of-thought publication;
- no arbitrary network tool created just because a model asks for one.

Run the repository secret scan before completion.

---

# 20. Tests

Add deterministic unit tests that do NOT require downloading EVE or calling OpenAI.

At minimum test:

1. comparison config validates;
2. frozen benchmark config is referenced rather than silently rewritten;
3. system labels distinguish Terra from `EVE-Instruct + Terra parity harness`;
4. tool allow-list rejects arbitrary tool names;
5. malformed EVE tool arguments fail closed;
6. logical capability normalization is correct;
7. scoring is deterministic;
8. missing GPU telemetry produces null/UNKNOWN rather than fabricated zero values;
9. public trace does not include tool arguments, raw tool outputs, credentials or reasoning;
10. report clearly states the attribution/scientific limitations;
11. failed system run remains in results and cannot disappear from aggregate score;
12. repetitions are all retained; no best-run cherry-pick logic.

Run:

```bash
ruff check .
pytest
mypy terra_research_node
```

Also run the existing repository CI/test commands appropriate to this branch.

---

# 21. L4 commands

Provide both Linux and Windows/PowerShell-friendly entry points where practical.

Desired final user workflow:

## Start local EVE server

```bash
vllm serve "eve-esa/EVE-Instruct-GGUF-Q4_K_M" \
  --tokenizer_mode mistral \
  --config_format mistral \
  --load_format mistral \
  --tool-call-parser mistral \
  --enable-auto-tool-choice \
  --gpu-memory-utilization 0.90
```

## Smoke comparison

```bash
python scripts/run_eve_terra_comparison.py \
  --config config/eve-terra-agentic-eo-comparison-v1.json \
  --repetitions 1
```

## Final reproducibility run

```bash
python scripts/run_eve_terra_comparison.py \
  --config config/eve-terra-agentic-eo-comparison-v1.json \
  --repetitions 3 \
  --publish-summary
```

If `OPENAI_API_KEY` is unavailable, allow an EVE-only run, but label Terra as NOT RUN rather than giving it zero or fabricating results.

---

# 22. Acceptance criteria

This PR is complete only when all of the following are true:

- [ ] existing Agentic EO v1 benchmark remains unchanged and tests pass;
- [ ] EVE Q4_K_M can be launched locally on the intended L4 or a clear reproducible blocker is documented;
- [ ] EVE uses only allow-listed parity tools in Track A;
- [ ] same frozen B01–B10 questions are used for both systems;
- [ ] answer keys are never inserted into prompts;
- [ ] both systems emit sanitized public traces;
- [ ] normalized logical tool capabilities are scored fairly;
- [ ] assertion scores, strict passes, routing, safety and latency are reported separately;
- [ ] L4 telemetry is captured when available;
- [ ] failures remain visible in the report;
- [ ] no cherry-picking of repetitions;
- [ ] no model weights/secrets are committed;
- [ ] public report includes attribution and scientific limitations;
- [ ] tests cover tool allow-list, scorer and public-trace safety;
- [ ] Ruff, Pytest, MyPy and CI are green;
- [ ] any public summary is generated from a real run, not hand-authored as if it were measured data.

---

# 23. Questions the final report should answer

The finished experiment should let us answer, with evidence:

1. Does EVE-Instruct select EO missions/products correctly on the frozen cases?
2. Does it use tools reliably on L4?
3. Where does Terra's multi-agent coordinator outperform or underperform EVE-Instruct in the parity harness?
4. Which system better preserves provenance and uncertainty?
5. Which system is more likely to upgrade a hypothesis into an unsupported finding?
6. How stable are the results across repeated runs?
7. How much VRAM does EVE use on L4 and what is its per-case latency?
8. Are failures model failures, agent-loop failures, registry/tool failures, or scoring-format failures?
9. What should be improved next BEFORE any training?
10. Which improvements could become a useful contribution to reliable Agentic AI for Earth Observation?

The report should include weaknesses and failures, not only successes. A discovered failure is a useful research result.
