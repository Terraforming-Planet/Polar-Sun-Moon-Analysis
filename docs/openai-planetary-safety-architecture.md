# OpenAI-assisted planetary safety architecture

This document defines a research architecture for Terraforming Planet. It does not claim an OpenAI partnership, endorsement, or access to unreleased models.

## Source-of-truth rule

Planetary observations remain grounded in official public data from NASA, NOAA, ESA, Copernicus, USGS and other documented scientific or civil-protection sources. AI output is never accepted as a replacement for an observation, timestamp, source URL, georeference or sensor product.

## Codex role

Codex is intended for repository-level engineering work: code review, refactoring, test generation, reproducibility checks, CI repair, dependency review, defensive security analysis and validation of data-processing pipelines. Changes produced with Codex must still pass the repository quality gates before merge.

## Astra-ready mathematical verification

OpenAI has publicly described Astra as a next-frontier internal model in connection with advanced mathematical research. If and when this project receives supported access, Astra is intended as an additional verification layer for difficult mathematical reasoning, not as a source of physical observations.

Candidate tasks include:

- independent checking of eclipse geometry and Besselian-element implementations,
- WGS84 coordinate transforms and uncertainty propagation,
- ephemeris interpolation checks against NASA/JPL reference data,
- mathematical consistency checks for the 8 x 8 x 8 = 512 addressable research grid,
- hydrological network reasoning for river inflow/outflow topology,
- uncertainty bounds for flood, drought and water-flow derived products,
- formalization or proof-oriented checks where suitable.

Every production result must remain reproducible without relying on an opaque AI answer alone.

## Planetary resource and infrastructure safety

AI-assisted defensive security is intended to protect the integrity and availability of the monitoring platform itself. High-priority assets include:

- GitHub Actions and deployment workflows,
- API credentials and repository secrets,
- provenance metadata and checksums,
- hazard and hydrology manifests,
- satellite-observation timestamps and source URLs,
- dependency and supply-chain integrity,
- anomaly detection for unexpected data/schema changes,
- prevention of accidental publication of synthetic content as observation data.

The project does not perform offensive cyber operations, person tracking or privacy-invasive monitoring.

## Evidence classes

The UI and generated datasets should keep four concepts visibly separate:

1. **Observation** - direct sensor or authoritative catalog data.
2. **Derived product** - deterministic processing of observations with documented method.
3. **Prediction/model** - physics or statistical model output.
4. **AI-assisted analysis** - an advisory result that must point back to reproducible inputs and checks.

For eclipse work, NOAA GOES imagery is observation data, while the NASA/GSFC shadow geometry is a prediction/reference calculation. The two may be compared, but must never be relabeled as one another.
