# Near-real-time Earth monitoring architecture

## Goal

Build an interactive Earth observation view that refreshes the user's location and the application clock every 1–3 seconds, while displaying the newest legally available satellite or aerial imagery for the selected place.

## Important limitation

A 1–3 second refresh interval is achievable for the web interface, browser geolocation, telemetry, alerts, and already-available map tiles. It is not achievable for new high-resolution satellite photographs of every point on Earth. Satellite acquisition depends on orbit, coverage, clouds, provider tasking, ground-station delivery, processing, licensing, and publication delay.

The interface must therefore show two separate timestamps:

- `UI updated at` — target interval: 1–3 seconds.
- `Imagery captured at` — actual acquisition time supplied by the provider.

The application must never label archived or delayed imagery as live.

## Proposed source synchronization

Use a provider-adapter architecture that chooses the freshest suitable observation for the current location.

### Open and public sources

- Copernicus Sentinel-1: radar observations through clouds and at night.
- Copernicus Sentinel-2: optical multispectral imagery.
- Copernicus Sentinel-3: lower-resolution environmental and thermal observations.
- NOAA GOES: rapid weather imagery for the Americas.
- JMA Himawari: rapid weather imagery for Asia and the Pacific.
- NASA/USGS Landsat: long-term optical Earth observation.

### Optional commercial sources

- Planet SkySat / PlanetScope.
- Maxar WorldView.
- Airbus Pléiades Neo and SPOT.
- ICEYE radar.
- Capella radar.
- Satellogic.
- Chinese commercial providers where lawful APIs and licences are available.

Commercial imagery must be enabled only through user-supplied credentials and valid licences.

## Architecture

1. Browser obtains the user's position with `navigator.geolocation.watchPosition`.
2. The UI updates position, heading, accuracy, and clock every 1–3 seconds.
3. A backend observation broker queries configured providers for the selected bounding box.
4. Every observation is normalized to a shared metadata model:
   - provider
   - platform
   - sensor
   - acquisition timestamp
   - publication timestamp
   - spatial resolution
   - cloud cover
   - licence
   - tile or asset URL
5. The broker ranks observations by freshness, resolution, cloud cover, sensor suitability, and licence.
6. The map displays the best available layer and clearly shows its true age.
7. WebSocket or Server-Sent Events can push newly published observations and hazard alerts to the browser.

## Freshness classes

- `LIVE TELEMETRY`: browser/device data updated within 3 seconds.
- `RAPID`: provider observation or derived product updated within 15 minutes.
- `NEAR REAL TIME`: updated within 3 hours.
- `RECENT`: updated within 72 hours.
- `ARCHIVE`: older than 72 hours.

These labels describe data age and must not be inferred from the page refresh rate.

## First implementation stage

- Add an interactive map with smooth zoom and pan.
- Add a `Locate me` control using browser GPS.
- Refresh the location marker and telemetry every 1–3 seconds.
- Add visible `Captured`, `Published`, and `Age` fields for every satellite layer.
- Connect the existing Copernicus catalogue as the first provider.
- Select the newest Sentinel-1 or Sentinel-2 scene covering the current viewport.
- Add a timeline for switching between acquisitions.
- Add a provider status panel and clear errors when no recent image exists.

## Second implementation stage

- Add GOES and Himawari rapid weather layers.
- Add radar/optical fusion.
- Add cloud filtering and automatic provider selection.
- Add optional commercial provider adapters.
- Add WebSocket or Server-Sent Events notifications.

## Acceptance criteria

- Map interactions remain responsive on mobile and desktop.
- The location marker refreshes at a configurable 1–3 second interval when permission is granted.
- Every imagery layer displays its real acquisition time and source.
- No delayed satellite image is described as real-time.
- The newest compatible observation can be selected automatically.
- Missing credentials or unavailable providers do not break the application.
- Public deployments do not expose provider secrets in browser code or repository files.

## Security and privacy

- Location remains in the browser unless the user explicitly enables server-side monitoring.
- OAuth secrets and commercial API keys remain server-side or in GitHub Actions secrets.
- The application must not publish a user's precise live location by default.

## Definition of success

The system will provide a live 1–3 second user-location and interface experience, synchronized with the freshest available Earth-observation data. It will not claim impossible continuous high-resolution satellite video of every location on Earth.