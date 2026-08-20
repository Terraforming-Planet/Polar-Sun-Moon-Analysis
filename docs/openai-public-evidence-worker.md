# Public OpenAI Evidence Demo

Terra Observation System exposes the OpenAI **Evidence / Research Explainer** through a small Cloudflare Worker so the public GitHub Pages application never receives the OpenAI API key.

## Architecture

```text
Official/public Earth-observation evidence
            +
NVIDIA L4 training/evaluation artifacts
            +
real-data test metadata
            ↓
canonical JSON stored in the public repository
            ↓
GitHub Pages — Water / Hydrology
            ↓
Explain Vistula evidence with OpenAI
            ↓
Cloudflare Worker
            ↓
OpenAI Responses API
            ↓
summary · why_it_matters · uncertainty · next_checks
```

## Why the Worker is intentionally restrictive

The browser does **not** send an arbitrary prompt. It sends only a registered public `case_id`.

For the first public case:

```json
{"case_id":"vistula-test-014"}
```

The Worker itself chooses the canonical source files, model, instructions, output schema and output-token limit. Browser attempts to supply a model, prompt or source URL are rejected.

This keeps the endpoint from becoming a general-purpose public proxy to the project's OpenAI account.

## Current evidence bundle

The Vistula public case uses:

- `docs/evidence/test-014-vistula-real-data-context.json`;
- NVIDIA L4 Training #2 `analysis.json`;
- NVIDIA L4 Training #3 `analysis.json`.

The Test 014 context explicitly records:

```text
environmental_finding_claim = false
water_loss_claim = false
causal_claim = false
```

Therefore the explainer must not tell users that the test already proves a water-loss magnitude, blocked outlet, or specific physical cause. It can explain why the long time series and provenance matter and what deterministic/field checks are needed next.

## Secrets

`OPENAI_API_KEY` exists only as a GitHub/Cloudflare secret and must never be committed.

Cloudflare deployment additionally requires:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

The deployed Worker URL is public and is stored as the non-secret repository variable:

```text
VITE_EVIDENCE_API_URL
```

## BUILD FOR GOOD role

This API integration is not included merely to satisfy a contest requirement. It addresses a practical usability problem: satellite provenance, GPU training reports, hydrological limitations and evidence classes are difficult for non-specialists to interpret.

OpenAI converts the already-validated evidence bundle into four concise sections while keeping uncertainty visible. The underlying measurements and official/public data remain the scientific source of truth.
