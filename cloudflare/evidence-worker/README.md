# Terra Observation System — OpenAI Evidence Worker

This Cloudflare Worker is the public, server-side bridge between the static GitHub Pages application and the OpenAI Responses API.

It is intentionally **not** an arbitrary OpenAI proxy.

## Public flow

```text
GitHub Pages
  -> POST /explain {"case_id":"vistula-test-014"}
  -> Cloudflare Worker
  -> canonical public evidence files from this repository
  -> OpenAI Responses API
  -> strict four-field explanation
```

The browser never receives `OPENAI_API_KEY`.

## Current published case

`vistula-test-014` combines:

- real Vistula Test 014 data-integrity/temporal-coverage context;
- NVIDIA L4 Training #2 structured findings;
- NVIDIA L4 Training #3 structured findings.

The current Vistula context explicitly does **not** claim a measured water-loss magnitude or confirmed hydrological cause. The Worker preserves those limits.

## Routes

### `GET /health`

Returns only non-sensitive status and supported case IDs.

### `POST /explain`

Accepts exactly:

```json
{"case_id":"vistula-test-014"}
```

Unknown fields, arbitrary prompts, model names and source URLs are rejected.

## Cloudflare Worker secret

Required secret binding:

```text
OPENAI_API_KEY
```

Never put the key in `wrangler.jsonc`, frontend JavaScript, public JSON, screenshots, logs or README examples.

## Non-secret Worker variables

Configured in `wrangler.jsonc`:

- `OPENAI_MODEL=gpt-5.6-luna`
- `ALLOWED_ORIGINS=https://terraforming-planet.github.io,http://localhost:5173,http://127.0.0.1:5173`

## GitHub Actions deployment

`.github/workflows/deploy-evidence-worker.yml` uses the official Cloudflare Wrangler action.

Repository secrets required:

```text
OPENAI_API_KEY
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

After deployment, the workflow:

1. verifies `/health`;
2. stores the public Worker URL in repository variable `VITE_EVIDENCE_API_URL`;
3. dispatches `force-pages-deploy.yml`;
4. GitHub Pages rebuilds with the Worker URL embedded as a public endpoint value.

`VITE_EVIDENCE_API_URL` is not a secret. `OPENAI_API_KEY` is.

## Local tests

```bash
node --test cloudflare/evidence-worker/test/*.test.mjs
```

For local Wrangler development, store the OpenAI key in a local `.dev.vars` file. `.dev.vars` is ignored by Git and must never be committed.
