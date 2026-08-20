# CODEX TASK — Terra Observation System
## Repair AI Research initial preview + always-visible chat + finish terrain analysis laboratory

Repository:
`Terraforming-Planet/Polar-Sun-Moon-Analysis`

Current PR:
`#195 — AI Research: terrain flags, DEM profiles and multimodal research chat`

Branch:
`feature/ai-research-terrain-flags-chat`

## Problem seen on real Android production smoke test

The AI Research page can still look almost empty before a place is searched. The user sees the search box and Advanced section, but no obvious Earth preview and no chat window. This is unacceptable for the intended workflow.

Two causes must be treated separately:

1. PR #195 has not yet been merged/deployed to production, so the live GitHub Pages site still shows the older UI.
2. Even inside PR #195, some new modules were conditionally rendered only when `place` was non-null. The initial state must already show the global Earth preview and the assistant.

Do not hide the main research UI behind a successful geocode result.

---

# Required UX — initial screen before any search

When the user opens **AI Research → Zbadaj teren**, without typing anything, the page MUST immediately show:

1. Search input for place / river / lake / region / coordinates.
2. Interactive global 3D Earth preview, zoomable and rotatable.
3. Current official-source layer status and observation date/time where available.
4. Always-visible OpenAI research chat.
5. Model switcher:
   - `gpt-5.6-luna`
   - `gpt-5.6-terra`
   - `gpt-5.6-sol`
6. Attachment controls:
   - max 5 images,
   - max 5 other files,
   - max 10 total attachments,
   - max 25 MB total payload per message.
7. Clear explanation that a local terrain laboratory activates after a place is selected.
8. No blank sections. If a renderer or source fails, show a visible diagnostic/error card with the affected source.

The chat must work even before a place is selected. In that state it can help plan the study, but it must explicitly state that no terrain/satellite measurement has been run yet.

---

# After a place is selected

The system must:

1. Put a marker on the 3D globe.
2. Center/show a local context map.
3. Show the newest suitable official satellite image that is actually available for the area, with the exact source and date.
4. Start the existing bounded official-data analysis pipeline.
5. Open the terrain laboratory below the map.
6. Pass the selected place, satellite analysis, flags, DEM values, lines and attachments into subsequent chat turns.

The user must be able to continue asking questions about the same research session without losing context on ordinary rerenders.

---

# Scientific globe and map

Reuse the existing Cesium/WGS84 renderer. Do not create a fake textured sphere.

The global viewer should continue to support official/public sources already integrated by the project, including where currently available:

- NASA GIBS / Worldview,
- VIIRS,
- MODIS,
- Sentinel-1,
- Sentinel-2,
- Sentinel-3,
- Copernicus Data Space,
- Landsat / USGS,
- NOAA / GOES,
- EUMETSAT.

Use tiled imagery, dynamic loading, cache and existing LOD behavior. Do not replace real imagery with generated pixels.

For every displayed satellite layer show:

- provider/agency,
- product/layer,
- observation date/time when known,
- whether it is latest-complete, near-real-time or historical,
- known coverage/resolution limitation.

If the newest requested time has no observation, use the nearest real available scene and say exactly which date/time was used.

---

# Numbered research flags

The user must be able to place numbered flags directly on the local satellite image/map.

Each flag must store:

- sequential number,
- WGS84 latitude,
- WGS84 longitude,
- user label,
- selected display color,
- DEM elevation when available,
- elevation source dataset,
- nominal horizontal resolution,
- sample method,
- actual/nearest DEM sample coordinate if the backend returns one,
- distance from requested flag coordinate to the sampled DEM cell/point if calculable,
- source limitations.

Do not invent an elevation. Missing elevation must remain missing and visibly marked.

---

# DEM architecture

Preferred target:

**Copernicus DEM GLO-30** from legal official/public Copernicus Data Space access.

Fallback:

**Copernicus DEM GLO-90** using the current bounded path if direct GLO-30 retrieval is not available in the runtime.

Rules:

- Do not expose CDSE credentials in the browser bundle.
- Do not claim a transport proxy is the scientific source. Separate `scientific_dataset` from `delivery_transport` in API responses.
- If using GLO-90, label it explicitly as approximately 90 m nominal grid resolution.
- If using GLO-30, label it explicitly as approximately 30 m nominal grid resolution.
- Explain that raster elevation is not a centimetre-accurate survey measurement.
- Return nearest-sample information where technically available.

Implement the DEM adapter as its own module with tests.

---

# Colored research drawing

Keep the color drawing system visible and touch-friendly on mobile.

Required colors at minimum:

- red,
- yellow,
- green,
- blue,
- magenta/pink,
- white,
- black.

The user must be able to:

- draw multiple independent lines,
- finish/cancel a line,
- delete a chosen line,
- keep existing flags while drawing,
- reopen local notebook state,
- distinguish annotations from scientific observations.

User drawings are annotations only. Never convert a colored line into a scientific fact.

---

# Elevation profiles and charts

From any completed research line, generate a terrain elevation profile.

Default profile:

- 20 evenly distributed DEM samples along the geodesic/polyline path,
- point number,
- coordinate,
- elevation,
- cumulative distance,
- source dataset,
- sample resolution/limitations.

Display:

- line chart,
- min elevation,
- max elevation,
- total horizontal distance,
- overall rise/fall,
- per-segment slope where meaningful.

