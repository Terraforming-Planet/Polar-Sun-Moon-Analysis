# Scientific Documentation

## Established Astronomical Facts
Equinoxes occur when the Sun's apparent geocentric declination crosses near zero. Apparent altitude above a local horizon depends on observer location, timestamp, and the ephemeris geometry returned by NASA JPL Horizons.

## Scientific Observation
This software observes only the seasonal apparent altitude and declination of the Sun and Moon at the North and South Poles during Earth's equinoxes from 2006 through 2024.

## Research Question
What yearly and long-term patterns are present in validated NASA JPL Horizons apparent altitude and declination values at polar equinox observations?

## Research Hypothesis
Hypotheses, if any, are external interpretations. The software does not prove hypotheses and reports only derived observations and statistics.

## Methodology
NASA API → Validation → Cache → Raw Data Archive → Cleaning → Quality Control → Statistical Analysis → Figures → Report → Website.

## NASA Data
Only the official NASA JPL Horizons API is used. Missing required quantities stop processing and raw responses are retained.

## Results
Results are generated in `results/` after the pipeline is run.

## Limitations
Conclusions are limited to the analyzed Horizons responses, selected years, equinox windows, quantities, and locations.

## Future Work
The architecture supports additional dates, observatories, bodies, and statistical methods without major refactoring.
