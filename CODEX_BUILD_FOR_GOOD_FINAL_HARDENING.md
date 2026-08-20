# Codex command — final BUILD FOR GOOD hardening

## Mission
Finish `Terraforming-Planet/Polar-Sun-Moon-Analysis` as a production-ready BUILD FOR GOOD submission under the public product name **Terra Observation System**.

Do not add unrelated features. Preserve existing scientific data, experiments, 3D Earth, research stations, provenance and limitations. The lead story is environmental protection through public Earth-observation data, with OpenAI explaining evidence rather than inventing measurements.

## Branch
Work only on:

`codex/build-for-good-final-hardening`

Do not edit `main` directly. Open a PR and merge only after CI is green.

## Confirmed defect to fix
The currently published GitHub Pages bundle after PR #179 contains the Evidence Explainer UI but no injected Evidence Worker URL. The compiled explainer therefore starts in `DISCONNECTED` state. Fix the production handoff rather than hiding the state in the UI.

## Required work

### 1. Make the Worker → Pages handoff durable
- Deploy the Cloudflare Worker with `OPENAI_API_KEY` stored only as a Worker/GitHub secret.
- Verify `GET /health` returns the expected service name, `openai_configured: true`, and `vistula-test-014` in `supported_case_ids`.
- Run a real production `POST /explain` for `vistula-test-014` with the allowed GitHub Pages Origin and verify the four fields: `summary`, `why_it_matters`, `uncertainty`, `next_checks`.
- Never print model output or secret values into CI logs.
- Persist only the **public** Worker deployment URL in `config/evidence-worker-url.txt` after a successful deployment. This URL is not a secret.
- Dispatch the controlled Pages workflow with that URL.
- Future normal Pages builds must reuse the persisted public URL and must not silently publish a `DISCONNECTED` BUILD FOR GOOD production bundle.
- Verify the generated Vite bundle contains both the public Worker URL and the Evidence Explainer action.
- Verify the live GitHub Pages bundle contains the same deployed Worker URL.

### 2. Keep the OpenAI integration scientifically constrained
- The browser may send only a fixed `case_id`; it must not be an unrestricted OpenAI proxy.
- Preserve the fixed evidence bundle and the evidence/claim flags.
- Do not turn L4 throughput, loss, CUDA success or dataset ingestion into environmental ground truth.
- Do not rewrite a flow-connectivity candidate, possible constriction or morphology candidate as a confirmed blockage or causal mechanism.
- OpenAI must never invent satellite measurements, dates, acquisition IDs, URLs, confidence values, water-loss magnitudes or causes.

### 3. Security gate
- Keep `.env`, `.dev.vars` and secrets untracked.
- Add a CI scan over tracked files for obvious OpenAI/GitHub token formats and prohibited secret files.
- The scanner must report file names only, never suspected secret values.
- Continue to use GitHub Actions/Cloudflare secrets for `OPENAI_API_KEY`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

### 4. Competition submission package
Ensure a submission-ready Markdown file exists with:
- public GitHub repository;
- public demo;
- short description;
- exact judge quick path: open demo → `Woda i susza` → `AI Evidence / Research Explainer` → `Explain Vistula evidence with OpenAI`;
- short note on who it helps and how it is used;
- final pre-submit checklist.

### 5. Quality gates
Run and fix regressions caused by this pass:

```bash
python scripts/ci/scan_tracked_secrets.py
python -m ruff check .
python -m mypy polar_equinox_analysis terra_hazards terra_integrity terra_water
python -m pytest -q
node --test cloudflare/evidence-worker/test/*.test.mjs
cd web
npm ci
npm test
npm run build
```

After merge, production is not considered ready until the deployment workflow itself proves:
1. Worker health passes;
2. a real OpenAI `/explain` passes;
3. the public Worker URL is persisted;
4. the Pages production bundle contains that URL;
5. the live Pages bundle contains the Evidence Explainer UI and the same URL.

## Non-goals
Do not add new satellite providers, research stations, 3D models, training runs, speculative environmental claims or decorative features in this pass.

## Completion report
Report:
- files changed;
- CI result;
- Worker health result;
- live `/explain` result without printing generated content;
- persisted Worker URL path;
- public Pages handoff result;
- confirmation that no secret value was committed or printed;
- any remaining manual GitHub repository metadata or Discord submission step.
