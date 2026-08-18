# Earth–Space 512 Research Station

## Purpose
The Earth–Space 512 Research Station is a new public research workspace for studying the environment around Earth and the sky visible from Earth using official, legal and publicly accessible scientific data. It reuses the project's 8×8×8 spatial reasoning concept as a scientific 3D indexing system rather than as a game board.

The station must not claim that the 512 cells are physical sensors or direct measurements. They are an addressable 3D analysis grid that organizes observations, trajectories, directions, time windows and derived results.

## Core 8×8×8 model

The research volume contains exactly:

- 8 layers on X,
- 8 rows on Y,
- 8 columns on Z,
- 8 × 8 × 8 = 512 addressable cells.

Every cell must have:

- `cell_index`: 0–511,
- `cell_id`: stable human-readable identifier,
- `x`, `y`, `z`: integer coordinates 0–7,
- local normalized bounds,
- active physical coordinate frame and scale,
- observation time/range,
- source identifiers,
- evidence class,
- uncertainty/quality metadata,
- optional child LOD/refinement reference.

Suggested stable addressing:

`ES512-L{z+1}-{file}{rank}` where `file` is A–H and `rank` is 1–8. Example: `ES512-L4-C7`.

Also expose the numeric index and Cartesian tuple so code never depends on the display label.

## Coordinate modes

The same 512-cell visualization can be reused at multiple scientifically explicit scales. Never silently change scale.

### 1. Near-Earth Orbit mode
Earth-centered frame for public orbital and space-weather context. Scale and coordinate frame must be shown in the UI.

### 2. Earth–Moon mode
Earth-centered volume large enough to visualize Moon geometry and selected trajectories/observation directions. Use verified ephemerides, not hand-authored orbital paths.

### 3. Sky-direction mode
The cube becomes an angular reasoning volume tied to observer location/time. A cell represents a direction/bin, not a physical cubic kilometer. This mode is useful for Sun, Moon, planets, selected bright objects and observation planning.

### 4. Solar/space-weather context mode
Cells can organize directional/time-dependent context for solar wind, geomagnetic activity, auroral/space-weather products and relevant Earth-facing measurements. Do not imply 3D spatial resolution that the upstream product does not provide.

## LOD and refinement
The base model is always exactly 512 cells. To investigate one area more precisely, selecting a cell may open a local refinement grid or source-native visualization. Do not multiply the top-level cube beyond 512 cells or pretend that a coarse public product has finer resolution than it actually has.

Possible refinement methods:

- source-native raster/vector layer,
- local 8×8×8 child analysis grid with a breadcrumb to the parent cell,
- trajectory interpolation using verified ephemerides,
- time-series detail panel,
- camera/frustum detail for applicable observation geometry.

## What the station studies

### Earth–Sun–Moon geometry
- apparent position of Sun and Moon,
- illumination and phase geometry,
- eclipse and shadow geometry,
- seasonal/polar viewing geometry,
- Earth/Moon/Sun distance and direction from verified ephemerides.

Primary source preference: NASA JPL Horizons and other official project sources.

### Near-Earth objects and small bodies
- public NEO approach records,
- orbit/trajectory context where officially published,
- uncertainty and encounter geometry,
- separation of known catalog objects from hypothetical detections.

Primary source preference: NASA/JPL CNEOS, JPL Small-Body Database and ESA NEO Coordination Centre where appropriate.

### Space weather
- solar flares and coronal mass ejection event context,
- geomagnetic indices/alerts,
- solar wind context,
- auroral/geomagnetic conditions where official products exist.

Primary source preference: NOAA Space Weather Prediction Center, NASA DONKI and ESA official space-weather products where publicly accessible.

### Artificial satellites and missions
- visualize only trajectories/orbits for which legal, public and sufficiently authoritative data is available,
- prioritize science/Earth-observation mission context already used by the project,
- never use this station for person tracking, military targeting or privacy-invasive surveillance.

### Observation planning and visibility
- observer location and UTC time,
- horizon/azimuth/altitude,
- field-of-view/frustum overlays,
- which ES512 cells are intersected by the selected direction or trajectory,
- source timestamp and uncertainty.

## Visual design

The station should look like a scientific descendant of the project's 512-cell chess/cube concept, not a literal chess game.

Required elements:

- Earth at the center when using Earth-centered modes,
- transparent 8×8×8 cube around the scene,
- eight visibly separable layers,
- thin address-grid lines,
- hover/click highlighting of one cell,
- layer visibility controls 1–8,
- cell inspector panel,
- camera orbit/zoom/pan,
- smooth transitions with `prefers-reduced-motion` support,
- selectable coordinate axes and scale legend,
- timestamps and source badges always visible when showing scientific data.

Do not use a single blurred Earth texture. Reuse the existing corrected Cesium/WGS84/tiled Earth implementation where appropriate, or embed the ES512 volume around/in relation to the existing globe without destroying viewer lifecycle.

## Cell inspector
The selected-cell panel should show, where available:

- cell ID and numeric index,
- X/Y/Z indices,
- active coordinate mode,
- physical/angular bounds,
- intersecting observations/trajectories,
- time window,
- source agency/product,
- source timestamp,
- evidence class,
- uncertainty/quality,
- action: `Refine this cell`,
- action: `Build research job`,
- action: `Compare time`,
- action: `Export cell JSON`.

## AI use
AI may help rank or explain observations associated with cells, but it may not invent orbital states, object detections, scientific measurements or confidence values.

OpenAI API usage is limited to evidence-grounded explanation/summarization on the local/backend research node. Structured measurements remain deterministic/source-grounded.

## Training and evaluation ideas

The ES512 model can be used to train/test spatial reasoning on:

- mapping a verified vector/trajectory to the correct 3D cell sequence,
- predicting the next occupied cell from ephemeris samples while reporting uncertainty,
- distinguishing physical-volume mode from angular sky-direction mode,
- aligning Earth/Sun/Moon geometry across timestamps,
- selecting relevant cells for an observer field of view,
- detecting indexing/addressing errors,
- comparing coarse 512-cell reasoning against source-native continuous coordinates.

Evaluation must include exact cell-address accuracy, trajectory-cell intersection accuracy and temporal consistency. Training examples must be generated from verified source data or transparent deterministic geometry, never invented labels presented as observations.

## Public page requirements

Route suggestion: `/earth-space-512/` or `/research-stations/earth-space-512/`.

Public page sections:

1. Live/selected UTC time.
2. 512-cell 3D viewer.
3. Mode selector.
4. Layer selector 1–8.
5. Cell inspector.
6. Earth–Sun–Moon geometry panel.
7. Space-weather panel.
8. NEO/small-body research panel.
9. Mission/orbit context panel.
10. Experiments and training results.
11. Sources, limitations and evidence classes.
12. Exportable reproducible research job.

## Language
Every public UI string for this station must be English. The same rule applies to the entire public site, all stations, all tabs, all public experiment pages and all public reports after the BUILD FOR GOOD migration.

## Safety and scientific guardrails

- No fabricated measurements or objects.
- No secret/private data.
- No person tracking.
- No military targeting/weaponization features.
- Do not label catalogue propagation as optical detection.
- Do not imply a 512-cell bin has better resolution than the upstream source.
- Keep observation, derived value, estimate and hypothesis separate.
- Log provenance and uncertainty for every publishable scientific result.
