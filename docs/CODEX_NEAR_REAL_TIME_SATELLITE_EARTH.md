# Codex implementation contract: near-real-time satellite Earth

Implement issue #20 completely on branch `feature/near-real-time-satellite-earth`. Work in the existing pull request for this branch. Do not open a duplicate PR and do not mark it ready until all acceptance criteria pass.

## Product goal

Replace the synthetic wireframe Earth with a realistic, time-aware Three.js globe and official near-real-time imagery adapters. The application must search and play actual published satellite frames, preserve gaps, disclose source latency and never describe delayed imagery as live video.

## Scientific language

Use only: near-real-time satellite image, latest published frame, observation timestamp UTC, processing latency, animation assembled from real frames. Never fabricate imagery, timestamps, cloud cover, FRP, fire intensity, flood severity, temperature, affected area or scene counts. EONET points are catalogue locations, not direct detections or measured severity. Unavailable sources must remain visibly unavailable.

## Official source adapters

Implement official machine-readable integrations where access permits:

- EUMETSAT Meteosat Third Generation / Meteosat-12 FCI for Europe and Africa.
- NOAA GOES-East and GOES-West ABI official cloud/object-store or imagery endpoints.
- JMA Himawari-8/9 AHI official imagery endpoints for Asia and the Pacific.
- NASA GIBS/Worldview WMTS for global scientific overlays.
- Optional NASA DSCOVR EPIC whole-disc natural-colour imagery.

Do not scrape HTML when an API, WMTS/WMS, object store or data service exists. Credentials must be read only from environment variables.

## Required Python commands

Provide:

```bash
python -m terra_hazards satellite-sources
python -m terra_hazards satellite-latest
python -m terra_hazards satellite-history --hours 24
python -m terra_hazards satellite-build-manifest
python -m terra_hazards satellite-validate
```

The pipeline must retrieve metadata first, identify actual observation timestamps, cache unchanged files, use timeout/retry/backoff, isolate source failures and write `web/public/data/satellite-manifest.json`. Store only web-ready previews; never commit massive raw NetCDF/HDF/GeoTIFF archives.

## Manifest contract

Every source entry must contain: id, agency, satellite, instrument, coverage, mode, expected cadence, latest observation UTC, retrieval UTC, processing latency, availability status, official source URL, licence/usage conditions, last error and a sorted frame list. Every frame must include timestamp UTC, official URL or local preview path, dimensions, checksum and content type. Missing timestamps must stay missing; never infer them from current time.

## Realistic Three.js Earth

- Use a legally reusable, credited NASA Blue Marble or equivalent official texture.
- Add separate cloud and atmosphere layers.
- Compute day/night lighting and terminator from selected UTC.
- Preserve axial tilt.
- Provide optional coastline/border overlays.
- Keep OrbitControls and add reset, zoom, fit-whole-Earth and auto-rotation controls.
- Centre the full globe on phones and prevent clipping.
- Reproject geostationary imagery correctly; do not stretch rectangular source images directly over a sphere.

## Layers

Add a layer manager for Blue Marble, Meteosat, GOES-East, GOES-West, Himawari, NASA GIBS, clouds, active fires, EONET catalogue events and the existing Sentinel-1 flood link. Clearly label satellite image, derived product, event catalogue, hypothesis and unavailable data. Display sources only in their valid coverage sectors unless a documented, per-tile-attributed mosaic is produced.

## Real-frame time search

Implement date/time UTC input, `Znajdź obserwację`, source/layer/region selectors, previous/next real frame, latest published frame, play/pause, real cadence and 1/2/5 fps playback, source-specific range, nearest-frame selection, configurable maximum distance and explicit requested-vs-displayed difference. Never jump across years without a warning. Animation must use actual frames only and show missing-frame gaps.

## Fires

Separate EONET catalogue events, NASA FIRMS detections, geostationary hotspot products and smoke/cloud imagery. Use different legends. Show FRP, brightness temperature or pixel counts only when present in the official product.

## Mobile acceptance

No page-level horizontal overflow from 320 px upward. Navigation may scroll inside its own container. Timeline status wraps. The full globe fits the available width. Controls are at least 44 px tall. Cards collapse to one column. Remove large empty vertical areas. Test 320×568, 360×800, 390×844, 412×915, 768×1024 and 1440×900 in portrait and relevant landscape layouts.

## Status panel

For every source show satellite/instrument, coverage, latest observation UTC, retrieval UTC, latency, expected cadence, availability, official source, licence and last error. Global status must be derived from cadence and data age: all current, delayed source(s), or unavailable source(s). Do not use an invented threat severity.

## Tests

Python tests: metadata parsing, frame sorting, nearest-frame selection, cadence/latency, gaps, cache, source isolation, manifest validation and no invented timestamps.

React/Vitest tests: source switching, requested vs selected time, nearest-frame warning, playback through real frames, unavailable source, evidence badges, GitHub Pages relative URLs, mobile navigation and no root-relative links.

## Validation

Run and pass:

```bash
ruff check .
mypy polar_equinox_analysis terra_hazards tests
pytest -q
cd web
npm ci
npm test -- --run
npm run build
```

Run production preview and verify HTTP 200 for `/`, `/copernicus/`, `/flood-map/`, `/data/satellite-manifest.json`, `/data/hazards.json`, `/data/observations.json` and `/data/solar-system.json` under the repository Pages base path.

Generate real browser screenshots:

- `docs/screenshots/control-center-desktop.png`
- `docs/screenshots/control-center-mobile.png`
- `docs/screenshots/earth-live-layers-mobile.png`
- `docs/screenshots/earth-live-layers-desktop.png`

Update the PR with exact source names, actual ranges/cadence/latency, screenshots, test output, unavailable sources and scientific/licensing limitations. Do not mark ready for review until all checks and visual acceptance criteria pass.
