# Terra Observation System

**BUILD FOR GOOD — open, evidence-first Earth and space observation for environmental research, education and community resilience.**

Terra Observation System combines official public satellite/scientific data, reproducible analysis, an interactive 3D Earth, environmental hazard monitoring and research stations. OpenAI is used only as an evidence-explanation layer over already computed results — never as a replacement for observations or measurements.

## Live demo and public repository

- **Live application:** <https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/>
- **Public GitHub repository:** <https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis>

## BUILD FOR GOOD submission summary

Terra Observation System helps people inspect environmental change and scientific observations using official, legal and publicly available sources. The project brings Earth-observation data, hazards, polar astronomy, water/climate research and reproducible evidence into one public interface. Codex has been used throughout repository-level development, while the OpenAI Responses API provides a small, guarded **Evidence / Research Explainer** that translates validated findings into clear public-language explanations without inventing data.

## What we built

A working research and monitoring platform that includes:

- an interactive 3D Earth and Solar System visualization;
- NASA JPL Horizons-based Sun/Moon and polar geometry;
- current environmental-event geometry from official public catalogues such as NASA EONET;
- NASA FIRMS integration for active-fire detections when an authorized MAP_KEY is available;
- water, river, terrain and environmental-change research workflows;
- Research Stations for Arctic 90°N, Sahara, Oceans and Earth–Space 512;
- reproducible data manifests, hashes, timestamps and evidence classes;
- local/GPU research tooling with automatic device detection;
- an OpenAI-powered Evidence / Research Explainer for already computed findings;
- privacy safeguards and no person tracking.

The scientific source of truth remains official/public observation data and deterministic processing. AI output is advisory explanation, not observation data.

## Who it helps

The project is designed for:

- **communities** that want understandable information about environmental change and hazards;
- **educators and students** learning Earth observation, astronomy, climate, hydrology and scientific uncertainty;
- **researchers and citizen scientists** who need reproducible source provenance and transparent derived values;
- **NGOs and environmental organizations** reviewing water, land, fire, flood and climate-related evidence;
- **environmental and emergency-response professionals** who need rapid context from official public data sources;
- **open-source developers** building transparent tools for the common good.

The application is research and educational software. It does not replace instructions from emergency services or authoritative operational alert systems.

## How it will be used — and how it is already used

Users can open the public GitHub Pages application to inspect the 3D Earth, current hazard/event layers, research stations, experiment results and source metadata. Reproducible workflows can compare selected areas across time, including water-surface change, shoreline change, river morphology, exposed beds, terrain/hydrology candidates and other documented Earth-observation analyses.

A typical evidence workflow is:

1. select or load an area of interest;
2. retrieve or use cached observations from official/public sources;
3. compute deterministic metrics and preserve acquisition/source metadata;
4. label the result as `OBSERVATION`, `DERIVED_VALUE`, `MODEL_ESTIMATE`, `HYPOTHESIS` or `UNKNOWN`;
5. review uncertainty and scientific limitations;
6. optionally pass that already computed evidence JSON to the OpenAI Evidence Explainer for a plain-language summary;
7. keep the original measurements, sources and limitations visible so the explanation can be checked.

The system deliberately does **not** convert a visually suspected river constriction into a confirmed causal claim. Satellite morphology can nominate a `flow_connectivity_candidate` or `possible_constriction`; proving cause requires independent hydrological evidence.

## How Codex helped

Codex has been used as a repository-level engineering tool throughout development for:

- codebase inspection and architecture work;
- refactoring and modularization;
- test generation and regression protection;
- CI and GitHub Actions work;
- 3D globe/rendering fixes and implementation briefs;
- scientific guardrails and provenance checks;
- BUILD FOR GOOD audit and submission preparation.

The repository contains concrete Codex development artifacts rather than only a claim of usage:

- [`CODEX_BUILD_FOR_GOOD_UI_L4.md`](CODEX_BUILD_FOR_GOOD_UI_L4.md) — the main BUILD FOR GOOD implementation brief;
- [`scripts/start_build_for_good.ps1`](scripts/start_build_for_good.ps1) — a launcher that checks for Codex CLI and runs `codex exec` against the repository brief before validation;
- [`CODEX_BUILD_FOR_GOOD_SUBMISSION_READY.md`](CODEX_BUILD_FOR_GOOD_SUBMISSION_READY.md) — the final submission-ready Codex brief;
- merged BUILD FOR GOOD development history, including the English UI / AI Area Lab / Earth–Space 512 implementation work.

Every Codex-assisted change is still expected to pass the same repository quality gates as manually written code.

## How the OpenAI API adds value

The project includes a deliberately small OpenAI integration in [`terra_research_node/openai_summary.py`](terra_research_node/openai_summary.py).

The **Evidence / Research Explainer** uses the OpenAI Responses API only after the scientific pipeline has already produced a JSON finding. It is designed to return four human-readable fields:

- `summary`
- `why_it_matters`
- `uncertainty`
- `next_checks`

Guardrails:

