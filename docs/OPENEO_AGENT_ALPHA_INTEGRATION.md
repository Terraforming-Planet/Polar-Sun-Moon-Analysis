# openEO Agent alpha — integration direction

## Where we are today

Polar-Sun-Moon-Analysis already has a provenance-first multi-agent Earth-observation research layer built with the OpenAI Agents SDK.

That work was added to the repository on **22 August 2026** in commit
`1377a5c3625dae6a92c4ca8455579a5ad18ad596`, which introduced the Agentic EO coordinator, specialist agents, deterministic EO source registry checks, validation tests, and public execution evidence.

The project also already uses Copernicus Data Space / openEO workflows for Earth-observation processing, so the new openEO Agent alpha is a natural extension of existing work rather than a separate direction.

## What the new openEO Agent alpha adds

The openEO Agent alpha from the VITO/openEO team is designed as a collaborative AI assistant for Earth-observation workflows. According to the alpha invitation, it can help users:

- explore Earth-observation datasets;
- build and explain openEO process graphs;
- troubleshoot openEO jobs;
- experiment with different processing approaches through a chat interface.

This is **not the same system** as our existing OpenAI Agents SDK coordinator. The two should be treated as complementary.

## How we plan to use it

For Terra Observation / Polar-Sun-Moon-Analysis, the openEO Agent can help us accelerate the practical Copernicus/openEO layer of the research workflow:

1. **Dataset discovery** — identify suitable openEO collections and products for rivers, lakes, wetlands, glaciers, drylands and hazards.
2. **Process-graph design** — draft and explain openEO process graphs before we run them.
3. **Job troubleshooting** — investigate failed, slow or inefficient openEO jobs.
4. **Workflow comparison** — test alternative processing strategies and compare their trade-offs.
5. **Experiment preparation** — turn research questions into reproducible openEO experiments with explicit inputs, spatial/temporal bounds and processing steps.
6. **Connection to our existing Agentic EO system** — use our provenance-first coordinator to verify claims, preserve uncertainty and keep scientific conclusions tied to repository evidence and official source metadata.

## Scientific guardrail

The openEO Agent is currently an alpha assistant. Its suggestions must not be treated as scientific ground truth by themselves.

Any environmental claim should still be backed by reproducible processing, explicit provenance, repository evidence and, where appropriate, independent validation.

## Next step

The next implementation step is to connect the alpha workflow to a small, controlled Terra Observation test case and document:

- the selected dataset;
- generated or reviewed process graph;
- job execution result;
- any troubleshooting performed with the Agent;
- reproducibility information;
- whether the result changes any existing scientific claim flags.

This PR is documentation-only and records the intended integration path before account configuration and live testing.
