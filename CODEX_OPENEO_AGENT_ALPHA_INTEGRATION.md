# CODEX TASK — document openEO Agent alpha integration direction

Repository: Terraforming-Planet/Polar-Sun-Moon-Analysis

## Goal

Add a short public project note that explains:

1. when this repository began using the OpenAI Agents SDK for Agentic Earth Observation work;
2. how that existing multi-agent work differs from the new openEO Agent alpha access from VITO/openEO;
3. what we plan to use the openEO Agent for next in Terra Observation / Polar-Sun-Moon-Analysis;
4. that the openEO Agent is an alpha research assistant and must not be treated as a source of scientific ground truth.

## Verified repository history to cite

- On 22 August 2026, commit `1377a5c3625dae6a92c4ca8455579a5ad18ad596` added the provenance-first OpenAI Agents SDK multi-agent EO coordinator.
- The repository already contains openEO/Copernicus Data Space workflows and published run metadata predating this integration.

## New openEO Agent alpha capabilities from the invitation

The alpha assistant can help with:
- exploring Earth-observation datasets;
- building and explaining openEO process graphs;
- troubleshooting openEO jobs;
- experimenting with alternative processing approaches through chat.

## Planned role in this repository

Use the alpha assistant as a collaborative research and workflow layer for:
- dataset discovery and mission/product selection;
- drafting and explaining openEO process graphs before execution;
- diagnosing failed or inefficient jobs;
- comparing processing strategies;
- preparing reproducible EO experiments that remain checked against repository evidence and official source provenance.

Do not claim that the openEO Agent replaces the existing OpenAI Agents SDK coordinator. Treat them as complementary systems.

## Deliverable

Create `docs/OPENEO_AGENT_ALPHA_INTEGRATION.md` with a concise, factual note suitable for a pull request. Do not modify production code.
