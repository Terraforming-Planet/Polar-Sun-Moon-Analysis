# Codex task: complete automatic Copernicus/NASA hazard monitoring

Work only on branch `feature/automatic-hazard-monitoring` and update the existing pull request for this branch. Do not create another PR and do not merge.

## Current implementation already present

- `scripts/refresh_public_hazard_feeds.py` refreshes official USGS earthquakes and NASA EONET catalogue data.
- `.github/workflows/refresh-hazard-data.yml` schedules lightweight public-feed refreshes.
- CDSE/Jupyter architecture and GIBS notebook already exist in the repository.

## Required outcome

Deliver one production-ready monitoring system that synchronizes official NASA, USGS and Copernicus data with GitHub Pages and renders a realistic time-aware Three.js Earth. It must distinguish measured detections, satellite imagery, derived products and event catalogues. It must never invent severity or timestamps.

## 1. Data pipeline

Implement reusable adapters and commands for:

- NASA GIBS VIIRS true-colour global frames;
- NASA FIRMS VIIRS/MODIS active-fire detections using `NASA_FIRMS_MAP_KEY`;
- USGS earthquakes;
- NASA EONET catalogue events;
- CDSE STAC Sentinel-1 GRD and Sentinel-2 L2A discovery;
- existing openEO Sentinel-1 flood processing;
- polar Sentinel/GIBS observations.

Add commands:

```bash
python -m terra_hazards refresh-public
python -m terra_hazards refresh-fires
python -m terra_hazards refresh-cdse
python -m terra_hazards build-hazard-manifest
python -m terra_hazards validate-hazards
```

Use environment variables only. Do not commit credentials.

## 2. CDSE synchronization

Use persistent paths under:

```text
~/mystorage/Polar-Sun-Moon-Analysis
~/mystorage/terraforming-data/raw
~/mystorage/terraforming-data/cache
~/mystorage/terraforming-data/processed
~/mystorage/terraforming-data/logs
```

Implement a Jupyter/CDSE runner that:

1. searches current CDSE STAC collections;
2. stores raw and heavy outputs only in `mystorage`;
3. processes only new scenes;
4. generates small web-ready GeoJSON/JSON/WebP/PNG previews;
5. validates outputs;
6. commits and pushes only public artifacts to the PR branch.

The free Jupyter session is not always-on, so preserve the hybrid design: GitHub Actions refreshes lightweight feeds, while CDSE Jupyter/openEO processes Sentinel data when running.

## 3. Hazard rules

### Fires

Generate an alert only from a real FIRMS detection with coordinates and acquisition time. Include FRP, confidence and brightness temperature only when supplied. Never use EONET as a measured fire detection.

### Floods

Generate a candidate alert only after documented Sentinel-1 before/after change processing passes quality checks and exceeds a configurable area threshold. Include both scene IDs, timestamps, threshold, method and uncertainty. Never claim water depth.

### Earthquakes

Use official USGS events. Include magnitude, depth, coordinates and time. Keep the current configurable screening threshold and expose it in metadata. Optional InSAR products must be separately labeled derived products.

### Polar regions

Generate alerts only from documented measured or derived ice/snow indicators with a real observation date and baseline. Do not infer a crisis from image appearance alone.

Every alert must contain the rule, inputs, source IDs, observation time, processing time and evidence type.

## 4. Public output

Generate and validate:

```text
web/public/data/satellite-manifest.json
web/public/data/hazards.json
web/public/data/fires.geojson
web/public/data/floods.geojson
web/public/data/earthquakes.geojson
web/public/data/eonet-events.json
web/public/data/polar-observations.json
web/public/data/source-status.json
web/public/data/satellite/*
web/public/data/overlays/*
```

Use GitHub Pages base-relative asset paths.

## 5. Realistic Earth frontend

Replace the wireframe as the primary view with a full, centred realistic Earth using the latest valid NASA GIBS frame and Blue Marble fallback. Add:

- atmosphere layer;
- clouds where a real layer exists;
- day/night lighting and UTC terminator;
- axial tilt;
- OrbitControls;
- reset, fit, zoom and auto-rotation;
- ResizeObserver and proper disposal;
- mobile layouts from 320 px upward without clipping or empty vertical space.

Add layer controls for fires, floods, earthquakes, EONET and polar observations. Regional Sentinel products must be projected only over their real coverage, never stretched over the whole globe.

## 6. Time controller

Use only real observation timestamps. Implement requested UTC, displayed UTC, nearest observation, previous/next, latest frame, play/pause over real frames, missing-frame gaps and visible latency.

Use wording such as `najnowsza dostępna obserwacja` and `dane niemal w czasie rzeczywistym`, never continuous live video.

## 7. Automation

Improve the workflow so that after merge it operates on `main`, refreshes feeds, validates outputs, runs tests, builds the site and allows the existing Pages workflow to deploy. Prevent infinite workflow loops and concurrent data writes.

CDSE credentials and FIRMS keys must use GitHub repository secrets. Missing credentials must mark the source unavailable without failing unrelated sources.

## 8. Tests and screenshots

Run:

```bash
ruff check .
mypy polar_equinox_analysis terra_hazards tests
pytest -q
cd web
npm ci
npm test -- --run
npm run build
```

Add tests for source failures, schemas, no invented timestamps, alert rules, relative URLs, layers and mobile layout.

Capture production screenshots:

```text
docs/screenshots/realistic-earth-desktop.png
docs/screenshots/realistic-earth-mobile.png
docs/screenshots/fire-detections.png
docs/screenshots/flood-derived-layer.png
docs/screenshots/earthquakes.png
docs/screenshots/polar-layer.png
docs/screenshots/source-status.png
```

Do not mark the PR ready until the screenshots, generated data, tests and production build prove the complete system.
