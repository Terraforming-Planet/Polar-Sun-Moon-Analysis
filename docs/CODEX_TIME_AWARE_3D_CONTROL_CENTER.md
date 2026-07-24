# Codex implementation task: time-aware 3D Earth–Sun–Moon control center

Implement this task completely on branch `feature/time-aware-3d-control-center`. Do not replace verified scientific data with invented values. Open a pull request to `main` only after the build, tests and local preview pass.

## Product goal

Turn the current static Terra Observation interface into a time-aware environmental control center with honest data provenance. The application must let a user select a date/time, move backward and forward through available observations, switch to the latest available observation, and inspect Earth hazards and polar Sun/Moon geometry in 3D.

## Required interface

1. Add a global time controller visible in the main application:
   - UTC date and time input;
   - `TERAZ / najnowsze dane` button;
   - previous and next available observation buttons;
   - play/pause;
   - playback speed: hour, day, month and year steps;
   - visible earliest and latest available timestamps;
   - explicit status distinguishing `requested time`, `nearest available observation` and `data age`.

2. Add top-level sections:
   - Centrum sterowania;
   - Ziemia 3D;
   - Powodzie;
   - Pożary;
   - Woda i susza;
   - Biegun północny;
   - Biegun południowy;
   - Słońce i Księżyc;
   - Dane i źródła.

3. Earth 3D view:
   - keep Three.js and OrbitControls;
   - render a rotatable globe;
   - show actual event geometry from committed NASA EONET data;
   - add layer controls and clear timestamps;
   - provide direct links to the existing Sentinel-1 flood map and Copernicus results dashboard;
   - never present EONET catalogue points as measured severity.

4. Polar Sun/Moon observatory:
   - use committed NASA JPL observation rows;
   - allow North/South Pole, Sun/Moon, year and season selection;
   - include March equinox, June solstice, September equinox and December solstice shortcuts where data exist;
   - display timestamp UTC, altitude, declination and evidence/source status;
   - render a 3D Earth with axis, observer marker, horizon plane and direction vectors for Sun and Moon;
   - if a requested timestamp is not present, select the nearest committed observation and state the time difference.

5. Solar-system time handling:
   - do not pretend the single current `solar-system.json` snapshot is a historical ephemeris;
   - either generate a real multi-epoch JPL timeline in the Python pipeline or clearly lock the solar-system positions to the timestamp contained in the file;
   - preferred implementation: add a Python command that produces `web/public/data/solar-system-timeline.json` for selected timestamps using the existing JPL adapter, with source URL and generated timestamp for every epoch.

6. Hazard evidence and severity:
   - show measurable evidence separately: affected candidate area, observation age, available scene count, radar-change statistics, active fire pixel counts or FRP only when these values exist;
   - do not invent low/medium/high severity;
   - every panel must display evidence class: observation, derived value, estimate, hypothesis or unknown.

7. Mobile usability:
   - controls must fit a phone screen;
   - horizontal navigation may scroll;
   - 3D canvases must have a stable minimum height and no clipped controls;
   - use touch-friendly buttons.

## Data availability panel

Create a visible panel listing the actual ranges represented by committed files. At minimum:

- polar JPL observations currently committed: 2006–2024;
- current solar-system snapshot timestamp from `solar-system.json`;
- current NASA EONET generated timestamp;
- Copernicus catalogue run start/end dates from the published JSON;
- Sentinel-1 flood before/after periods from `run_metadata.json` or `map-data.json`.

Do not claim real-time satellite imagery. Use wording such as `latest published observation` unless the data source is actually refreshed live.

## Engineering requirements

- React + TypeScript, no new framework;
- keep Three.js;
- reusable `TimeController`, `DataAvailability`, `EvidenceBadge` and 3D observatory components;
- preserve `import.meta.env.BASE_URL` for GitHub Pages;
- no hard-coded root URLs that break project Pages paths;
- retain current Copernicus navigation and public routes;
- update CSS for desktop and mobile;
- update tests;
- add accessibility labels and keyboard controls;
- no secrets or tokens in the repository.

## Required tests and validation

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

Also preview the build and verify HTTP 200 for:

- main application;
- `/copernicus/`;
- `/flood-map/`;
- JSON data used by the new controls.

## Pull-request acceptance criteria

The PR description must include:

- screenshots for mobile and desktop;
- exact available date ranges;
- which views are historical, latest-published or real-time;
- data sources used by every view;
- scientific limitations;
- test output.

Do not merge placeholder controls that change labels without changing the selected observation. A time control is valid only when the visualisation or displayed evidence actually follows the selected available timestamp.