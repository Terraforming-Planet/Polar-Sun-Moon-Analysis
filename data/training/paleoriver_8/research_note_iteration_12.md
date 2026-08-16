# Sahara Station — research note, iteration 12

## Scope

This iteration moves the 3D globe from a single regional DEM patch toward a camera-centred global terrain provider. NASA GIBS remains the optical globe layer. Copernicus DEM is now loaded as a 3×3 neighbourhood of independent 1° COG tiles around the selected location.

## Data and rendering

The terrain engine does not download a global elevation archive. It requests only the nine 1° tiles around the current focus, reads reduced samples from the public Cloud Optimized GeoTIFFs and builds independent WebGL meshes. Requests are made in small asynchronous batches and sampled DEM promises are cached by source URL and LOD.

Two geometry levels are currently used:

- LOD 0: 9×9 samples per 1° tile,
- LOD 1: 17×17 samples per 1° tile.

The more detailed level is selected when the camera is close to the globe. Existing Three.js frustum culling remains enabled on each terrain mesh, so off-screen terrain does not need to be drawn.

## Important distinction

This is a **global-capable dynamic provider**, not a claim that the complete Earth DEM is resident in memory. Any supported latitude/longitude can become the focus, but only a small neighbourhood is fetched and rendered. This is deliberate: downloading the entire Copernicus DEM would conflict with the project's tile/LOD/batch-processing architecture.

Elevation is read from Copernicus DEM and converted to radial displacement relative to the Earth radius. A visual vertical exaggeration is retained to make relief visible at globe scale. The exaggeration changes the display only; it must not be used as a physical terrain height in hydrology calculations.

## Relation to the hydrology model

The existing 33×33 regional DEM overlay remains available for D8 flow visualization and hydrologic screening. The new 3×3 terrain engine is a rendering layer. Keeping the two roles separate prevents display LOD changes from silently changing the numerical D8 experiment.

## Current conclusion

The globe can now progressively display real elevation around any selected test location instead of showing elevation only for one central 1° tile. This reduces the visual discontinuity at the test-tile boundary and establishes the architecture needed for camera-driven terrain streaming.

The next engineering step is to bind scenario edits (mountain/valley deltas) to an immutable source DEM tile set, then recompute hydrology on a derived scenario grid. The original Copernicus elevation values should never be overwritten by a terraforming experiment.
