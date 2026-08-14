# Sentinel-1 RTC measurement notes

This package is the third independent sensor check. It uses real ESA/Copernicus Sentinel-1 C-band SAR RTC pixels on a fixed 10 m grid (100 m²/pixel), May 2015-2025, preferred descending relative orbit 124. No generative AI, synthetic filling or AI super-resolution is used.

## Jezioro Kuchnia
The refined series is stable and high-confidence in every year. Treat the reported area as a Sentinel-1 radar open-water **proxy** suitable for trend verification against the optical sources, not as a cadastral or field-survey boundary.

## Staw w lesie
The object is small and surrounded/partly obscured by forest. At 10 m C-band SAR, canopy, wet soil, emergent vegetation and mixed pixels can look radar-dark. Rows marked `classification_anomaly` or `low` confidence must **not** be used as exact pond-area measurements. Even high-confidence rows are retained only as qualitative independent evidence until checked against high-resolution optical imagery.

## Measurement uncertainty
`edge_pixel_uncertainty_m2` is only a pixel-edge discretization indicator. It does not include all SAR classification uncertainty. One 10 m analysis pixel equals 100 m².
