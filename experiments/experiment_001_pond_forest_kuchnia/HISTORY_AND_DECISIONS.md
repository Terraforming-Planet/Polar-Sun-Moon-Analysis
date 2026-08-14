# Experiment 001 — research history and decisions

This chronology preserves the reasoning, user observations, requested tests and methodological corrections that led to Evidence 001. Statements are labelled so later work does not confuse a visual observation with an established cause.

## 1. Initial observation

The study began from repeated inspection of real satellite imagery around the forest pond and Lake Kuchnia in the Gardeja/Olszówka area. The user identified a strong visual difference between older and recent imagery: an older forest pond had a clearly visible open-water footprint, while recent images showed it strongly reduced or apparently absent.

The working AOI was eventually fixed at:

- **53.591400, 19.010717**
- standard comparison crop: **2 km × 2 km**, always centered exactly on this coordinate.

An earlier coordinate used during exploration was superseded and must not be mixed into the final comparison.

## 2. Core user hypothesis to test — NOT an established conclusion

The user argued that the local water decline might not be explained adequately by the simple statement “there is drought because it does not rain.” They proposed a management/hydrological hypothesis: water routing, drainage, river/lake connections, blocked or altered channels, and the way Vistula-system water is retained or discharged could influence local lake/pond levels.

This is preserved as a **research hypothesis only**. Satellite imagery by itself cannot establish this mechanism. Testing it requires independent hydrological evidence such as water levels, precipitation, snowmelt, groundwater, river flows, channel connectivity, drainage infrastructure and documented interventions.

## 3. Why spring imagery was requested

The user wanted spring imagery because spring conditions can reveal the maximum or near-maximum seasonal water footprint after winter/snowmelt and before the strongest summer drying and vegetation masking.

An April series was initially attempted, but many images were visibly cloudy/broken/poor. The user explicitly rejected low-quality scenes and requested a May-based series, with the rule that when a scene is bad another image from the **same month and year** should be searched before accepting poor quality.

The range was extended to **1990–2026**. Correct arithmetic: 37 inclusive years.

## 4. Resolution synchronization decision

The experiment must never pretend all years have the same native detail.

- older Landsat multispectral: typically 30 m;
- Landsat-7/8 panchromatic bands can support 15 m display sharpening in appropriate products, but that does not turn all multispectral information into native 15 m data;
- Sentinel-2: 10 m natural-color bands from 2015 onward;
- display upscaling does not add real ground detail.

For quantitative cross-era measurement, the experiment therefore uses a **common 30 m measurement grid** alongside best-available native-resolution display images.

## 5. Primary May evidence series

A synchronized primary May series was produced for **1990–2026** using real official USGS/NASA Landsat and ESA/Copernicus Sentinel-2 pixels.

Rules:

- one annual scene;
- exact same 2 km crop;
- quality ranked locally rather than trusting only whole-scene cloud percentage;
- no generative filling;
- no AI super-resolution represented as real detail.

## 6. Second delivery-path series

A second optical package was produced through alternate public delivery paths (Google Cloud Landsat / Element 84 Sentinel-2) for **1990–2025**. It was intended as an independent cross-check.

Later forensic work showed that this assumption had to be qualified:

- many years use the same underlying acquisition even though the delivery path differs;
- 2022 was explicitly a reference fallback, not independent;
- a generated-package corruption caused exact duplicated images to be assigned to 2002, 2012 and 2013.

The lesson is now a formal rule: **different download routes do not automatically mean different observations.**

## 7. Third source — independent radar physics

Sentinel-1 RTC VV/VH was added for 2015–2025. A fixed descending relative orbit and monthly May composites were used to improve stability.

This source is scientifically valuable because radar is physically different from optical imaging and is less dependent on cloud-free daylight imagery.

Limitation: the forest pond is small and partly forested, so 10 m radar pixels can mix tree canopy, wet soil and water. Sentinel-1 is therefore a strong independent control for larger water structures but a lower-confidence exact-area sensor for the small pond.

## 8. Image-first forensic audit

The user explicitly requested that dates not be trusted merely because metadata says they are correct. The audit therefore examined image content first:

- exact file hashes;
- cross-year duplicates;
- structural registration;
- orientation;
- blank/broken patterns;
- optical/radar geographic consistency;
- metadata only after pixel checks.

