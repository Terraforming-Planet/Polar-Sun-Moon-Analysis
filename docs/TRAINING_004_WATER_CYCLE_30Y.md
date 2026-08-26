# Training #4 — 30-Year Seasonal Water-Cycle Change Dataset

## Why this track exists

Training #4 should learn **change through time**, not merely recognise attractive satellite imagery.
The core scientific question is whether a reproducible multi-source EO pipeline can distinguish:

- persistent surface-water loss;
- persistent surface-water gain;
- normal seasonal recurrence;
- shoreline and river-channel migration;
- wetland inundation changes;
- stable controls;
- observations that are genuinely unknown because the data are missing or unsuitable.

The system must then connect those observations to terrain and water-cycle context without converting
correlation into an unsupported causal or engineering claim.

The machine-readable contract is `config/training-004-water-cycle-30y.json`.

## Exact time window

The project archive contains research context from 1990 through 2026. That is **not** a 30-year
interval. The reproducible training core therefore uses exactly 30 complete calendar years:

**1996–2025 inclusive.**

The full 1990–2026 archive remains useful as historical context. In particular, TEST 001 retains its
1990–2026 spring/autumn archive. The incomplete 2026 seasonal pair is context/evaluation data until
both requested seasonal windows have occurred and have been ingested.

## TEST 001 is the anchor, not an answer leak

TEST 001 — the forest pond near Lake Kuchnia — is scientifically useful because the project already
contains a multi-year field-observation report describing gradual visible water loss and later dry
conditions, while wider-area water observations reportedly evolved differently.

The report is explicitly `AUTHOR_FIELD_OBSERVATION` and is not independently verified hydrological
ground truth. It does not prove that a ditch, well, repair, rainfall change or any other mechanism
caused the observed water history.

For that reason:

- the **methodological lesson** from TEST 001 may shape training policy;
- the exact TEST 001 AOI pixels and known outcome are reserved as an **anchor holdout**;
- the model must learn loss/gain/stability patterns from other official EO observations;
- after training, TEST 001 becomes an independent check of whether the learned method transfers;
- any causal explanation remains a hypothesis until official records, hydrology and field evidence
  support it.

This is stronger than training directly on the answer and then claiming successful rediscovery.

## 500,000 temporal packs

The target is 500,000 temporal change packs, deliberately balanced rather than sampled according to
natural Earth-surface prevalence:

| Track | Share | Packs |
| --- | ---: | ---: |
| Green / water-rich ecosystems | 30% | 150,000 |
| Dry / arid / desert regions | 30% | 150,000 |
| Polar / cryosphere regions | 30% | 150,000 |
| Experimental paleochannel + counterfactual track | 10% | 50,000 |

A **pack** is a linked bundle of observations for the same AOI and task. It can contain historic
Landsat, recent Sentinel detail, SAR, DEM and selected hydrological context. It is not counted as a
single independent source image.

Balanced sampling is deliberate. It prevents a globally dominant or visually easy class from
swamping rare but important water/ice/arid behaviours. The published report must state this clearly.

## Spatial resolution and scale

Historic comparability takes priority over cosmetic upscaling.

### Historic core

Landsat Collection 2 Level-2 Surface Reflectance is the default long-record optical source.
At 30 m native resolution, a 512 × 512 window covers approximately **15.36 km × 15.36 km**.

This is the default local historical window because it preserves the native information content.
The pipeline must never resample a 30 m image to 10 m and imply that new detail has been created.

### Recent detail

Sentinel-2 Level-2A can add a recent 10 m context window. At 512 × 512 this covers approximately
**5.12 km × 5.12 km**. It is useful for interpretation and current monitoring, but its resolution
must remain explicit when compared with Landsat.

### Terrain context

A wider DEM context helps answer where water can physically drain, pool or overflow. A 512 × 512
window at 90 m covers approximately **46.08 km × 46.08 km**.

The default unrestricted Copernicus DEM view fallback is GLO-90. NASADEM/SRTM can provide suitable
30 m terrain context in covered regions. COP-DEM-GLO-30 must only be requested when current access
rights authorize it.

## Spring, autumn and local hydroclimatic seasons

For northern mid-latitudes the default windows are March–May and September–November. For southern
mid-latitudes the seasons are reversed.

Tropical regions must not be given false European-style spring/autumn labels. Their two comparison
windows should be derived from an official precipitation climatology and stored with explicit local
hydrological-season labels.

