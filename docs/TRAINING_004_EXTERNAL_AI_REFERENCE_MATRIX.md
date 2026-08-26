# Training #4 — Official Space-AI Reference Matrix

This document records public, official programmes that inform the design of Training #4. They are
**design references, not claimed partnerships, endorsements, or shared training programmes**.

The project core remains **Terra Observation System + ESA-aligned Agentic EO research**. External
programmes are used only where they contribute a reproducible engineering or scientific idea.

## Priority 0 — ESA Φ-lab calls we must satisfy first

### ESA Φ-lab — Agentic AI Systems for Earth Observation

Official source:
https://cin.philab.esa.int/schemes/opportunity-for-visiting-researchers-in-agentic-ai-systems-for-earth-observation

Relevant objectives:

- reliable agents that solve complex EO tasks using heterogeneous tools and datasets;
- domain-adaptive discovery and benchmarking of geospatial foundation models;
- long-horizon scientific planning;
- trustworthy tool selection, verification, self-correction and uncertainty awareness;
- interoperable tool ecosystems including MCP;
- reproducible benchmarking of reasoning, planning, tool use, robustness and scientific correctness.

**Training #4 action:** keep the read-only allow-listed MCP layer, frozen B01-B10 and M001-M006
controls, provenance classes, controlled outages, next-observation planning, and real public traces.
The missing gate is a real end-to-end L4 run with scientific data products rather than previews.

### ESA Φ-lab — AI for Reconstruction of the Terrestrial Water Cycle

Official source:
https://cin.philab.esa.int/schemes/opportunity-for-visiting-researchers-in-ai-for-reconstruction-of-the-terrestrial-water-cycle

Relevant research directions:

- daily water-surface-elevation reconstruction from sparse heterogeneous satellite observations;
- generative uncertainty and multiple plausible hydrological states;
- precipitation and gravity-derived terrestrial-water-storage inputs;
- river topology, flow propagation and water-balance constraints;
- hydrological evaluation of droughts, floods and spatial coherence;
- evaluation across major river basins.

**Training #4 action:** the 30-year seasonal record becomes the long-baseline representation layer.
It does not claim to solve the daily WSE task. A later hydrology head should add temporally dense SWOT
and other valid water-level observations, topology and water-balance constraints, and probabilistic
uncertainty.

### ESA Φ-lab — AI for SAR Foundation Models

Official source:
https://cin.philab.esa.int/schemes/opportunity-for-visiting-researchers-in-ai-for-sar-foundation-models

Relevant research directions:

- self-supervised and multimodal SAR representation learning;
- cross-sensor, cross-frequency, cross-mode and cross-geography generalisation;
- Sentinel-1, NISAR, BIOMASS and other SAR missions;
- low-level products including SLC;
- PolSAR, InSAR, coherence and time-series analysis;
- rigorous transferability, robustness and scientific-value benchmarking.

**Training #4 action:** keep the current Sentinel-1/OPERA/JAXA/NISAR path as a cross-sensor track,
but do not describe preview imagery or simple water masks as a SAR foundation model. A later dedicated
SAR stage must use calibrated products and self-supervised representation learning, with SLC/coherence
work only when the processing and scientific expertise are adequate.

## Priority 1 — NASA

### Prithvi-EO-2.0 / Prithvi-HLS v2

Official sources:

- https://ntrs.nasa.gov/citations/20240015391
- https://www.nasa.gov/marshall-science-achievements/
- https://www.nas.nasa.gov/SC24/research/project27.php

Public NASA material describes a multi-temporal EO foundation model trained on 4.2 million global HLS
time-series samples. NASA also describes improved sampling for diverse, high-quality/cloud-free samples
and broad representation of land-use classes and ecoregions.

**What Terra should borrow:**

- treat time as a first-class feature rather than train on isolated images;
- balance landscapes deliberately instead of allowing common classes to dominate;
- quality-filter observations before they enter the model;
- retain geographic and temporal metadata;
- benchmark transfer to tasks and geographies not seen during training.

### NASA Land Information System (LIS)

Official sources:

- https://earth.gsfc.nasa.gov/hydro/models/lis
- https://lis.gsfc.nasa.gov/software/lis