Key findings:

- source2 2002/2012/2013: exact file duplicates — invalid;
- source2 1993: broken/blank pattern and path-row conflict — invalid/review;
- 1995: poor optical quality — replace;
- 2010: problematic imagery — replace;
- 1997: strong image agreement but QA disagreement — provenance/QA review rather than “fake scene”;
- source1 and source3 contained no exact cross-year duplicate in the audited sets;
- no evidence was found that USGS/ESA themselves falsified imagery; the discovered concrete errors were in our generated package/workflow.

## 9. Preservation of errors

The user requested that bad images remain available instead of being deleted.

Policy:

- original package remains untouched;
- suspect copies are stored under `errors/do_wyjasnienia/`;
- SHA-256 and reason are recorded;
- a suspect image is excluded from quantitative evidence until resolved/replaced.

## 10. Corrected spring protocol

The corrected experiment does not force a bad May image.

Priority:

1. May
2. April fallback
3. June fallback

Every fallback is written into the manifest and filename still starts with the true acquisition year/date.

Examples identified during the corrected build:

- 1995: bad May replaced by **1995-04-23 Landsat-5**;
- 1997: problematic May replaced by **1997-04-19 Landsat-5**;
- 2010: bad May/April candidates led to **2010-06-18 Landsat-7**;
- 2011: **2011-04-19 Landsat-5** fallback.

## 11. Autumn comparison requested

The user requested a second seasonal series to examine the period when the water body may be most contracted after summer.

Priority:

1. September
2. October fallback
3. November fallback

The purpose is not to compare random dates as if they were identical hydrological states. The season/month is retained explicitly so spring-to-autumn and year-to-year comparisons can be interpreted correctly.

As of **14 August 2026**, autumn 2026 has not occurred yet. Therefore a real autumn 2026 observation cannot exist in this experiment at this date and must remain missing rather than fabricated.

## 12. Working Evidence 001 statement

### Strong visual observation

The forest pond has undergone a very large state change across the 1990–2026 record and appears in recent imagery to have lost nearly all of the older persistent open-water footprint.

### Provisional magnitude

Working visual estimate: approximately **2.5 ha / 25,000 m²**, near **100% open-water loss**.

This number is not final. Some historical images appear to show an even larger water footprint. It remains a hypothesis/working estimate until common-grid spectral segmentation and manually verified pond geometry produce an uncertainty-bounded endpoint result.

### Alarm interpretation

If the corrected multi-season, multi-sensor analysis confirms near-total disappearance of a previously persistent hectare-scale water body, TerraWater should flag the site as a **high-priority environmental monitoring anomaly requiring investigation**. The alarm does not itself diagnose a cause.

## 13. Fourth-source search

The experiment should prefer real independence over a cosmetic “four sources” count.

Investigated candidates:

- **NASA ASTER / Terra** — official Earthdata/CMR catalog; separate sensor; 77 spring/autumn AOI catalog hits found in 2000–2026 queries; pixel admission pending authenticated/verified granule retrieval.
- **JAXA ALOS AVNIR-2/PALSAR** — official open/free ALOS data 2006–2011, but G-Portal download requires login; valuable separate optical and L-band radar control.
- **CNSA Gaofen** — promising official modern independent source, but exact Poland AOI products/access must be verified before admission.
- **Roscosmos** governmental EO holdings — candidate only until exact public/legal Poland AOI product/date/provenance can be retrieved.

No mission is represented as evidence simply because its agency name is desirable.

## 14. Long-term TerraWater training plan

The user’s longer-term plan is to convert verified examples into TerraWater/ChessArena512AI-style training material while preserving untouched source imagery and keeping annotations/overlays separate.

Planned progression:

1. close Evidence 001 rigorously;
2. collect approximately **five** similarly documented evidence sites;
3. build human-verified labels for dried/shrinking water bodies;
4. later test/train using **NVIDIA L4**;
5. then survey lakes, ponds, rivers and canals within **100 km** of Evidence 001;
6. later scale to a broader global dataset rather than assuming this one local case generalizes everywhere.

The model should learn to detect candidate changes and prioritize review; human/measurement verification remains required for evidence claims.
