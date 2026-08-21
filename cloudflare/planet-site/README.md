# Terra Observation Planet — Cloudflare frontend

This deployment publishes the existing `web/` application as Cloudflare Workers Static Assets without replacing GitHub Pages.

## Public endpoints

- Cloudflare fallback: the `terra-observation-planet` `workers.dev` deployment returned by Wrangler.
- Preferred custom hostname: `https://planet.terra-observation.dev/`.
- OpenAI/evidence requests continue to use the separately restricted Evidence Worker URL stored in `config/evidence-worker-url.txt`.

## Safety and rollout

`wrangler.jsonc` is the always-safe `workers.dev` deployment. `wrangler.custom-domain.jsonc` adds only the intended `planet.terra-observation.dev` Custom Domain. The deployment workflow first publishes and verifies the fallback site, then attempts the custom-domain attachment separately so a missing/unavailable domain cannot remove the working fallback publication.

The custom hostname can become active only when `terra-observation.dev` is an active Cloudflare zone controlled by the project account and the deployment token has the required Cloudflare permissions. No API key, account ID or token is stored in these files.

GitHub Pages remains an independent fallback publication.
