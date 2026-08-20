# Cloudflare Evidence Worker — API token repair

This runbook exists because the production Evidence Worker deployment reached Cloudflare but authentication failed before the Worker could be deployed.

## Confirmed production status

The repository-side checks passed before the Cloudflare call:

- required GitHub secret names were present;
- tracked-secret scan passed;
- Worker guardrail tests passed;
- credential whitespace normalization passed.

Cloudflare then rejected the configured `CLOUDFLARE_API_TOKEN` during Wrangler authentication. The token value itself was never printed or committed.

## Correct credential type

Use a **Cloudflare API Token** for Wrangler. Do not use:

- the Global API Key;
- an Origin CA key;
- an Account ID;
- `Bearer <token>`;
- a complete `Authorization:` header;
- a curl command;
- JSON;
- surrounding quotation marks;
- a token copied with spaces or line breaks.

The GitHub repository secret `CLOUDFLARE_API_TOKEN` should contain **only the raw API token value**.

## Recommended Cloudflare permissions

The simplest safe starting point is Cloudflare's **Edit Cloudflare Workers** API-token template, limited to the Cloudflare account used by this project.

The Worker deployment requires permission to write Worker scripts. Cloudflare documents this as **Workers Scripts Write**. If the token is customized rather than created from the template, make sure it can deploy/edit Workers for the selected account.

The project currently binds `OPENAI_API_KEY` as a normal Worker secret through Wrangler. It does not commit the OpenAI key to GitHub Pages or to repository files.

## GitHub secret names

Keep these as three separate repository secrets:

- `CLOUDFLARE_API_TOKEN` — raw Cloudflare API token only;
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID only;
- `OPENAI_API_KEY` — OpenAI API key only.

Never place any of these values in README files, screenshots, public JSON, frontend JavaScript, commit messages or issue comments.

## After replacing the Cloudflare token

Rerun the GitHub Actions workflow **Deploy OpenAI Evidence Worker**.

The production workflow is designed to verify the following chain automatically:

1. required secrets exist;
2. tracked-secret scan passes;
3. Worker guardrail tests pass;
4. Cloudflare Worker deploy succeeds;
5. `/health` returns the expected service, configured OpenAI status and `vistula-test-014` support;
6. a real `POST /explain` returns the four required explanation fields;
7. the public Worker URL is persisted;
8. GitHub Pages is rebuilt with that URL;
9. the published JavaScript bundle is checked for the Worker URL and Evidence Explainer UI.

Do not mark the public OpenAI demo as `READY` until that chain passes.

## Security/scientific rule

A successful deployment does not turn training metrics into environmental findings. The Vistula case continues to preserve:

- `environmental_finding_claim: false`
- `water_loss_claim: false`
- `causal_claim: false`

NVIDIA L4 results are training/evaluation evidence; real environmental claims require reproducible observation and analysis.
