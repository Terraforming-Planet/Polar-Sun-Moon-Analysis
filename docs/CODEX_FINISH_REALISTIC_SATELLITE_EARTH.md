# Codex task: finish the realistic satellite Earth implementation

## Current state

PR #21 was merged, but it added only the implementation contract. It did **not** implement the realistic satellite globe or the official near-real-time imagery pipeline. The current application still shows a synthetic blue wireframe/partial globe, an old selected observation, excessive empty mobile space and buttons that do not yet prove that real satellite imagery is being rendered.

Work on branch `codex/finish-realistic-satellite-earth` and update the existing PR for that branch. Do not create another PR.

## Required result

Finish the feature end to end so that the Earth view displays a complete, centred, realistic globe textured with an actually published satellite frame. The first mandatory working source is NASA GIBS VIIRS true-colour because it provides a global equirectangular image suitable for a sphere. Then add the existing source/status architecture for other official providers without faking unavailable imagery.

Use `notebooks/cdse_realistic_earth_pipeline.ipynb` as the reference and executable CDSE/Jupyter workflow. Refactor reusable logic into the Python package or scripts where appropriate; do not leave production logic only inside the notebook.

## Backend/data pipeline

1. Implement a reusable NASA GIBS adapter that:
   - requests the official EPSG:4326 WMS endpoint;
   - searches recent UTC dates backward and accepts only a valid returned image;
   - records the actual requested observation date and the separate retrieval timestamp;
   - validates MIME type, dimensions and checksum;
   - retries with timeout/backoff;
   - caches unchanged frames;
   - writes only web-ready JPEG/PNG previews;
   - never invents an observation timestamp.
2. Generate `web/public/data/satellite-manifest.json` with source metadata and sorted frames.
3. Add CLI commands compatible with the contract from PR #21, at minimum:
   - `python -m terra_hazards satellite-sources`
   - `python -m terra_hazards satellite-latest`
   - `python -m terra_hazards satellite-history --hours 24`
   - `python -m terra_hazards satellite-build-manifest`
   - `python -m terra_hazards satellite-validate`
4. Add adapters/status placeholders for EUMETSAT Meteosat, NOAA GOES, JMA Himawari and optional DSCOVR EPIC. A source without working access must be visibly `unavailable` with the real reason; never substitute fabricated data.
5. Add deterministic tests for metadata parsing, frame sorting, nearest-frame selection, missing frames, retries/cache, source failure isolation, manifest validation and no invented timestamps.

## Realistic Three.js globe

1. Replace the wireframe-only Earth with a complete sphere using the latest valid frame from `satellite-manifest.json` as the primary surface texture.
2. Keep a NASA Blue Marble fallback texture for offline/error state, with clear attribution.
3. The globe must:
   - be fully visible and centred on desktop and phone;
   - preserve aspect ratio and never be clipped by its canvas/container;
   - have correct equirectangular UV mapping;
   - preserve axial tilt;
   - use a separate subtle atmosphere layer;
   - include day/night lighting and a terminator calculated from the selected UTC;
   - support OrbitControls, reset, zoom, fit whole Earth and auto-rotation;
   - resize correctly with `ResizeObserver` and device pixel ratio limits;
   - dispose textures, materials, geometries and listeners on unmount.
4. Do not stretch regional geostationary images over the full globe. Show them only in valid coverage sectors unless they have been correctly reprojected.
5. Remove the large empty vertical area visible below the mobile globe.

## Time and source controls

1. Load only timestamps that exist in the manifest.
2. Implement:
   - requested UTC input;
   - source selector;
   - previous/next real frame;
   - latest published frame;
   - nearest real frame selection;
   - requested-versus-displayed time difference;
   - play/pause using real frames only;
   - visible missing-frame gaps.
3. Never label the feature as live video. Use Polish wording such as `najnowsza opublikowana obserwacja satelitarna` and show data age/latency.
4. Separate EONET catalogue events from measured satellite detections and derived products.

## GitHub Pages and mobile requirements

- All asset and JSON paths must respect the Vite/GitHub Pages base URL; no root-relative paths that break under `/Polar-Sun-Moon-Analysis/`.
- No page-level horizontal overflow from 320 px upward.
- Buttons must be at least 44 px high.
- Navigation may scroll only inside its own row.
- Test at 320×568, 360×800, 390×844, 412×915, 768×1024 and 1440×900.

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

Run a production preview and verify HTTP 200 under the repository base path for:

- `/`
- `/copernicus/`
- `/flood-map/`
- `/data/satellite-manifest.json`
- `/data/hazards.json`
- `/data/observations.json`
- `/data/solar-system.json`

Create real screenshots from the built app:

- `docs/screenshots/earth-realistic-desktop.png`
- `docs/screenshots/earth-realistic-mobile-360x800.png`
- `docs/screenshots/earth-realistic-mobile-412x915.png`
- `docs/screenshots/satellite-source-status.png`

## Definition of done

The PR is ready only when the deployed-style production build visibly renders the full realistic satellite-textured Earth, controls use real manifest timestamps, source latency is disclosed, mobile clipping/empty space is fixed, tests pass and screenshots prove the result. Update the PR description with exact source names, actual observation range, measured latency, unavailable sources, test output and licensing/scientific limitations.
