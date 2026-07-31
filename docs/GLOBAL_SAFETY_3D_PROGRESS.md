# Terraforming Planet — Global Safety Monitor and 3D Earth

## Current progress

The project now has an automated public-source environmental monitoring pipeline and a web dashboard.

Implemented:

- GitHub Actions workflow running automatically every 15 minutes and on manual request.
- NASA FIRMS active-fire ingestion using the encrypted `FIRMS_MAP_KEY` repository secret.
- USGS earthquake ingestion.
- NASA EONET natural-event ingestion.
- Copernicus EMS activation ingestion, including flood and severe-weather events when published by the source.
- Atomic JSON writes to avoid partially written data files.
- Public event feed at `web/public/data/events/latest.json`.
- GeoJSON hazard layer at `web/public/data/hazards.json`.
- Constellation dashboard with counters, filters, source links and automatic refresh.
- Existing Three.js Earth model prepared to receive geographic hazard markers.
- Balanced marker selection so one large category does not hide floods, storms, earthquakes or other events.
- Small synthetic event and GeoJSON datasets for deterministic pull-request tests.

## Rendering architecture

The 3D rendering pipeline is GPU-driven.

- The GPU renders the Earth, terrain, textures, atmosphere and hazard markers through WebGL/WebGPU.
- Large marker sets should use GPU instanced rendering or GPU point sprites instead of one mesh and one draw call per event.
- Vertex and fragment shaders should handle marker appearance, pulsing, visibility and other per-frame visual work where practical.
- The CPU is responsible for data acquisition, schema validation, filtering, indexing, category balancing and uploading compact buffers to the GPU.
- The CPU must not be described as the component that renders the 3D scene.
- Frustum culling, horizon/occlusion filtering and level of detail should reduce GPU work for objects that are not visible or are too small at the current zoom.

## Current limitations

- A satellite detection is decision-support information, not final confirmation of an emergency.
- Public satellite products are not continuous global video.
- Copernicus EMS and NASA EONET can report zero active flood records even while local floods exist, because their feeds cover published activations rather than every flood worldwide.
- The current Earth texture is a single global image. It becomes blurry under deep zoom.
- Satellite-source buttons currently select a logical source profile, but a real imagery switch requires a tiled globe and working imagery adapters.
- Rendering tens of thousands of individual meshes is unsuitable for mobile devices. The 3D view therefore uses a representative, category-balanced subset while the full feed remains available in JSON and the dashboard.

## Mini datasets for pull-request validation

The repository includes small synthetic fixtures under `tests/fixtures/global_safety/`.

- `mini_events.json` contains one event from each important category.
- `mini_hazards.geojson` contains matching geographic points for GPU marker tests.
- The fixtures are deterministic, contain no live emergency claims and never require external network access.
- Automated tests verify category balance, unique IDs, coordinate ranges and agreement between event records and GeoJSON features.

These fixtures let CI test the data-to-GPU preparation path without downloading tens of thousands of live observations.

## Next implementation stages

### 1. Reliable GPU 3D hazard layer

- Keep the Three.js renderer alive while changing filters and controls.
- Create a dedicated marker group updated independently of the Earth mesh.
- Use `THREE.InstancedMesh`, GPU point sprites or an equivalent WebGPU buffer pipeline.
- Keep one compact instance buffer containing position, category, severity and event ID information.
- Add distinct colors and symbols for fires, floods, storms, earthquakes and volcanoes.
- Add click/tap inspection with title, observation time, source and verification link.
- Add category visibility controls and a visible marker counter.
- Add frustum and horizon culling without rebuilding the Earth renderer.

### 2. Better flood coverage

- Add Copernicus GloFAS river-flood forecasts where access and licensing permit.
- Add GDACS flood and cyclone alerts.
- Keep Copernicus EMS activations as a separate verified-response layer.
- Clearly separate observed floods, forecasts, alerts and derived flood candidates.
- Never display `0 floods worldwide`; display `0 records in this source` when a feed has no records.

### 3. Real satellite imagery switching

- Replace the single 2K Earth texture with a GPU tile-based globe using a quadtree and level of detail.
- Connect NASA GIBS WMTS for global and near-real-time layers.
- Connect Copernicus Data Space STAC/OGC services for Sentinel products.
- Use Sentinel-2 for cloud-free optical detail and Sentinel-1 SAR for floods and cloud-covered regions.
- Decode, cache and upload only the tiles needed for the current camera view.
- Add cache limits, attribution, acquisition time, resolution and NoData indicators.
- Only show a satellite option as active when a real imagery adapter successfully supplies imagery.

### 4. Automation and validation

- Validate generated event and hazard schemas on every pull request.
- Validate the deterministic mini datasets on every pull request.
- Build the web application on every pull request.
- Run the data collector and deploy GitHub Pages automatically from `main`.
- Preserve the previous valid data file if a provider is temporarily unavailable.
- Publish source health, update time and record counts.
- Add lightweight automated browser checks for Earth rendering, zoom, layer toggles and data loading.

## Safety and scientific integrity

The system is intended for environmental awareness, research and emergency decision support. It must not identify private individuals, track private vehicles or make automated accusations. Alerts must preserve source attribution, acquisition time, uncertainty and the requirement for independent confirmation.
