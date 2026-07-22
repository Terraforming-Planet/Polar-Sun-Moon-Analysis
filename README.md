# Terra Observation System

A working, evidence-first platform for polar astronomy, 3D Solar System visualization and
environmental hazard monitoring. The project uses official NASA JPL Horizons ephemerides and
public Earth-observation catalogues without substituting invented measurements.

## Live application

After this branch is merged and GitHub Pages finishes deployment:

<https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/>

The responsive React/Three.js interface contains:

- a professional 3D Solar System positioned from heliocentric NASA JPL vectors;
- polar Sun and Moon charts for the exact North and South Poles;
- current NASA EONET event geometry on an interactive 3D Earth;
- a source registry describing resolution, latency, access and limitations;
- explicit water-in-mountains and seafloor measurement boundaries;
- public privacy safeguards and no person tracking.

## Corrected Horizons methodology

The previous implementation could not retrieve live observations. It sent unquoted date-time
parameters and requested `QUANTITIES='4'` while trying to read declination. In Horizons observer
tables:

- quantity `2` is apparent right ascension and declination;
- quantity `4` is apparent azimuth and elevation;
- quantity `20` is observer range and range rate.

The corrected pipeline uses `QUANTITIES='2'` for the geocentric Sun zero crossing and
`QUANTITIES='2,4'` for polar declination and elevation. All string and time parameters are quoted
as required by the Horizons batch interface. CSV parsing uses Python's `csv` module and tests
contain a small response excerpt captured from the real API.

Official documentation:

- <https://ssd-api.jpl.nasa.gov/doc/horizons.html>
- <https://ssd.jpl.nasa.gov/horizons/manual.html>

Exact geodetic latitudes `+90°` and `-90°` were verified against the live API and are accepted.
The pipeline uses airless apparent coordinates, so it does not invent local polar weather for an
atmospheric-refraction correction.

## Verified archive

The committed web dataset contains 152 genuine records for 2006–2024:

`19 years × 2 equinoxes × 2 poles × 2 bodies = 152 observations`

Each observation contains its UTC time, source, response SHA-256, Horizons API version, actual
observer latitude and a quality flag. The equinox zero crossing is derived from a 30-minute
Horizons declination series and interpolated between the two adjacent samples that bracket zero.

## Install and run

Python 3.12:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m polar_equinox_analysis polar --start-year 2006 --end-year 2024 --include-future
```

Generate a current JPL Solar System snapshot:

```bash
python -m polar_equinox_analysis solar-system --output web/public/data/solar-system.json
```

Refresh the public NASA event catalogue and source registry:

```bash
python -m terra_hazards sources --output web/public/data/sources.json
python -m terra_hazards update --output web/public/data/hazards.json
```

Run the web application:

```bash
cd web
npm install
npm run dev
```

## NASA FIRMS active-fire detections

The FIRMS adapter uses real VIIRS/MODIS detections and never supplies demo hotspots. The official
area API requires a personal MAP_KEY:

```bash
export NASA_FIRMS_MAP_KEY="your-official-key"
```

Without that secret, the public application continues to work with NASA EONET and clearly reports
that pixel-level FIRMS access requires credentials.

## Evidence classes

Environmental results must be labelled as one of:

- `OBSERVATION` — a sensor or official catalogue record;
- `DERIVED_VALUE` — a transparent calculation from observations;
- `MODEL_ESTIMATE` — a model result with assumptions and uncertainty;
- `HYPOTHESIS` — a possible explanation requiring evidence;
- `UNKNOWN` — not measurable from the available inputs.

For example, a lake shrinking from 10 km² to 1 km² is a measured area change of −9 km² or −90%.
Its volume change remains `UNKNOWN` without bathymetry or an area–elevation–volume relationship.

## Scientific and operational limits

- Thermal infrared does not see the surface through opaque cloud; additional camera power does
  not change that. Sentinel-1 SAR is the principal all-weather surface-imaging source.
- GRACE/GRACE-FO estimates regional mass change, not fracture-scale water inside rock.
- Satellites infer broad seafloor structure from sea-surface height and gravity. Detailed direct
  mapping requires multibeam sonar, AUV/ROV systems or related field instruments.
- NASA EONET is an event catalogue, not an official emergency alert system.
- This research application must not replace instructions from emergency services.

See [data sources](docs/data-sources.md), [scientific limits](docs/science-and-limitations.md) and
[privacy](docs/privacy.md).

## Validation

```bash
python -m ruff check .
python -m mypy polar_equinox_analysis terra_hazards tests
python -m pytest -q
cd web && npm test && npm run build
```

## License

MIT. Individual upstream datasets retain their own agency terms and attribution requirements.
