# BUILD FOR GOOD — final submission package

Deadline: **2026-08-22 08:59 CEST (Europe/Warsaw)**.

## Discord thread reply

**Public GitHub repository**  
https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis

**Demo**  
https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/

**Short description**  
**Terra Observation System** is an open Earth-observation platform that helps communities, educators, NGOs and researchers investigate environmental change using real public satellite and scientific data. It combines reproducible water/river analysis, a global 3D Earth interface and NVIDIA L4 research with a constrained OpenAI Evidence Explainer that translates fixed project evidence into a clear summary, impact, uncertainty and next scientific checks without inventing measurements or causes.

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
- educators and students learning Earth observation and scientific uncertainty;
- environmental NGOs and public-interest teams triaging places that deserve closer investigation;
- researchers who need transparent provenance and reproducible public-data workflows.

## How it is used

The platform brings official/public Earth-observation records into reproducible experiments and interactive views. Deterministic analysis and published evidence remain the source of scientific claims. OpenAI is used only as an evidence explainer: it receives a fixed server-selected evidence bundle and cannot create or replace the underlying satellite measurement.

## Why Codex matters in this project

Codex was used throughout development for repository architecture, GitHub Actions, tests, React/TypeScript work, scientific guardrails, Cloudflare/OpenAI integration, CI hardening and the final BUILD FOR GOOD production audit.

## Final pre-submit checklist

- [x] Public repository
- [x] Public GitHub Pages demo
- [x] README explains what was built
- [x] README explains who it helps
- [x] README explains how it is/will be used
- [x] README explains how Codex helped
- [x] README explains how to run the project
- [x] OpenAI integration is server-side and constrained to fixed evidence cases
- [x] `.env` and `.dev.vars` are ignored
- [x] CI includes a tracked-secret scan
- [ ] Production Worker `/health` verified after final merge
- [ ] Production Worker `/explain` verified after final merge
- [ ] Public Pages bundle verified to contain the Worker URL after final merge
- [ ] Public Evidence Explainer visibly shows `READY`
- [ ] GitHub repository About/Description updated from the old Polar Sun/Moon-only description
- [ ] GitHub repository Homepage set to the demo URL
- [ ] Final Discord thread reply posted before the deadline

## Repository metadata recommended before submission

**Description**  
Terra Observation System — open Earth-observation platform using public satellite data, AI and OpenAI to investigate water, rivers, environmental change and hazards.

**Homepage**  
https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/

Do not rename the repository immediately before the deadline; preserving existing public URLs is safer.