Polar regions also need special handling. If illumination or optical quality makes a shoulder-season
scene unsuitable, the pack records the optical gap and uses SAR/validated cryosphere products where
appropriate. Missing optical evidence is not silently replaced by a visually convenient date.

## Cloud-free scene selection

The acquisition stage searches the full seasonal window and ranks valid scenes using official quality
metadata. The default policy is:

1. prefer optical scenes at or below 15% cloud;
2. allow a documented fallback up to 30% when the actual AOI remains scientifically usable;
3. apply official pixel/scene QA masks;
4. if no valid optical observation exists, emit `UNKNOWN/optical_unavailable`;
5. add SAR as complementary all-weather evidence when appropriate.

This follows the same principle demonstrated by modern EO foundation-model and onboard-AI systems:
quality filtering is a pipeline stage, not a cosmetic afterthought.

## Water-change labels are derived evidence

Candidate output classes include:

- `surface_water_loss`;
- `surface_water_gain`;
- `seasonal_recurrence_change`;
- `shoreline_migration`;
- `wetland_inundation_change`;
- `river_channel_migration`;
- `potential_overbank_spill_context`;
- `no_material_change`;
- `unknown`.

These labels are `DERIVED_VALUE` or `MODEL_ESTIMATE` unless independently validated. An MNDWI mask,
SAR classification, JRC Global Surface Water layer or other algorithmic product is evidence, not a
universal statement of environmental ground truth.

The model should see both positive and negative examples: disappearance, appearance, reversible
seasonal change and genuinely stable water bodies.

## Terrain and the project's elevation flags

The existing UI concept of numbered elevation flags can become a scientifically useful evidence layer
if each point stores provenance. Useful channels include:

- elevation;
- local relief;
- slope and aspect;
- flow direction and flow accumulation when derived with a documented method;
- height above nearest drainage (HAND) when derived reproducibly;
- water-surface elevation from SWOT where valid;
- water extent and precipitation/soil-moisture context.

Every displayed height should retain the DEM/product identifier, native resolution, vertical datum
when known and derivation version.

## Overflow or spill risk

The system may estimate **potential overbank/spill context**, but this is a `MODEL_ESTIMATE`, not an
observation of an imminent flood.

A useful model can combine low HAND, upstream topology, increasing observed water extent or valid
water-surface elevation, antecedent precipitation and soil-moisture context. It must also publish DEM
uncertainty, missing data and the false-alert/missed-event rates measured on held-out historical cases.

Elevation alone is not enough to predict a flood.

## Experimental 10% — paleochannels and water-routing hypotheses

The experimental track is intentionally separated from observational claims. It asks two useful
research questions:

1. Can multi-sensor evidence identify **candidate** ancient/palaeochannel structures that deserve
   geological or field investigation?
2. Can a counterfactual model quantify what could happen if a hypothetical fraction of water were
   routed differently, without presenting that scenario as an engineering recommendation?

Candidate paleochannel evidence may include C/L-band SAR structure, DEM/drainage morphology,
optical/hyperspectral surface context and authoritative geological/hydrographic records.

A river-diversion or restoration scenario must report possible benefits **and** possible damage. The
minimum consequence matrix covers:

- downstream environmental flows;
- estuary/delta freshwater and salinity;
- sediment and nutrient transport;
- wetlands and aquatic habitat;
- groundwater recharge;
- evaporation losses;
- waterlogging and soil salinisation;
- redistribution of flood and drought risk;
- pumping/head energy;
- reservoir/navigation consequences;
- transboundary and legal constraints;
- impacts on communities using only lawful aggregate/public evidence;
- uncertainty and required field checks.

The output is `HYPOTHESIS` or `MODEL_ESTIMATE`. The final question is always:

> What evidence would falsify this hypothesis, and what hydrological/ecological/field checks would be
> required before any intervention could even be considered?

This avoids teaching the model that large interventions are harmless by default.

## Official-source architecture

The intended evidence stack is modular:

- **USGS/NASA Landsat Collection 2** — long optical record;
- **Copernicus Sentinel-2** — recent high-detail optical context;
- **Copernicus Sentinel-1** — all-weather radar;
- **NASA JPL OPERA RTC-S1 / DSWx-S1** — radar-ready and validated water products where applicable;
- **JAXA ALOS/PALSAR family** — independent L-band context/cross-sensor holdout;
- **JRC Global Surface Water** — official derived long-term water-history cross-check;
- **NASADEM/SRTM + Copernicus DEM** — terrain context;
- **SWOT** — recent river water-surface elevation, slope, width, area and discharge estimates;
- **GPM IMERG** — precipitation from 1998 onward;
- **GRACE/GRACE-FO** — regional terrestrial-water-storage context;
- **SMAP** — surface-soil-moisture context;
- **ERA5-Land** — long-period meteorological context;
- public hydrography/drainage datasets only with explicit licence and provenance.

