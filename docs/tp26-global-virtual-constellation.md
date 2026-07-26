# TP-26 Global Virtual Constellation

## Purpose

TP-26 treats the worldwide fleet of Earth-observation missions as one virtual, multi-provider constellation. The number 26 comes from the 26 directions surrounding the central cell in a 3 × 3 × 3 geometry: 6 face directions, 12 edge directions and 8 corner directions.

The geometry is a synchronization and indexing model. It does not claim that physical satellites remain stationary at those positions.

## Scale levels

- **TP-26** — 26 directional sectors.
- **TP-676** — up to 26 observation channels per sector.
- **TP-17 576** — a long-term architecture capable of representing 26 × 26 × 26 observation channels, sensors, products or processing nodes.

These are capacity targets for the data model, not claims that the project currently controls that many satellites.

## Scientific product rules

Every accepted observation must preserve:

- provider and mission,
- product or granule identifier,
- acquisition start and end time in UTC,
- footprint geometry,
- native coordinate reference system,
- sensor and processing level,
- spatial resolution,
- cloud or quality flags,
- licence and download restrictions,
- NoData mask,
- ingestion time and checksum when downloaded.

A product is never stretched beyond its footprint. Missing coverage is not generated in the scientific view.

## Frame synchronization

A TP frame is defined by a UTC interval. Products intersecting that interval are ranked by:

1. acquisition time distance from the frame centre,
2. sensor suitability for the requested task,
3. valid coverage percentage,
4. cloud and quality masks,
5. native resolution,
6. licence and reproducibility,
7. processing latency.

Each rendered pixel or tile must retain provenance. A visually continuous layer may be produced separately, but it must be labelled as a multi-temporal reconstruction or mosaic.

## Provider adapters

The registry at `web/public/data/tp26-global-sources.json` separates providers into:

- active adapter,
- ready for adapter,
- planned adapter,
- registered source requiring authentication or licensing,
- federated discovery backbone,
- licence-gated commercial provider.

Registering a provider does not imply that its data can be downloaded without permission. An adapter becomes active only after its API, authentication, licence and product metadata have been verified.

## Initial implementation order

1. Copernicus CDSE STAC.
2. USGS Landsat STAC.
3. NASA CMR-STAC.
4. Digital Earth Australia STAC and public bucket.
5. INPE / Brazil Data Cube STAC.
6. EUMETSAT and NOAA near-real-time meteorological feeds.
7. Provider-authorized adapters for JAXA, ISRO, KARI, China, Canada and other national catalogues.

## Security and legality

Credentials must be stored outside the public frontend. The browser must never contain service-role keys, private API secrets or licensed download tokens. Restricted providers require a backend proxy and explicit compliance with their terms.
