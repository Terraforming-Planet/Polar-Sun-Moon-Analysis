# Experiment 001 — Fourth-source candidate registry

This file records independent satellite families considered for cross-checking Evidence 001. A source is admitted only with official/public provenance and useful AOI coverage.

## NASA ASTER — selected fourth sensor source from 2000 onward

NASA Earthdata LP DAAC archives ASTER products from the ASTER instrument aboard Terra. NASA CMR lists the ASTER Level 1 Precision Terrain Corrected Registered At-Sensor Radiance product **AST_L1T V004**.

The automated Experiment 001 CMR query has now succeeded for AOI **53.591400, 19.010717** and produced a reproducible local catalog:

`source4/nasa_aster/nasa_aster_scene_catalog.json`

Catalog status on 2026-08-14:
- **77** total CMR granule hits across the defined spring/autumn query windows;
- spring scene coverage in 2002, 2003, 2006, 2008, 2010, 2011, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2024, 2025, 2026;
- autumn scene coverage in 2001, 2002, 2003, 2004, 2005, 2008, 2009, 2010, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025.

ASTER has no normal blue VNIR band, therefore any VNIR visualization used here must be labelled correctly (for example false-color) rather than presented as true RGB.

Official:
- https://www.earthdata.nasa.gov/centers/lp-daac
- https://cmr.earthdata.nasa.gov/search/site/collections/directory/LPCLOUD/gov.nasa.eosdis

**Experiment status:** source #4 catalog is verified. Individual ASTER scenes are **not yet admitted as environmental evidence** until the official pixels are downloaded and pass crop/AOI, acquisition date, product ID, resolution, visual integrity, cloud/valid-pixel and SHA-256 checks.

## JAXA ALOS — supplementary candidate for 2006–2011

JAXA G-Portal documents ALOS availability from 2006-05-15 to 2011-04-13 and lists ALOS AVNIR-2 and PALSAR among ALOS-series products. G-Portal access requirements apply to product retrieval.

Official:
- https://gportal.jaxa.jp/gpr/information/product?lang=en
- https://gportal.jaxa.jp/gpr/search?lang=en
- https://www.eorc.jaxa.jp/ALOS/en/dataset/alos_open_and_free_e.htm

Experiment status: catalog/provenance candidate accepted; imagery not yet admitted because exact AOI products still need retrieval and QA.

## CNSA Gaofen — promising modern candidate

CNSA documents a global sharing platform for Gaofen data and public international access to some Gaofen products.

Official:
- https://www.cnsa.gov.cn/english/n6465652/n6465653/c6808065/content.html
- https://www.cnsa.gov.cn/n6758824/n6759008/n6759012/c6794271/content.html

Experiment status: **candidate only** until exact Poland AOI products, acquisition dates, sensor/product identifiers, current legal access path and usable pixels are verified. No CNSA record is counted merely to reach four agencies.

## Roscosmos / Russian federal Earth-observation holdings

Roscosmos documents use and provision of governmental Earth remote-sensing data through the federal remote-sensing data fund. Potential relevant missions may include Kanopus-V / Resurs-P if exact public Poland coverage can be traced.

Official:
- https://www.roscosmos.ru/39803/

Experiment status: **candidate only**; no imagery is admitted without direct official product/date/provenance verification and a reproducible public access path.

## Relationship to the Arctic 90°N module

The project page `docs/arctic-90n/` names CryoSat, ICESat-2, Sentinel and SMOS for polar validation. These missions are useful for the Arctic research module, but they are not automatically treated as a better fourth source for this small 2 km forest-pond case. Source selection is made per scientific question and spatial scale.

## Admission gate

Every fourth-source observation must provide mission/sensor, exact date/time, official product ID, official catalog/provider, native resolution, processing level, AOI intersection, legal/public access path, SHA-256, and a no-cross-year-duplicate result.

Different delivery servers for the same underlying acquisition do not count as independent observations of Earth.
