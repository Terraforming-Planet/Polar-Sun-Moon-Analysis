# CODEX TASK — ESA Agentic EO provenance-first live evidence v2

Repository: Terraforming-Planet/Polar-Sun-Moon-Analysis
Branch: agent/esa-agentic-eo-mvp
PR: #239

## Goal
Harden the existing OpenAI Agents SDK multi-agent Earth Observation coordinator into a reproducible, provenance-first public demonstration suitable as supporting material for an ESA Phi-lab visiting-researcher application.

This is iteration 2. A previous validated CI artifact already demonstrated a real manager + two-specialist OpenAI Agents SDK run on Vistula TEST 014. Preserve that working behavior and improve the deterministic EO source provenance.

Do NOT merge anything. Work only in the current branch/worktree.

## Existing architecture to preserve
- `Terra Agentic EO Coordinator` manager agent
- `EO Source Scout` specialist agent exposed as a tool
- `EO Evidence Verifier` specialist agent exposed as a tool
- deterministic EO source registry tools
- deterministic Vistula TEST 014 evidence/claim verification
- deterministic surface-water area calculation
- public execution trace that excludes chain-of-thought/private reasoning
- published NVIDIA L4 training context treated as pipeline/training context, never environmental ground truth

## Required implementation

### 1. Add Sentinel-2 and Landsat to the controlled EO registry
Update `terra_hazards/data_sources.json` with explicit, machine-readable official/public entries for:

1. Copernicus Sentinel-2
   - agency: ESA / European Commission
   - mission: Copernicus Sentinel-2
   - instrument: MSI (MultiSpectral Instrument)
   - include phenomena appropriate for optical EO such as `surface_water`, `water_extent`, `river_channel`, `land_cover`, `vegetation`
   - temporal coverage must reflect Sentinel-2 mission availability (2015-present; platform/product dependent)
   - spatial resolution must accurately state the MSI band-dependent 10 m / 20 m / 60 m resolutions rather than claiming every band is 10 m
   - access: Copernicus Data Space
   - use an official ESA/Copernicus URL already trusted by the project or an official mission/data-space URL
   - limitations must explicitly mention opaque cloud/shadow and that optical imagery does not directly measure water depth or prove hydrological causation

2. Landsat
   - agency: USGS / NASA
   - mission: Landsat program (use a scientifically accurate scope, e.g. Landsat 4-9 for long-term multispectral analysis, with current Landsat 8/9 context where appropriate)
   - instrument should accurately acknowledge TM/ETM+/OLI/OLI-2 where the registry scope spans multiple missions
   - include phenomena appropriate for long-term EO such as `surface_water`, `water_extent`, `river_channel`, `land_cover`, `vegetation`
   - temporal coverage must be accurate for the declared scope; do not imply identical sensor characteristics across the whole Landsat archive
   - spatial resolution should accurately distinguish commonly used 30 m multispectral data and relevant exceptions rather than oversimplifying
   - access: USGS EarthExplorer / Landsat data services
   - use an official USGS/NASA Landsat URL
   - limitations must mention cloud/shadow, sensor/platform differences across decades, seasonal comparability, and that optical morphology does not prove physical cause

Do not invent mission facts. Reuse repository conventions and official-source wording where available.

### 2. Make source selection provenance-first
Harden `terra_research_node/agentic_eo.py` so the EO Source Scout and coordinator treat the deterministic registry as the authoritative catalogue for named EO source recommendations in this demo.

Requirements:
- For Vistula surface-water / river-channel investigation, deterministic lookup must return relevant registry entries including Sentinel-1, Sentinel-2 and Landsat when the configured phenomena match.
- SWOT may be selected for water-surface elevation / river-slope questions where applicable.
- Any source named in the final public answer as a recommended mission for this case must either:
  a) be present in the deterministic registry and represented in the public report's registry matches, or
  b) be clearly labelled as an additional non-registry suggestion rather than presented as registry-backed evidence.
- Prefer registry-backed sources. Do not allow the model to silently present model-memory source knowledge as if it came from deterministic provenance.
- Preserve the distinction between source selection and environmental findings.

### 3. Public trace, never private reasoning
Preserve or improve the supported way to run the coordinator and return BOTH:
- final public answer;
- compact PUBLIC execution trace derived from observable OpenAI Agents SDK result items/events and/or explicit public tool-boundary instrumentation.

The trace may include only observable execution metadata such as:
- agent names involved;
- tool/function names invoked;
- specialist-agent consultations;
- tool success/failure state;
- high-level result item types;
- run/model metadata.

The trace MUST NOT expose hidden reasoning, chain-of-thought, API keys, authorization headers, raw environment variables, specialist prompts, raw private tool arguments, or internal model reasoning summaries.

### 4. Live-run evidence script
Create or update exactly:
`scripts/run_agentic_eo_live.py`

It must continue to support this CLI contract:

