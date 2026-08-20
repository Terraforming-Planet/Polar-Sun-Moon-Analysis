# Codex brief — Terra Observation System / BUILD FOR GOOD submission-ready pass

## Mission
Finish the existing `Terraforming-Planet/Polar-Sun-Moon-Analysis` project as a clear BUILD FOR GOOD submission under the public product name **Terra Observation System**. Do not create a new repository or a second product. Preserve the existing GitHub Pages URL, scientific pipelines, research stations, data provenance, tests and working 3D Earth behavior.

The application helps communities, educators, researchers, NGOs and environmental responders understand environmental change using official public Earth-observation and scientific data.

## Branch
Work only on:

`agent/build-for-good-submission-ready`

Do not edit `main` directly.

## Primary tasks

### 1. Verify and finish the OpenAI Evidence / Research Explainer
The repository now contains `terra_research_node/openai_summary.py` and `tests/test_openai_summary.py` as the minimum real OpenAI API integration.

Inspect them first. Improve only where necessary.

Requirements:
- use the OpenAI **Responses API**;
- read the secret only from `OPENAI_API_KEY` or an explicitly injected server-side/local value;
- optional model override may use `OPENAI_MODEL`;
- no OpenAI key, token or secret may be committed, logged, returned to the browser or stored in public JSON;
- the public GitHub Pages frontend must never contain the key;
- if no key is available, fail clearly and do not fabricate an AI result;
- the input must be an already computed evidence JSON object from the scientific pipeline;
- OpenAI may explain evidence but must never invent satellite measurements, dates, acquisition IDs, source URLs, confidence values or missing observations;
- preserve the project evidence classes: `OBSERVATION`, `DERIVED_VALUE`, `MODEL_ESTIMATE`, `HYPOTHESIS`, `UNKNOWN`;
- `flow_connectivity_candidate` or `possible_constriction` must never be rewritten as a confirmed blockage or causal mechanism without independent hydrological evidence;
- output should contain four human-readable fields: `summary`, `why_it_matters`, `uncertainty`, `next_checks`;
- deterministic scientific results must remain usable when OpenAI is disabled.

### 2. Add the smallest honest UI integration that does not expose secrets
Inspect the current app architecture before editing.

Preferred behavior:
- add an **AI Evidence Explainer** action to a finding/result detail view only if a safe backend/local research-node endpoint already exists or can be added cleanly without breaking GitHub Pages;
- show explicit states: `DISCONNECTED`, `READY`, `EXPLAINING`, `ERROR`;
- never pretend the public static site has a backend;
- if the only safe implementation for this branch is local/server-side CLI/API, document that honestly instead of shipping a fake button;
- preserve accessibility: keyboard operation, labels, visible focus and readable error text.

Do not introduce a large framework rewrite just for this feature.

### 3. Make README competition-ready
The README must prominently and explicitly contain these exact conceptual sections near the top:
- What we built
- Who it helps
- How it will be used / is already used
- How Codex helped
- How the OpenAI API adds value
- How to run the project
- Security and privacy

The product name shown to judges is **Terra Observation System**.

Keep the public repository and demo links visible near the top.

Explain that Codex was used for repository-level engineering, audits, refactoring, tests, CI work and BUILD FOR GOOD implementation, with the existing `scripts/start_build_for_good.ps1` and prior BUILD FOR GOOD PR history as evidence.

Do not claim OpenAI generated scientific observations. State that OpenAI is an evidence-explanation layer over deterministic/official-source results.

### 4. Preserve scientific honesty
Do not change measured numbers or create a competition-friendly "discovery".

Official/public sources remain the source of truth, including NASA/JPL, NASA EONET/FIRMS/GIBS, ESA/Copernicus/CDSE, USGS, NOAA and other documented sources already used by the repository.

A finding must retain source, date/time, evidence class and limitations where available.

### 5. Security
Verify:
- `.env` remains ignored;
- no `sk-...` / `sk-proj-...` secret is in tracked files;
- no frontend bundle references `OPENAI_API_KEY` values;
- tests use obvious fake keys only;
- no secret is printed by the explainer.

If adding a backend endpoint, restrict it to the minimum required input and do not make it an unrestricted OpenAI proxy.

### 6. Tests and quality gates
Run and fix failures caused by this work:

```bash
python -m ruff check .
python -m mypy polar_equinox_analysis terra_hazards terra_research_node tests
python -m pytest -q
cd web
npm ci
npm test
npm run build
```

Also run a secret-pattern scan over tracked source and generated public output. Do not print real secret values.

### 7. Completion report
When finished, report:
- files changed;
- exact OpenAI API flow;
- where `OPENAI_API_KEY` is read;
- how the feature behaves without a key;
- tests run and results;
- any UI/backend limitation that remains;
- confirmation that no scientific observation was generated by OpenAI.

## Non-goals for this pass
Do not spend this submission-ready pass adding new satellite providers, new research stations, new 3D models, new training runs or visual redesigns unrelated to contest clarity. The priority is a truthful, demonstrable BUILD FOR GOOD submission with a small real OpenAI API integration and a judge-friendly README.
