# Polar Sun Moon Analysis

Production-quality Python 3.12 scientific package for observing the **seasonal apparent altitude of the Sun and Moon above the local horizon during Earth's equinoxes** at the North and South Poles.

## Scientific scope

This project uses **only official NASA JPL Horizons ephemerides** from <https://ssd.jpl.nasa.gov/api/horizons.api>. It is not a lunar phase, lunar illumination, eclipse, monthly orbit, machine-learning, image-processing, or general celestial-mechanics project.

The software performs observations only. It does **not** prove hypotheses; conclusions are limited to computed and validated NASA JPL Horizons ephemerides.

## Observation plan

For every vernal and autumnal equinox from 2006 through 2024, the pipeline records the exact equinox time and computes, for both the North Pole and South Pole:

- Sun apparent altitude
- Moon apparent altitude
- Sun declination
- Moon declination

Equinox instants are generated from Horizons apparent geocentric Sun declination zero crossings.

## Data pipeline

NASA API → Validation → Permanent Cache → Raw Data Archive → Cleaning → Quality Control → Statistical Analysis → Figures → Report → Website

Every request stores URL, parameters, timestamp, response code, execution time, and the raw response. Cached responses are never downloaded twice unless `--force-download` is supplied.

## Outputs

Generated files are written under `results/` by default:

- CSV, Excel, JSON, Markdown, HTML, and PDF reports
- PNG and SVG static figures
- Quality-control report
- GitHub Pages website in `website/`

## Installation

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## CLI quick start

```bash
python main.py download
python main.py analyze
python main.py plots
python main.py report
python main.py website
python main.py validate
```

Or run the complete workflow:

```bash
python -m polar_equinox_analysis all --start-year 2006 --end-year 2024 --output-dir results --cache-dir cache/horizons
```

## Project architecture

- `polar_equinox_analysis.config`: dataclass configuration.
- `polar_equinox_analysis.models`: typed domain dataclasses.
- `polar_equinox_analysis.horizons`: official Horizons client, retry, cache, metadata, raw validation.
- `polar_equinox_analysis.equinox`: equinox generation from Horizons Sun declination zero crossings.
- `polar_equinox_analysis.validation`: quality control for required columns, ranges, duplicates, and timestamps.
- `polar_equinox_analysis.analysis`: descriptive statistics, regression, rolling statistics, correlations, confidence intervals, and amplitudes.
- `polar_equinox_analysis.reporting`: tables, figures, Markdown, PDF, HTML, and website exports.
- `polar_equinox_analysis.pipeline`: dependency-injected orchestration.
- `main.py` and `polar_equinox_analysis.__main__`: CLI entry points.

## Scientific methodology

Established astronomical facts, research questions, methodology, limitations, and future work are documented in `docs/scientific_documentation.md`. Example files in `example_data/` are clearly labeled **EXAMPLE DATA ONLY - NOT NASA OBSERVATIONS**.

## FAQ

**Does the project fabricate astronomical quantities?** No. Required quantities must come from NASA JPL Horizons, or processing stops.

**Does the project prove a hypothesis?** No. It provides validated observations and derived statistics only.

**Can it be extended?** Yes. Configuration and object-oriented pipeline components are prepared for additional dates, observatories, bodies, and statistical methods.

## License

MIT License. See `LICENSE`.
