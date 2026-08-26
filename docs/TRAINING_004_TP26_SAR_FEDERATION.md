# Training #4 — TP-26 Federated SAR + Water Observation

## Why TP-26 matters here

TP-26 is used as a virtual multi-provider observation fabric. It does not mean Terraforming Planet owns, controls, partners with, or is endorsed by the agencies and companies listed in the TP-26 registry. Its role is to route a scientific question to the most suitable legal/public observation source and preserve provenance, timing, footprint, quality and licence constraints.

For Training #4 the goal is not simply to increase the number of images. The goal is to increase **sensor diversity, provider diversity and falsifiability** so the system can tell whether a learned pattern generalizes beyond one mission.

## Core architecture

### Track A — C-band SAR

Primary sources:

- Copernicus Sentinel-1 through CDSE;
- NASA JPL OPERA RTC-S1;
- NASA JPL OPERA DSWx-S1 where appropriate.

Use this track for flood/surface-water mapping, river morphology under cloud, radar context and dynamic surface-water products. Existing Polar code already uses NASA OPERA RTC-S1 previews for the eight paleoriver test locations. Training #4 must extend this from preview-level screening toward reproducible product-level processing.

### Track B — L-band SAR

Primary public research source:

- JAXA ALOS PALSAR / ALOS-2 PALSAR-2 / JERS-1 released global mosaics.

This is an independent radar family and provider. It should be used as a cross-frequency and cross-provider generalization check rather than mixed blindly into Sentinel-1 training.

The evaluation should include cases where the system is trained mostly on C-band but tested on held-out L-band geography/time, and vice versa where scientifically meaningful.

### Track C — Optical context

Use:

- NASA GIBS MODIS/VIIRS;
- Landsat;
- Sentinel-2;
- Digital Earth Australia;
- INPE Brazil Data Cube where applicable.

Optical data does not replace SAR. It provides complementary context and can help verify whether a candidate surface-water or morphology interpretation is consistent across modalities when cloud conditions allow.

### Track D — Terrain and water-cycle context

Use:

- Copernicus DEM;
- SWOT;
- GRACE/GRACE-FO;
- SMAP;
- GPM where available;
- NOAA/GEBCO bathymetry and multibeam metadata for coastal/ocean questions.

These sources must retain their scale limits. GRACE is not a local aquifer detector, SMAP is not a fracture map, SWOT is not bathymetry by itself, and multibeam sonar is shipborne acoustic measurement rather than SAR.

## TP-26 provider classes

### Public-first / active research routes

Use these first when they satisfy the question:

- ESA / European Commission — Copernicus CDSE;
- NASA Earthdata / JPL OPERA;
- USGS / NASA Landsat;
- JAXA EORC public research products;
- CEOS / WGISS for federated discovery/interoperability;
- NOAA / GEBCO for weather/ocean/bathymetry context.

### Conditional providers

The TP-26 registry also includes providers with scientifically valuable SAR assets, such as:

- CSA / NRCan — RADARSAT Constellation Mission and RADARSAT-2;
- CONAE — SAOCOM;
- DLR — TerraSAR-X / TanDEM-X;
- ASI — COSMO-SkyMed;
- KARI — KOMPSAT-5;
- licensed commercial providers including ICEYE and Capella.

These are **not enabled by default**. An adapter may be activated only after the exact product's official access, authentication, research/commercial licence and redistribution conditions are verified. No secret token belongs in GitHub Pages or the repository.

## Data-volume strategy

Training #4 targets 500,000 actually used 512×512 training patches, but it must not generate 500,000 remote requests.

Preferred flow:

1. discover larger official products/tiles/chunks;
2. stream/window them into bounded ephemeral cache;
3. validate metadata and licence;
4. cut multiple local patches from one fetched source chunk;
5. deduplicate by source/product/coordinates/time and content hash;
6. feed pinned-memory batches to the L4;
7. preserve a manifest for every accepted patch.

The GPU pipeline from Training #3 must be decoupled into producer/consumer stages so GPU starvation can be measured explicitly.

## Holdout design

Training #4 needs three different holdout dimensions:

1. **geographic holdout** — areas never used for optimization;
2. **time holdout** — acquisition periods kept out of training;
3. **provider/sensor holdout** — selected independent products held back to test generalization.

Examples:

- train primarily on Sentinel-1 C-band; test selected JAXA L-band cases;
- train on some basins; test unrelated basins/continents;
- train on earlier acquisitions; test later acquisitions;
- verify a water candidate against DSWx-S1 where the product is valid.

B01-B10 remains an untouched external agent benchmark and must never enter training.

## Shared evidence package for Terra and EVE

The agent comparison does not require the language model to pretend that it saw raw pixels. A deterministic vision/data pipeline creates an evidence package containing, when available:

- provider and mission;
- sensor, radar band and polarization;
- product/processing level;
- product/granule ID;
- acquisition UTC;
- footprint/AOI;
- native resolution;
- quality/cloud/NoData flags;
- calibrated/derived metrics only when their physical meaning is valid;
- source limitations;
- licence/access state;
- provenance;
- evidence class.

Terra Agentic EO and EVE-Instruct receive the same package and answer the same scientific question:

> What can we conclude, what remains unknown, which independent observation should be requested next, and what observation would falsify the current hypothesis?

Their self-assessment is not the score. Deterministic assertions and observed tool behavior remain the benchmark.

## Public-good focus

Training #4 should prioritize workflows that can realistically improve environmental monitoring and emergency understanding:

- flood and surface-water extent;
- disappearing or changing rivers/lakes/wetlands;
- river-channel morphology;
- drought and water-storage context;
- wildfire/thermal context;
- glacier/snow/ice change;
- coast and estuary change;
- terrain/drainage constraints;
- missing-data and source-failure honesty.

The system must prefer `UNKNOWN` over a fabricated environmental claim.

## What success means

Success is not "Terra beats ESA" or "one provider is best".

Success means Training #4 tells us:

- which sensor combinations are complementary;
- where a model fails across radar bands/providers;
- which data sources produce redundant information;
- which provider/API failures starve the GPU or block analysis;
- which conclusions are stable across independent observations;
- where the system needs another measurement before making a claim;
- what should be changed before Training #5.

## Related configuration

Machine-readable plan:

`config/training-004-tp26-sar-federation.json`

Parent Training #4 configuration:

`config/training-004-planet-observation.json`