LIS integrates satellite and ground observations with land-surface models and data assimilation. NASA
lists GPM, SMAP, GRACE/GRACE-FO and SWOT among the missions supported for land-hydrology applications.

**What Terra should borrow:** an observation-only water detector is not enough. Build a separate
hydrology-context layer that can combine precipitation, surface soil moisture, regional total water
storage, water-surface elevation, runoff/land-state modelling and uncertainty without confusing any one
of these variables with another.

### SWOT

Official public NASA/PO.DAAC RiverSP products report water-surface elevation, slope, width, area and
discharge estimates for predefined river reaches/nodes.

**What Terra should borrow:** use SWOT as a recent dynamic-height reference where coverage and product
quality permit. Do not infer historic bathymetry or water volume from WSE alone.

## Priority 1 — ESA Science Hub long-term water storage

### ML-TWiX

Official source:
https://sciencehub.esa.int/2026/04/16/ml-twix-extending-satellite-based-water-storage-records-back-to-1980/

ML-TWiX reconstructs monthly terrestrial-water-storage anomalies back to 1980 by learning from the
GRACE era and modelled hydrological information, combining multiple ML models and publishing spatial
uncertainty.

**What Terra should borrow:** for a 30-year project, long-term regional water storage should be an
uncertain context variable, not a guessed local groundwater map. Ensemble disagreement is useful
information and should be preserved.

## Priority 1 — JAXA / AIST

### ALOS-2 PALSAR-2 SAR foundation model

Official sources:

- https://www.jaxa.jp/press/2025/06/20250603-1_j.html
- https://www.aist.go.jp/aist_e/list/latest_research/2025/20251001/en20251001.html

JAXA/AIST trained a self-supervised SAR foundation model on high-resolution PALSAR-2 observations.
The public AIST description explicitly highlights a more balanced training dataset across land-use and
land-cover types and improved transfer-learning performance compared with training from scratch.

**What Terra should borrow:** the 30/30/30/10 Training #4 split is a deliberate sampling policy, not a
claim about Earth's natural land-cover percentages. Rare but scientifically important dry/polar/water
behaviours should not be drowned out by common classes.

## Priority 1 — NASA + ISRO

### NISAR

Official sources:

- https://science.nasa.gov/mission/nisar/
- https://nisar.jpl.nasa.gov/mission/observatory/overview/
- https://www.isro.gov.in/NISARS_Band_SAR_Data_Products_Release.html

NISAR provides dual-frequency L/S-band SAR, all-weather observations and a 12-day repeat cycle. Public
L-band and S-band products are now a valuable new cross-frequency source for 2026-era experiments.

**What Terra should borrow:** reserve NISAR as a modern cross-band generalisation and change-detection
track. It cannot extend a 30-year record by itself; Landsat and other historic sources remain the time
backbone.

### ISRO / IIRS EO + AI programmes

Official sources:

- https://www.isro.gov.in/IIRS_Academic_Meet%28IAM%29-2026.html
- https://www.isro.gov.in/NRSC_ISRO_IISc_research.html
- https://www.isro.gov.in/ISRO_EN/POEM_4_Payloads_spadex.html

Useful design references include EO+AI for disaster resilience and ecological monitoring, a hybrid
Physics-AI project for city-scale extreme-rainfall prediction, and the MOI-TD in-orbit AI-lab
demonstrator that can upload ML models and downlink inference results.

**What Terra should borrow:** for flood/spill work, add physical constraints and verification rather
than relying on image correlation. Treat future onboard/edge inference as a later deployment layer,
not as a substitute for scientific training and validation on the ground.

## Priority 1 — NOAA

### Project EAGLE / nested-EAGLE

Official sources:

- https://epic.noaa.gov/ai/eagle-overview/
- https://epic.noaa.gov/nested-eagle/

NOAA's EAGLE programme provides AI forecast workflows with training, inference, ensemble configurations,
verification and research-to-operations pathways.

**What Terra should borrow:** publish retrospective verification, failure cases and uncertainty. For
flood/spill forecasting, prefer calibrated probabilities or ensembles to one confident binary answer.

## Priority 1 — ESA onboard AI

### Φsat-2

Official sources:

