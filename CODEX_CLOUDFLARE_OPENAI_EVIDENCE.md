# Codex brief — Cloudflare OpenAI Evidence Explainer

## Mission
Finish the public BUILD FOR GOOD OpenAI integration for **Terra Observation System** in the existing repository `Terraforming-Planet/Polar-Sun-Moon-Analysis`.

Work only on branch:

`agent/cloudflare-openai-evidence-explainer`

Do not create a new repository. Do not edit `main` directly. Preserve all working Earth, water, hazard, astronomy and GitHub Pages functionality.

## Product goal
A person viewing the Water/Hydrology area of Terra Observation System should be able to press **Explain evidence with OpenAI** and receive a short evidence-grounded explanation of a published research case.

The public flow must be:

`GitHub Pages -> Cloudflare Worker -> OpenAI Responses API -> validated structured explanation`

The public browser must never receive `OPENAI_API_KEY`.

## Public case for this pass
Use the real published Vistula research artifacts already in the repository:

- `docs/evidence/test-014-vistula-real-data-context.json`
- `docs/published/training-runs/site_20260819T223835Z/analysis.json` (NVIDIA L4 Training #2)
- `docs/published/training-runs/stream_gibs_20260820T013036Z/analysis.json` (NVIDIA L4 Training #3)

The Worker should fetch those canonical public artifacts itself. The browser should send only a fixed `case_id`, not arbitrary source URLs or prompts.

## Security requirements
1. Never commit, print, return or expose `OPENAI_API_KEY`.
2. Worker reads the key only from the Cloudflare secret binding `OPENAI_API_KEY`.
3. GitHub Actions may pass the existing repository secret `OPENAI_API_KEY` to Cloudflare Wrangler as a Worker secret.
4. Cloudflare deployment credentials must be separate GitHub secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
5. Do not build an unrestricted OpenAI proxy.
6. Public POST body must accept only a known `case_id`; reject unknown fields/cases and large bodies.
7. Restrict browser CORS to the Terraforming Planet GitHub Pages origin plus localhost development origins.
8. Use a fixed server-side model configuration and fixed server-side instructions.
9. Limit output tokens.
10. Never allow browser-supplied system instructions, model names, OpenAI tools or arbitrary URLs.

## Scientific guardrails
The real Vistula context explicitly states:

- `environmental_finding_claim: false`
- `water_loss_claim: false`
- `causal_claim: false`

Preserve those facts.

L4 Training #2/#3 prove training/data-pipeline facts, not environmental ground truth. Do not convert loss reduction, GPU throughput, image counts or successful training into proof that a lake dried, a river was blocked or a disaster occurred.

The explanation must clearly distinguish:

- what the published data actually establishes;
- why the research may matter;
- what remains uncertain;
- what should be checked next.

Use evidence classes already present in the project.

## OpenAI API
Use the current OpenAI **Responses API** (`POST https://api.openai.com/v1/responses`).

Prefer Structured Outputs with a strict JSON schema for exactly:

- `summary`
- `why_it_matters`
- `uncertainty`
- `next_checks`

Use `gpt-5.6-luna` by default through a non-secret Worker variable `OPENAI_MODEL`, while allowing a server-side override. Do not accept a model name from the browser.

## Worker routes
Minimum routes:

### `GET /health`
Return non-sensitive state only, for example:

- service name;
- status;
- whether OpenAI is configured as a boolean;
- supported public case IDs.

Never return the key or secret metadata.

### `POST /explain`
Input:

```json
{"case_id":"vistula-test-014"}
```

Fetch the canonical repository evidence, build the evidence bundle, call OpenAI, validate the structured result, and return only the safe explanation plus basic provenance/case metadata.

### `OPTIONS /explain`
CORS preflight.

## Frontend
Add a small `EvidenceExplainer` component to `HydrologyPanel`.

States must be explicit:

- `DISCONNECTED` — no `VITE_EVIDENCE_API_URL` in the Pages build;
- `CHECKING` — health check in progress;
- `READY` — Worker is reachable and OpenAI is configured;
- `EXPLAINING` — request in progress;
- `ERROR` — safe human-readable failure.

Button label:

**Explain Vistula evidence with OpenAI**

Show the four returned fields with headings. Also show a short notice that AI explains published evidence and does not create the underlying satellite measurement.

## Deployment
Add a GitHub Actions workflow using the official Cloudflare Wrangler action.

Required repository secrets:

- `OPENAI_API_KEY` (already expected to exist)
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Deploy from `cloudflare/evidence-worker`.

After a successful Worker deploy:

1. capture the Worker deployment URL;
2. set/update GitHub repository variable `VITE_EVIDENCE_API_URL` to that URL;
3. dispatch `force-pages-deploy.yml` so GitHub Pages is rebuilt with the Worker URL.

The Pages build must read `vars.VITE_EVIDENCE_API_URL`; it is a public URL, not a secret.

## Tests
Add deterministic tests for:

- known vs unknown case IDs;
- CORS origin allowlist;
- request-body validation;
- OpenAI output parsing/validation;
- proof that browser input cannot set model/prompt/source URLs;
- frontend API URL normalization;
- frontend rendering in disconnected mode;
- HydrologyPanel contains the OpenAI Evidence Explainer.

Run:

```bash
node --test cloudflare/evidence-worker/test/*.test.mjs
python -m ruff check .
python -m mypy polar_equinox_analysis terra_hazards terra_research_node tests
python -m pytest -q
cd web
npm ci
npm test
npm run build
```

Also scan tracked files for accidental API key patterns without printing secret values.

## Completion report
Report:

- changed files;
- Worker URL configuration flow;
- exact GitHub secrets still needed;
- exact repository variable populated after deployment;
- OpenAI request shape and model;
- tests and results;
- confirmation that no API key reaches GitHub Pages;
- confirmation that the public endpoint is not an arbitrary OpenAI proxy;
- remaining deployment step if Cloudflare credentials are not yet configured.

## Non-goals
Do not add new satellite providers, redesign the entire site, start a new L4 training run, or claim new environmental discoveries in this pass. The goal is a small, secure, demonstrable OpenAI feature for BUILD FOR GOOD.