The acquisition system should query catalogues and download only the required window/chunk/COG data.
It must not mirror entire mission archives.

## What the three ESA calls imply for Training #4

### 1. Agentic AI Systems for Earth Observation — primary target

This project already aligns strongly with the call's focus on long-horizon planning, heterogeneous EO
tools, trustworthy tool use, self-correction, uncertainty, MCP-style interoperability and benchmarks.

Training #4 should close the remaining implementation gap by demonstrating a real end-to-end mission:

`research objective → source discovery → quality filtering → data acquisition → deterministic EO
metrics → terrain/hydrology reasoning → uncertainty → next observation → reproducible report`.

The frozen B01–B10 benchmark and M001–M006 missions remain external controls and must not enter the
training curriculum.

### 2. AI for Reconstruction of the Terrestrial Water Cycle — technical inspiration

The strongest ideas to borrow are daily/continuous reconstruction from sparse heterogeneous
observations, uncertainty with multiple plausible hydrological states, precipitation and terrestrial
water-storage inputs, river-topology/flow-propagation/water-balance constraints, and physical
assessment of drought/flood behaviour.

The 30-year seasonal dataset does **not** by itself solve daily water-surface-elevation reconstruction.
A future dedicated model must learn a temporally denser WSE sequence and be evaluated against valid
SWOT/altimetry/in-situ references where legally/publicly available.

### 3. AI for SAR Foundation Models — technical inspiration

The TP-26 SAR track already introduces Sentinel-1/OPERA and independent JAXA L-band data. To approach
the research depth of the SAR call, the project still needs reproducible self-supervised SAR
pretraining, calibrated radar products, cross-frequency/cross-sensor evaluation and, later, deeper
SLC/PolSAR/InSAR/coherence work where appropriate.

Preview imagery is not a substitute for SAR physics.

## Useful lessons from other space/AI programmes

Training #4 should use external programmes as design references, not claim partnerships.

- **NASA Prithvi**: multi-temporal geospatial foundation models, diverse global sampling and explicit
  quality/cloud filtering show why temporal packs and balanced high-quality sampling matter.
- **NASA Land Information System / water-cycle assimilation**: combining precipitation, soil moisture,
  terrestrial water storage and surface-water observations is a better model of the water cycle than
  reasoning from imagery alone.
- **JAXA SAR foundation model**: deliberate land-class balancing and self-supervised SAR pretraining
  support the decision not to let one common biome dominate the dataset.
- **NASA–ISRO NISAR**: dual-frequency radar provides an important future cross-band generalisation
  target for environmental change and all-weather monitoring.
- **NOAA Project EAGLE**: ensemble AI + physics-based verification is a strong pattern for uncertainty
  and multiple plausible future flood/weather scenarios rather than one overconfident forecast.
- **UAE Space Agency / Arab Satellite 813 and GIQ**: hyperspectral water/soil/vegetation observations
  and AI-assisted satellite/source selection are useful references for future TP-26 routing.
- **ESA Φsat-2**: onboard cloud classification as a reusable preprocessing service is directly relevant
  to the dataset quality gate.
- **Roscosmos ISS Ekon-M/Scenario**: public programmes demonstrate ecological Earth photography and
  hazardous-phenomena assessment, but no comparable openly documented EO foundation-model programme
  is assumed here.
- **SpaceX**: Falcon 9 launched ESA Φsat-2, but launch-provider involvement must not be presented as a
  SpaceX EO-AI programme unless an official programme/source can actually be documented.

## Reproducible manifest before downloads

Run:

```powershell
.\.venv-l4\Scripts\python.exe scripts\build_training_004_water_cycle_manifest.py `
  --output research_runs\training004_water_cycle_manifest.jsonl
```

The default manifest contains exactly 500,000 deterministic sampling slots. The generated file remains
outside Git under `research_runs/` and records that **no satellite data have been downloaded yet**.
The acquisition stage must resolve each slot against official catalogues and add real product/granule
identifiers, dates, QA and provenance before a pack can enter training.

## Publication rule

The public report must show failures, missing seasons, source outages and uncertainty. It must never
turn model loss, an inferred channel, a water-area change or a terrain correlation into a claim that a
specific environmental intervention is safe, causal or ready for construction.
