# API Documentation

Primary classes:

- `PipelineConfig`: reproducible runtime configuration.
- `HorizonsClient`: official NASA JPL Horizons API client with retry and permanent cache.
- `EquinoxFinder`: derives equinox instants from Horizons Sun declination zero crossings.
- `PolarEquinoxPipeline`: orchestrates download, validation, analysis, reporting, plots, and website generation.
