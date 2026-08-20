# BUILD FOR GOOD — final submission package

Deadline: **2026-08-22 08:59 CEST (Europe/Warsaw)**.

## Discord thread reply

**Public GitHub repository**  
https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis

**Demo**  
https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/

**Short description**  
**Terra Observation System** is an open Earth-observation platform that helps communities, educators, NGOs and researchers investigate environmental change using real public satellite and scientific data. It combines reproducible water and river analysis, a global 3D Earth interface, documented NVIDIA L4 GPU research and a constrained OpenAI Evidence Explainer. The long-term public-good goal is to help people detect and understand water loss, changing river systems, drylands and environmental hazards earlier, so researchers and communities can investigate restoration, preparedness and protection of life, homes, farmland, infrastructure and water resources with better evidence.

The project does not treat GPU training as environmental proof. NVIDIA L4 training/evaluation documents how the analysis pipeline is being developed and tested; environmental findings must still come from reproducible observations and deterministic analysis. OpenAI translates fixed project evidence into a clear summary, impact, uncertainty and next scientific checks without inventing measurements or causes.

## Judge quick path

1. Open the public demo.
2. Select **Woda i susza**.
3. Find **AI Evidence / Research Explainer** near the top of the hydrology view.
4. Confirm the state is **READY**.
5. Select **Explain Vistula evidence with OpenAI**.
6. Review the four returned sections: summary, why it matters, uncertainty and next checks.
7. Open **TEST 014 — VISTULA** and the published L4 training links if deeper evidence is needed.

## Who it helps

- communities trying to understand visible water and river change;
- farmers, land and water managers who need better long-term environmental context;
- educators and students learning Earth observation and scientific uncertainty;
- environmental NGOs and public-interest teams triaging places that deserve closer investigation;
- researchers who need transparent provenance and reproducible public-data workflows;
- emergency and resilience teams that can benefit from earlier, evidence-based environmental context while still relying on official warnings and authorities.

## How it is used

The platform brings official/public Earth-observation records into reproducible experiments and interactive views. Deterministic analysis and published evidence remain the source of scientific claims. NVIDIA L4 training and evaluation help develop and test the processing pipeline. OpenAI is used only as an evidence explainer: it receives a fixed server-selected evidence bundle and cannot create or replace the underlying satellite measurement.

The long-term vision is to use the same evidence-first architecture for water loss, river and lake change, dryland and paleochannel research, flood and drought context, wildfire and landslide monitoring, severe storms, volcanic activity and seismic-risk research. The project does **not** claim deterministic earthquake prediction; seismic outputs must remain risk indicators, anomalies or hypotheses unless supported by authoritative scientific evidence.

## Why Codex matters in this project

Codex was used throughout development for repository architecture, GitHub Actions, tests, React/TypeScript work, scientific guardrails, Cloudflare/OpenAI integration, CI hardening, NVIDIA L4 workflow review and the final BUILD FOR GOOD production audit.

## Final pre-submit checklist

- [x] Public repository
- [x] Public GitHub Pages demo
- [x] README explains what was built
- [x] README explains who it helps
- [x] README explains how it is/will be used
- [x] README documents NVIDIA L4 training/evaluation and its scientific limitations
- [x] README explains long-term water, restoration and hazard-resilience goals
- [x] README explains how Codex helped
- [x] README explains how to run the project
- [x] OpenAI integration is server-side and constrained to fixed evidence cases
- [x] `.env` and `.dev.vars` are ignored
- [x] CI includes a tracked-secret scan
- [ ] Production Worker `/health` verified after final Cloudflare credential repair
- [ ] Production Worker `/explain` verified after final Cloudflare credential repair
- [ ] Public Pages bundle verified to contain the Worker URL after final Cloudflare credential repair
- [ ] Public Evidence Explainer visibly shows `READY`
- [x] GitHub repository About/Description updated from the old Polar Sun/Moon-only description
- [x] GitHub repository Homepage set to the demo URL
- [ ] Final Discord thread reply posted before the deadline

## Repository metadata — current

**Description**  
Open-source AI Earth observation platform combining official NASA, ESA and Copernicus satellite data, NVIDIA L4-trained research models, a 3D globe and OpenAI explanations to support water monitoring, hazard awareness and environmental protection.

**Homepage**  
https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/

Do not rename the repository immediately before the deadline; preserving existing public URLs is safer.

## Current production blocker

The repository-side OpenAI/Cloudflare code, guardrail tests and tracked-secret scan pass. The latest production audit reached Cloudflare but Cloudflare rejected the configured `CLOUDFLARE_API_TOKEN` during authentication. The deployment workflow keeps secret values masked and records only safe stage outcomes. Replace or correct that repository secret with a valid **raw Cloudflare API Token** (not a Global API Key, not `Bearer <token>`, not a quoted value and not a curl/header string), then rerun **Deploy OpenAI Evidence Worker**. The workflow will automatically verify `/health`, a real OpenAI `/explain`, the Worker URL handoff and the public Pages bundle before the demo can be marked READY.
