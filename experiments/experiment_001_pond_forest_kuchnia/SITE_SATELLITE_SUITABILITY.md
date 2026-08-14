# Experiment 001 — suitability of satellite sources already planned on the project site

The existing near-real-time site contract lists these official imagery families:

- EUMETSAT Meteosat Third Generation / Meteosat-12 FCI
- NOAA GOES-East / GOES-West ABI
- JMA Himawari-8/9 AHI
- NASA GIBS / Worldview
- optional NASA DSCOVR EPIC

Source: `docs/CODEX_NEAR_REAL_TIME_SATELLITE_EARTH.md` in this repository.

## Suitability for Evidence 001

The disappearing forest pond is a hectare-scale feature. For its final area measurement, imagery must resolve shoreline changes at tens-of-metres scale or better.

| Source | Good use in Experiment 001 | Use for exact pond area? |
|---|---|---|
| Meteosat-12 FCI | cloud systems, weather context, timing of fronts | **No** — too coarse for a ~2.5 ha pond |
| GOES ABI | large-scale atmosphere/cloud context | **No** — Poland is outside the optimal/local detailed use case and spatial resolution is far too coarse |
| Himawari AHI | Asia-Pacific atmospheric context | **No** for this Poland AOI |
| NASA GIBS / Worldview | official contextual layers, precipitation/snow/fire/environment products depending layer | **Only when the selected GIBS layer has sufficient native spatial resolution and independent sensor provenance; otherwise contextual only** |
| DSCOVR EPIC | whole-disc Earth context | **No** — not a local shoreline measurement source |

## Fourth-source decision

For the quantitative forest-pond cross-check, the preferred candidates remain:

1. **NASA ASTER / Terra** — separate optical instrument, VNIR 15 m class; official Earthdata catalog has many AOI scene hits.
2. **JAXA ALOS AVNIR-2 / PALSAR** — separate optical and L-band radar measurements for 2006–2011, with official open/free products requiring G-Portal access.
3. **CNSA Gaofen** — modern independent candidate only after exact official AOI product access is verified.
4. **Roscosmos governmental EO products** — candidate only after an exact official public/legal Poland AOI product can be traced and downloaded.

The site geostationary/whole-disc sources are valuable for **meteorological context** around unusual water years, but they must not be used to manufacture confidence in a hectare-scale area measurement they cannot spatially resolve.
