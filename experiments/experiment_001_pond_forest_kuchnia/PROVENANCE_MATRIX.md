# Experiment 001 — provenance and independence matrix

This matrix prevents the project from confusing a second download path with a second Earth observation.

| Evidence ID | Agency / provider family | Mission / sensor | Period used or searched | Physics | Current status | Independent observation? |
|---|---|---|---|---|---|---|
| E1-optical-historic | NASA/USGS | Landsat 5 TM, Landsat 7 ETM+, Landsat 8 OLI | 1990–2018+ depending selected year | optical multispectral (+ PAN where applicable for display) | real imagery in primary/corrected seasonal sets | yes relative to Sentinel missions |
| E1-optical-modern | ESA/Copernicus | Sentinel-2 MSI | 2015/2016–2026 depending season | optical multispectral | real imagery in primary/corrected seasonal sets | yes relative to Landsat |
| E1-alt-delivery | USGS/NASA + ESA/Copernicus delivered via Google Cloud / Element 84 | mostly the same Landsat/Sentinel acquisitions as above | 1990–2025 | optical | useful delivery/processing cross-check; known package errors archived | **not independent when acquisition ID/date is the same** |
| E1-radar-c | ESA/Copernicus | Sentinel-1 RTC VV/VH | 2015–2025 May | C-band SAR | real radar evidence; small pond exact area often low-confidence | yes; different measurement physics |
| E1-source4-nasa | NASA/METI/Japan Space Systems ASTER science program via NASA Earthdata LP DAAC | ASTER on Terra | CMR AOI catalog searched 2000–2026 | optical/IR instrument independent of Landsat/Sentinel | 77 spring/autumn catalog hits; pixels not yet admitted | independent once exact downloaded granules pass integrity gate |
| E1-source4-jaxa | JAXA / METI where applicable | ALOS AVNIR-2 / PALSAR | 2006-05-15–2011-04-13 official provision window | optical + L-band SAR | candidate; G-Portal account required for download workflow | independent once exact AOI product is retrieved |
| E1-source4-cnsa | CNSA | Gaofen-1 / Gaofen-6 and other suitable civil Gaofen products | modern era | optical, some Gaofen missions also SAR | candidate only; exact Poland AOI product/access not yet verified | not counted yet |
| E1-source4-roscosmos | Roscosmos / Russian federal EO data holdings | candidate Resurs-P / Kanopus-V or other official civil EO product | modern era | optical depending product | candidate only; exact public/legal Poland AOI product not yet verified | not counted yet |
| weather-context | EUMETSAT / NOAA / JMA / NASA | Meteosat, GOES, Himawari, GIBS products, DSCOVR EPIC | current/near-real-time depending source | atmosphere/whole-disc/context products | contextual only for Experiment 001 | not used for hectare-scale pond area unless a specific layer has adequate native resolution |

## Admission rule

A source does not become quantitative evidence because it comes from a different website or agency name. An admitted observation must keep:

- exact acquisition date/time;
- mission/sensor;
- official product/granule ID;
- official catalog/provider;
- native spatial resolution;
- processing level;
- AOI intersection/crop proof;
- local quality metrics;
- SHA-256;
- no cross-year duplicate conflict;
- independent-observation flag.

## Current interpretation

The strongest genuinely independent sensor families currently in the experiment are:

1. Landsat optical;
2. Sentinel-2 optical;
3. Sentinel-1 C-band radar;
4. ASTER is the preferred next optical source once its actual official granule pixels are admitted.

ALOS is an additional highly useful optical/L-band radar candidate for the 2006–2011 period.