- https://www.esa.int/Applications/Observing_the_Earth/Phsat-2
- https://www.esa.int/Applications/Observing_the_Earth/Phsat-2/AI_for_cloud_detection

Φsat-2 demonstrates onboard AI applications including cloud detection. ESA describes cloud detection
as a reusable preprocessing service whose output can feed the next onboard application.

**What Terra should borrow:** implement cloud/quality filtering as an explicit reusable stage before
water-change inference rather than silently allowing poor scenes into the model.

## Priority 2 — UAE Space Agency

### Arab Satellite 813

Official sources:

- https://space.gov.ae/en/projects-and-initiatives/earth-observation-and-remote-sensing/813
- https://space.gov.ae/en/media-center/news/12/12/2025/uae-announces-successful-launch-of-arab-satellite-813

Arab Satellite 813 includes a 205-band hyperspectral imager covering 400-1700 nm, a panchromatic
camera and an atmospheric polarimeter. Public programme material identifies water resources,
hydrology, water quality, sediments, vegetation and soils among its applications.

**What Terra should borrow:** hyperspectral evidence is a valuable future source for water quality,
salinity/soil and vegetation-stress questions where public access and licence permit it. It is not a
replacement for the long Landsat record.

### GIQ — Smart Transformation in Satellite Image Acquisition

Official source:
https://space.gov.ae/en/media-center/news/15/10/2025/uae-space-agency-launches-next-generation-of-giq-platform-at-gitex-global-2025

The UAE describes GIQ as a platform addressing the difficulty of working with many imagery providers
and choosing the most appropriate satellite; it aggregates access to multiple public/private EO
providers and AI analytics.

**What Terra should borrow:** strengthen Terra Source Scout so that sensor selection is a scored,
auditable decision based on requested phenomenon, date, cloud, resolution, SAR/optical physics,
licence, latency and provenance rather than a hard-coded satellite button.

## Priority 2 — Roscosmos / Russian ISS segment

Official source:
https://www.roscosmos.ru/41546/

Public Roscosmos material describes the ISS `Scenario` experiment for methods of assessing catastrophic
and potentially dangerous phenomena and `Ekon-M` Earth photography for ecological assessment.

**What Terra should borrow:** keep ecological/hazard monitoring in TP-26's evidence catalogue, but do
not claim that these programmes are equivalent to a publicly documented EO foundation model unless a
specific official AI model, data release and method can be verified.

## SpaceX boundary

Official ESA Φsat-2 material records a SpaceX Falcon 9 as the launch vehicle for Φsat-2.

That launch role is useful space infrastructure, but it is **not evidence of a SpaceX EO-AI research
programme**. Training #4 should not list SpaceX as an AI model/data partner unless an official,
scientifically relevant public programme is identified later.

## Concrete additions to Training #4

The external review supports six additions that are worth implementing:

1. **Quality Gate Service** — cloud, shadow, snow/ice, NoData, sensor artifacts and valid-pixel ratio
   are evaluated before any image becomes a training observation.
2. **Balanced Temporal Sampler** — explicit 30/30/30/10 sampling, geographic holdouts and local nearby
   windows rather than repeated central pixels.
3. **Hydrology Context/Assimilation Layer** — precipitation, soil moisture, regional water storage,
   WSE and terrain are separate provenance-linked channels.
4. **Physics/Topology Constraints** — water-balance consistency, river connectivity/flow direction and
   conservation-aware penalties are added to hydrological tasks where scientifically valid.
5. **Probabilistic/Ensemble Outputs** — overflow and future-state tasks publish uncertainty,
   calibration and alternative plausible states instead of one certain answer.
6. **Auditable Source Scout** — select the best sensor/data product for the objective and document why
   it was selected and what alternatives were rejected.

## Non-negotiable scientific boundary

No programme above changes the evidence policy of Terra Observation System:

- a detected correlation is not a cause;
- a water-area mask is not water volume;
- regional GRACE/TWS is not a local aquifer map;
- a paleochannel candidate is not a confirmed buried river;
- a counterfactual river diversion is not an engineering recommendation;
- model training loss is not environmental ground truth;
- a useful intervention hypothesis must publish foreseeable downstream harms, uncertainty and the
  measurements needed to falsify or validate it before any real-world action is considered.