```bash
python scripts/run_agentic_eo_live.py \
  --case-id vistula-test-014 \
  --question "Using the repository evidence for Vistula TEST 014, state what is actually established, select the most suitable official/public EO sources for investigating possible surface-water or river-channel change, and recommend the next scientific checks. Do not infer a physical cause that the evidence does not establish." \
  --json-output docs/published/agentic-eo/vistula-test-014-live.json \
  --markdown-output docs/published/agentic-eo/vistula-test-014-live.md
```

The script must:
- require `OPENAI_API_KEY` but never print or persist it;
- execute a REAL OpenAI Agents SDK run via the coordinator;
- record UTC timestamp, git SHA when available, Python version, `openai-agents` version and configured model;
- include the exact research question;
- include compact public execution trace;
- include final model answer;
- include deterministic TEST 014 claim verification from repository data;
- include deterministic source-registry matches for the Vistula surface-water / river-channel investigation;
- explicitly show whether Sentinel-1, Sentinel-2 and Landsat are present among relevant deterministic registry matches;
- include scientific safety assertions;
- write both JSON and readable Markdown;
- create parent directories if needed.

### 5. Prove the multi-agent path was actually exercised
The live-run script must fail non-zero unless the public trace proves BOTH real specialist consultations occurred:
- `consult_eo_source_scout`
- `consult_evidence_verifier`

Do not fake this evidence. Record only actual observable specialist tool invocations. Never record model reasoning.

### 6. Prove provenance-first behavior
The live-run/report validation must fail if any of these are not true for the Vistula case:
- deterministic source matches contain Sentinel-1;
- deterministic source matches contain Sentinel-2;
- deterministic source matches contain Landsat;
- registry entries expose source identity/agency/mission/access URL or equivalent provenance fields;
- the final answer does not misrepresent a non-registry source as registry-backed;
- the report clearly distinguishes deterministic registry selection from model-generated explanation.

A model merely mentioning Sentinel-2 or Landsat is NOT sufficient. The evidence must prove those sources exist in the controlled registry and are selected through deterministic lookup.

### 7. Scientific guardrails
The final implementation and report must preserve these rules:
- TEST 014 establishes dataset integrity/temporal coverage, not by itself a water-loss finding;
- `environmental_finding_claim=false`, `water_loss_claim=false`, `causal_claim=false` remain authoritative;
- NVIDIA L4 optimization/training metrics are not environmental ground truth;
- mapped-area change does not establish volume change without bathymetry/area-elevation-volume evidence;
- morphology does not establish hydrological causation;
- cloud-free optical scenes still require seasonal/sensor comparability checks;
- Sentinel-1 radar backscatter is not direct water-depth measurement;
- recommendations are next scientific checks, never confirmed physical causes.

### 8. Documentation
Create/update:
`docs/ESA_AGENTIC_EO.md`

Explain concisely:
- manager + specialist-agent architecture;
- OpenAI Agents SDK usage;
- deterministic tools and controlled EO source registry;
- why Sentinel-1 + Sentinel-2 + Landsat are complementary for a river-change investigation;
- when SWOT adds a different measurement dimension;
- public trace design and why chain-of-thought is intentionally excluded;
- how to reproduce the live run;
- what the run proves and what it does NOT prove scientifically;
- how this maps to agentic EO concepts: planning/orchestration, tool use, multi-agent collaboration, verification, uncertainty awareness, provenance and reproducibility.

### 9. Tests
Add/update deterministic tests for:
- Sentinel-2 registry entry validity and source selection;
- Landsat registry entry validity and source selection;
- Sentinel-1 + Sentinel-2 + Landsat appearing for relevant Vistula surface-water/river-channel source lookup;
- public trace sanitization / absence of secret-like fields;
- enforcement that both specialist consultations are required;
- live-report serializer structure without a network call;
- provenance-first validation (model text alone cannot substitute for registry evidence);
- existing TEST 014 scientific claim flags remain false.

Tests must not require a real API key.

## Validation Codex should perform offline
Run focused checks without network access:

```bash
python -m ruff check terra_research_node/agentic_eo.py scripts/run_agentic_eo_live.py tests
python -m pytest -q tests
python -m compileall terra_research_node scripts/run_agentic_eo_live.py tests
python -m json.tool terra_hazards/data_sources.json >/dev/null
```

If whole-repository tests are reasonably fast, run them too.

## Important constraints
- Do not change `main`.
- Do not merge PR #239.
- Do not edit this brief or the workflow files.
- Do not commit secrets, `.env`, `.dev.vars`, credentials or raw authorization data.
- Do not fabricate an agent trace, source provenance or scientific finding.
- Do not use successful model/training execution as proof of environmental change.
- Do not claim water loss, river blockage or a causal mechanism from TEST 014 unless independent evidence actually establishes it.
- Keep changes focused on the ESA Agentic EO evidence demonstration.

## Completion condition
Leave the worktree with production-quality iteration-2 code and documentation. The surrounding trusted CI job will then execute the real OpenAI Agents SDK Vistula run, validate the public multi-agent trace and provenance-first source selection, scan for secrets, and package the validated worktree as an artifact. Do not merge or push directly to `main`.