- OpenAI does **not** generate satellite measurements;
- OpenAI does **not** invent dates, source URLs, acquisition IDs or missing observations;
- OpenAI does **not** promote a hypothesis/candidate into a confirmed cause;
- the original evidence class is preserved;
- deterministic results remain available if OpenAI is disabled;
- if `OPENAI_API_KEY` is missing, the explainer fails clearly instead of producing a fake AI result.

The default model is `gpt-5.6-luna` for a small, cost-conscious explanation task and can be changed with `OPENAI_MODEL`.

Example local/server-side use:

```bash
export OPENAI_API_KEY="your-key-from-your-secure-environment"
python -m terra_research_node.openai_summary path/to/finding.json --output explanation.json
```

**Never put `OPENAI_API_KEY` in the public GitHub Pages frontend.**

## Security and privacy

- `.env` is ignored by Git;
- OpenAI and other private API credentials are read from the environment or authorized secret stores only;
- no API key belongs in browser JavaScript, public JSON, screenshots or committed logs;
- the platform does not perform person tracking or private-data enrichment;
- public Earth-observation work uses legal, official and publicly available sources;
- test code uses fake test credentials only.

## How to run the project

### Python research environment

Python 3.12:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Generate polar Sun/Moon observations:

```bash
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

Run the optional OpenAI Evidence Explainer:

```bash
export OPENAI_API_KEY="your-key-from-your-secure-environment"
python -m terra_research_node.openai_summary path/to/finding.json
```

### Web application

```bash
cd web
npm install
npm run dev
```

## Corrected Horizons methodology

The previous implementation could not retrieve live observations. It sent unquoted date-time
parameters and requested `QUANTITIES='4'` while trying to read declination. In Horizons observer
tables:

- quantity `1` is astrometric right ascension and declination;
- quantity `2` is apparent right ascension and declination;
- quantity `4` is apparent azimuth and elevation;
- quantity `7` is local apparent sidereal time;
- quantities `8` and `9` provide airmass/extinction and visual magnitude/surface brightness;
- quantity `13` is angular diameter;
- quantities `20` and `21` provide observer range/range-rate and one-way light-time;
- quantities `23` and `24` provide elongation and phase angle;
- quantity `29` is constellation;
- quantity `42` is local apparent hour angle;
- quantity `45` is inertial apparent RA/DEC;
- quantity `47` is sky motion;
- quantity `49` is DUT1.

The equinox finder still uses `QUANTITIES='2'` for the geocentric Sun zero crossing. Polar
observations use the expanded set
`1,2,4,7,8,9,13,20,21,23,24,29,42,45,47,49`, decimal-degree angles, calendar and Julian dates,
extra precision and airless topocentric coordinates. Optional values returned by Horizons as
`n.a.` are stored as null; required altitude and declination values are never fabricated.

All string and time parameters are quoted as required by the Horizons batch interface. CSV
parsing uses Python's `csv` module and tests contain a small response excerpt captured from the
real API.

Official documentation:

- <https://ssd-api.jpl.nasa.gov/doc/horizons.html>
- <https://ssd.jpl.nasa.gov/horizons/manual.html>
- manual verification interface: <https://ssd.jpl.nasa.gov/horizons/app.html#/>

Exact geodetic latitudes `+90°` and `-90°` were verified against the live API and are accepted.
The pipeline uses airless apparent coordinates, so it does not invent local polar weather for an
atmospheric-refraction correction.

## Automatic and manual verification

Automatic collection uses the official GET API. A response downloaded manually from the Horizons
web application can be parsed with `HorizonsClient.parse_observer_response(text)`. Both paths use
the same response validation and field mapping, making individual observations easy to verify
without maintaining two scientific pipelines.

## Reproducible archive

Every run keeps both the untouched NASA response and normalized observations:

```text
outputs/archive/
├── raw/
│   ├── north-pole/
│   │   ├── sun.txt
│   │   ├── sun.metadata.json
│   │   ├── moon.txt
│   │   └── moon.metadata.json
│   └── south-pole/
└── processed/
    └── 2006/
        ├── spring/
        │   ├── north-pole/sun.json
        │   ├── north-pole/moon.json
        │   ├── south-pole/sun.json
        │   └── south-pole/moon.json
        └── autumn/
```

Raw metadata contains the exact request parameters, retrieval time, cache key, response SHA-256,
API version, execution time and source URL. Processed records retain those provenance fields plus
observer coordinates, reference-frame notes and quality flags.

## Verified archive

The committed web dataset contains 152 genuine records for 2006–2024:

`19 years × 2 equinoxes × 2 poles × 2 bodies = 152 observations`

Each observation contains its UTC time, source, response SHA-256, Horizons API version, actual
observer latitude and a quality flag. The equinox zero crossing is derived from a 30-minute
Horizons declination series and interpolated between the two adjacent samples that bracket zero.

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
python -m mypy polar_equinox_analysis terra_hazards terra_research_node tests
python -m pytest -q
cd web && npm test && npm run build
```

## License

MIT. Individual upstream datasets retain their own agency terms and attribution requirements.
