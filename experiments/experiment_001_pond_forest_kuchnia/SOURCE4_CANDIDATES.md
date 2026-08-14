# Experiment 001 — Fourth-source candidate registry

This file records independent satellite families considered for cross-checking Evidence 001. A source is admitted only with official/public provenance and useful AOI coverage.

## JAXA ALOS — selected candidate for 2006–2011

JAXA G-Portal documents ALOS availability from 2006-05-15 to 2011-04-13 and lists ALOS AVNIR-2 and PALSAR among ALOS-series Open and Free Data. G-Portal requires user login for product download.

Official:
- https://gportal.jaxa.jp/gpr/information/product?lang=en
- https://gportal.jaxa.jp/gpr/search?lang=en
- https://www.eorc.jaxa.jp/ALOS/en/dataset/alos_open_and_free_e.htm

Experiment status: catalog/provenance candidate accepted; imagery not yet admitted because automated download credentials are not configured.

## NASA ASTER — selected candidate from 2000 onward

NASA Earthdata LP DAAC archives ASTER products from the ASTER instrument aboard Terra. NASA CMR lists ASTER L1T and L2 VNIR/SWIR products. ASTER has no normal blue VNIR band, therefore any VNIR visualization used here must be labelled correctly (for example false-color) rather than presented as true RGB.

Official:
- https://www.earthdata.nasa.gov/centers/lp-daac
- https://cmr.earthdata.nasa.gov/search/site/collections/directory/LPCLOUD/gov.nasa.eosdis

Experiment status: official source verified; automated granule access/authentication still to be tested for this AOI before imagery is admitted.

## CNSA Gaofen — promising modern candidate

CNSA documents a global sharing platform for Gaofen data and public international access to Gaofen-1/Gaofen-6 16 m multispectral data. CNSA also documents higher-resolution Gaofen missions.

Official:
- https://www.cnsa.gov.cn/english/n6465652/n6465653/c6808065/content.html
- https://www.cnsa.gov.cn/n6758824/n6759008/n6759012/c6794271/content.html

Experiment status: candidate only until exact Poland AOI products and current access requirements are verified.

## Roscosmos / Russian federal Earth-observation holdings

Roscosmos documents use and provision of governmental Earth remote-sensing data through the federal remote-sensing data fund. Potential relevant missions include Kanopus-V / Resurs-P if exact public Poland coverage can be traced.

Official:
- https://www.roscosmos.ru/39803/

Experiment status: candidate only; no imagery is admitted without direct official product/date/provenance verification.

## Admission gate

Every fourth-source observation must provide mission/sensor, exact date/time, official product ID, official catalog/provider, native resolution, processing level, AOI intersection, legal/public access path, SHA-256, and a no-cross-year-duplicate result.