Do not interpolate fake precision beyond the DEM grid. If the raster source cannot support a requested detail, say so.

The chart must be generated from returned DEM values, never from hand-authored/example heights.

---

# Nile example

Keep a one-click example called **Dodaj 3 punkty Nilu**.

Use clearly labelled reference points for:

1. Lake Tana / upper Blue Nile source region,
2. Ethiopian Highlands / upper Blue Nile catchment reference,
3. Khartoum / White Nile–Blue Nile confluence region.

Coordinates are reference study points. Elevations must always be fetched from the DEM backend, never hardcoded.

The interface must say that these are reference markers for starting a study, not a claim that three points fully describe the Nile hydrological system.

---

# Rivers, drainage and basin context

Add a modular official/public hydrology overlay architecture for future and current use.

Prefer legal open datasets such as official/public Copernicus/JRC products and other already approved project sources. Where a global hydrography dataset is used, expose provenance and licence.

The research view should eventually support toggles for:

- rivers,
- tributaries,
- lakes/reservoirs,
- drainage/basin boundaries,
- flood context,
- terrain/DEM.

Do not infer private infrastructure or personal activity.

---

# OpenAI research assistant

Use the Responses API server-side through the existing Worker architecture.

Allowed models must be server-side allowlisted only:

- `gpt-5.6-luna`
- `gpt-5.6-terra`
- `gpt-5.6-sol`

Do not accept arbitrary model IDs from the browser.

The assistant may receive:

- current place,
- current map coordinates,
- current satellite result,
- official source metadata,
- numbered flags,
- DEM values and limitations,
- drawn lines,
- generated elevation profiles,
- up to 5 images,
- up to 5 other files,
- prior conversation turns.

It must be able to answer follow-up questions such as:

- compare flags 1–10,
- where is the greatest elevation drop,
- which line has the steepest profile,
- compare an uploaded image with the current satellite scene,
- identify what additional official data would be needed,
- generate a report from the current research session.

Scientific guardrails:

- never invent elevation, area, water depth, flow, acquisition date, sensor result or cause,
- visible morphology is observation evidence, not causation,
- user drawing is annotation, not evidence,
- training metrics are not environmental ground truth,
- state uncertainty explicitly,
- cite/provide source metadata in report output where available.

---

# Reports

Add/keep **Generuj raport**.

The generated report must contain sections for:

- research area,
- WGS84 coordinates,
- selected period,
- official satellite sources/dates,
- attachments used,
- flags and DEM measurements,
- elevation profile summary,
- observed changes,
- hypotheses clearly separated from observations,
- limitations,
- recommended next measurements/checks.

Markdown export is required. If a PDF export already exists elsewhere in the project, integrate only if it does not destabilize the current PR; otherwise keep Markdown and leave PDF as a separate follow-up.

---

# Mobile requirements

The real user is testing on Android mobile. Test widths at least:

- 360 px,
- 390 px,
- 412/430 px.

Requirements:

- globe visible without horizontal overflow,
- chat controls usable with touch,
- model selector readable,
- attachment buttons not clipped,
- map/flag controls usable with finger taps,
- charts readable and horizontally scrollable only when necessary,
- no accidental hidden content below a collapsed/zero-height container.

---

# Failure states

Never fail as a blank UI.

Add visible failure states for:

- Cesium load error,
- NASA GIBS image failure,
- geocoding failure,
- CDSE/DEM failure,
- Landsat catalogue failure,
- OpenAI Worker failure,
- oversized/unsupported attachment.

Each error should preserve the rest of the workspace whenever possible.

---

# Tests / acceptance criteria

Add regression tests proving at minimum:

1. Initial AI Research render contains the global Earth preview before a place is selected.
2. Initial AI Research render contains the chat before a place is selected.
3. Selecting/searching a place causes the marker/local map/terrain laboratory to appear.
4. Chat context can contain `place: null` safely before selection.
5. Model allowlist rejects arbitrary model IDs.
6. Attachment limits enforce 5 images + 5 files + 10 total + 25 MB total.
7. DEM API returns explicit scientific dataset + delivery method/proxy + nominal resolution.
8. A flag never receives a fabricated elevation when the upstream DEM request fails.
9. A profile uses returned DEM samples only.
10. Nile reference elevations are fetched, not hardcoded.
11. Web production build passes TypeScript.
12. Worker tests pass.
13. Ruff, MyPy, Pytest and project CI stay green.

Do not merge with red CI.

---

# Deployment verification

After implementation:

1. Run full CI.
2. Verify the PR head SHA.
3. Do not claim production is updated while PR #195 is still open/unmerged.
4. After merge, verify GitHub Pages deployed the exact merged revision.
5. Perform a production smoke test on the real public URL:
   - open AI Research,
   - confirm globe is visible immediately,
   - confirm chat is visible immediately,
   - search `Nil`,
   - confirm place marker/local map/terrain lab,
   - add 3 Nile reference flags,
   - fetch DEM heights,
   - draw a line and generate 20-point profile,
   - send a chat message using Terra,
   - verify Luna/Terra/Sol model switching,
   - attach one image,
   - generate a report.

If any of those fails, fix it before calling the work complete.

## Final delivery

Commit the fixes to the existing PR #195 branch, update the PR description with actual tested behavior, and report exact CI/deployment status. Do not invent a successful production deployment if the PR has not actually been merged and Pages has not actually published the merged SHA.
