# Data sources

The machine-readable registry is `terra_hazards/data_sources.json` and is displayed directly in the
web application. It records agency, mission, instrument, purpose, temporal coverage, latency,
resolution, access requirements and limitations.

The first working vertical slice uses:

- NASA JPL Horizons for polar observables and Solar System state vectors;
- NASA EONET for current, curated natural-event geometries;
- an optional NASA FIRMS adapter for VIIRS/MODIS active-fire detections.

The registry documents integration targets for Sentinel-1 SAR, Sentinel-3 SLSTR, SWOT, SMAP,
GRACE/GRACE-FO and NOAA multibeam bathymetry. A catalogue entry is not a false claim that every
pixel product has already been downloaded. The UI separates live adapters from documented next
adapters.

Large satellite rasters must not be committed to Git. Store only compact derived GeoJSON/JSON,
provenance, checksums and quality metadata. Use a cache, workflow artifact or configured object
store for raw scenes.

Chinese Gaofen/Fengyun sources can be added through the same adapter boundary after official API
access, licensing and repeatable authentication are confirmed. They are intentionally not a
mandatory dependency for the open first run.
