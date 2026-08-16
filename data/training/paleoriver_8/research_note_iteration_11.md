# Sahara Station — research note, iteration 11

## Scope

This iteration adds an independent radar observation channel to the existing eight-case optical + DEM hydrology screening. The radar source is the official NASA OPERA Level-2 Radiometric Terrain Corrected Sentinel-1 product (RTC-S1) exposed through NASA Earthdata ImageServer. The first integrated polarization is VV.

## Observation layer

For each of the eight test areas the browser queries the NASA ImageServer for the latest OPERA RTC-S1 raster intersecting the test center. The selected raster name, acquisition start/end, polarization and product links are preserved in the exported record. A rendered dB-stretched preview is displayed next to the existing optical/DEM analysis.

OPERA RTC-S1 coverage starts in October 2023. Several optical examples in the eight-case set are older than that. The runtime therefore does **not** claim temporal coincidence: it records the real SAR acquisition date separately instead of copying the optical date into the SAR fields.

## Training feature added

The runtime may compute mean and standard deviation of luminance from the rendered preview PNG. These values are explicitly named `sar_preview_mean_luma` and `sar_preview_std_luma` and tagged as `rendered-preview-intensity-not-calibrated-backscatter`.

They are display-space screening features only. They are **not** calibrated sigma0/gamma0 backscatter, soil moisture, water probability or channel probability. Calibrated physical SAR features require reading the RTC data values themselves and applying a documented sampling pipeline.

## Reference labels

A new `sar_reference_labels_v1.json` provides one source-backed hydrologic-context label per test. The labels distinguish such contexts as confirmed active river, confirmed paleolake basin, confirmed terminal basin, ephemeral river and ancient water-erosion terrain.

The important negative rule is retained for every case:

`paleochannel_ground_truth = not-labelled`

No official narrative page is converted into a pixel mask and no context label is silently transformed into `paleoriver=true/false`.

## Current scientific conclusion

Adding Sentinel-1 RTC creates a genuinely independent measurement channel alongside optical RGB and DEM-derived routing. Agreement between an optical linear structure, topographic drainage and a SAR contrast can increase the priority of a candidate for manual review, but it still does not establish that the structure is a paleoriver.

The strongest next step is to create independently verified channel masks or vector references for a subset of the eight cases and then sample calibrated RTC-S1 backscatter along candidate channels and matched control terrain. Only after that should precision/recall or supervised paleochannel classification be reported.
