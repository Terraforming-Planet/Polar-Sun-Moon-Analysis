# Multi-angle Earth observation and investigation support

## Implemented

- Browser-based STAC search against the current Copernicus Data Space endpoint: `https://stac.dataspace.copernicus.eu/v1/search`.
- Point search across Sentinel-1 and Sentinel-2 collections.
- Original product identifiers, acquisition UTC, platform, instrument, orbit, cloud cover and published viewing/solar angle properties.
- Explicit `NoData` behaviour for metadata that the source does not publish.
- Before/after geospatial evidence packages for environmental and terrain-change investigations.
- Links to original STAC assets rather than generated replacement imagery.

## Polar imagery rule

A radial polar mosaic must not be presented as one simultaneous original image. Future polar rendering should select original scene footprints and acquisition times. Where no valid scene covers a pixel, scientific mode must show `NoData`. Visual blending may only be offered as a separately labelled reconstruction.

## Investigation boundary

This project may support analysis of observable changes such as illegal logging, mining, oil spills, fire origin areas, flood damage, illegal construction and landscape change.

It must not:

- identify or rank individual people;
- perform face recognition;
- track a person or private vehicle;
- infer that a named person committed a crime;
- present satellite imagery as proof of murder, theft or guilt;
- fabricate missing evidence.

Typical public Earth-observation imagery cannot reliably detect murder or ordinary theft. Any geospatial finding must retain its source, product ID, timestamp, processing level, footprint and uncertainty and must be independently verified by authorized investigators.

## Next steps

1. Add NASA CMR-STAC, Landsat, Digital Earth Australia and INPE adapters behind a common provider interface.
2. Add footprint visualization and side-by-side image previews where public browse assets permit it.
3. Add server-side caching to avoid browser CORS and catalogue-rate limitations.
4. Implement deterministic change metrics for vegetation, water, burn scars and terrain while preserving source provenance.
5. Add TP-26 sector assignment based on observation geometry rather than inventing camera angles.