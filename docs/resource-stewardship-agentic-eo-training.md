# Resource Stewardship Agentic EO Training Plan

## Purpose

Train Terra Observation System to reason more clearly about natural resources, water systems and hazard risk using official/public Earth-observation evidence. The goal is not autonomous control of the environment. The goal is to help people understand what changed, what is uncertain, which measurements are still missing, and which scientifically defensible next checks would reduce uncertainty.

Long-term public-good questions include:

- where former river channels or floodplain connections may still be visible and worth hydrological study;
- how lakes, wetlands and reservoirs change through time;
- where water retention, drainage or channel connectivity may deserve field investigation;
- how desert catchments and drylands respond to rainfall, runoff and land-cover change;
- which areas face increasing flood exposure;
- where protected habitats or reserves show rapid land-cover disturbance;
- how earthquake exposure and post-event damage can be assessed from EO and official geophysical data.

This training must never claim that a satellite image alone proves a physical cause, that a former river channel can safely be reopened, or that the system can predict the exact time/place of an earthquake.

Experiment logging and provenance are governed by `docs/TRAINING_EVIDENCE_POLICY.md`. A long training process that finishes without its required evidence package is not considered a complete research run.

## Core evidence classes

Every case should distinguish at least:

1. **Direct observation metadata** — product ID, sensor, acquisition time, footprint, resolution, quality flags.
2. **Derived EO measurement** — mapped water extent, land-cover change, deformation proxy, burn scar, flood extent, etc.
3. **Modelled environmental data** — hydrological forecasts/reanalysis or other model products.
4. **In-situ / official records** — gauges, discharge, precipitation, reservoir levels, seismic catalogues, infrastructure records where legally/publicly available.
5. **Hypothesis** — a proposed explanation or intervention that is not yet established by the evidence.

The model must never merge these classes into one certainty score without showing their provenance.

## Training tracks

### Track A — Water-body change

Tasks:
- compare matched-season observations;
- estimate change in mapped water extent only when resolution supports it;
- separate area from depth and volume;
- identify missing bathymetry, gauge or discharge evidence;
- report cloud, SAR, seasonality and shoreline-classification limitations.

### Track B — Former river channels and restoration hypotheses

Tasks:
- recognize geomorphic traces consistent with paleochannels or abandoned channels;
- compare DEM, SAR and optical evidence;
- identify possible present-day barriers or changed connectivity;
- propose field checks, hydrological modelling and environmental-impact studies;
- explicitly refuse to recommend excavation, diversion or opening of a channel from imagery alone.

A restoration candidate is a **research hypothesis**, not an engineering instruction.

### Track C — Drylands and desert water management

Tasks:
- identify catchments, drainage paths, ephemeral channels and low-lying storage areas;
- connect rainfall/runoff evidence with terrain and land cover;
- compare water availability across seasons and years;
- highlight ecological, downstream and cross-border consequences that require expert review.

### Track D — Flood-risk understanding

Tasks:
- combine terrain, floodplain, river discharge/model evidence and historical inundation;
- distinguish observed flooding from forecast/modelled risk;
- identify exposed infrastructure at area level;
- recommend verification with official emergency and hydrological authorities.

The system may support preparedness. It must not replace official warnings or emergency command.

### Track E — Earthquake exposure and post-event assessment

Tasks:
- use official seismic catalogues for event parameters;
- compare pre/post SAR or optical observations for surface change and damage proxies where appropriate;
- combine terrain, infrastructure and population-area exposure layers only at lawful aggregate scale;
- report uncertainty and sensor limits.

Prohibited claim: predicting the exact time, location or magnitude of a future earthquake without a scientifically validated method accepted by relevant authorities.

### Track F — Protected areas and biodiversity-support monitoring

Tasks:
- detect land-cover disturbance, fire, illegal clearing, mining expansion or habitat fragmentation visible in public EO;
- prioritize areas for human review;
- avoid tracking individual people or animals unless data are explicitly public, lawful and intended for conservation use.

## Agentic workflow

For each case, the agent should execute:

`question -> evidence plan -> source selection -> acquisition/metadata validation -> measurement -> cross-check -> uncertainty audit -> intervention hypothesis -> required human/expert review -> reproducible report`

The agent must be able to stop and say **insufficient evidence**.

## Resource-management reasoning format

Every report should include:

- **Observed** — what the evidence directly supports.
- **Derived** — what was calculated or classified.
- **Unknown** — what cannot currently be established.
- **Possible explanations** — clearly labelled hypotheses.
- **Resource implications** — water, habitat, infrastructure or hazard relevance.
- **Next evidence** — the highest-value missing measurement or source.
- **Decision boundary** — what requires a hydrologist, geologist, emergency authority, conservation authority or other qualified human.

## Benchmark case families

Create geographically diverse, source-reproducible cases for:

1. shrinking/expanding lake;
2. wetland loss or recovery;
3. abandoned or altered river channel;
4. floodplain reconnection hypothesis;
5. dryland/ephemeral river catchment;
6. reservoir and downstream change;
7. historical flood and present exposure;
8. wildfire/watershed interaction;
9. protected-area disturbance;
10. earthquake post-event damage assessment.

Each family needs positive, negative and insufficient-evidence examples.

## Evaluation gates

Minimum goals:

- provenance completeness: 100% for evidence used in conclusions;
- unsupported causal claims: 0 accepted;
- unsupported engineering instructions: 0 accepted;
- earthquake-prediction overclaim: 0 accepted;
- area/depth/volume confusion: 0 accepted;
- modelled-vs-observed confusion: 0 accepted;
- explicit missing-data handling: required;
- reproducible case manifest: required;
- human decision boundary: required for every intervention-oriented case;
- long-run experiment evidence completeness: required.

## Mandatory experiment-recording standard

For every future long-running training, adaptation or benchmark job:

1. Create the run/session identity and evidence directory before compute starts.
2. Start stdout/stderr capture and shell transcript before the training process starts.
3. Record exact Git SHA/ref, exact command, arguments, machine, GPU/CPU, framework/CUDA and dependencies.
4. Run and verify a short smoke test on the same path.
5. Block the long run when evidence capture or smoke validation fails.
6. Preserve periodic metrics, failures, retries, fallbacks, OOM/batch changes, manifests and final status.
7. Hash model/checkpoint artifacts and the complete evidence package.
8. Copy the evidence off cloud/ephemeral compute and verify the copied SHA-256 before destroying the instance/disk.
9. Publish missing evidence and limitations explicitly; never silently fill a gap with a reconstruction.

For Windows NVIDIA L4 recovery/export, use `scripts/export_all_training_logs_l4.ps1`.

## Relationship to Training #4

Training #4 is one training stage consisting of **two 60-minute NVIDIA L4 sessions, 120 minutes total**. They are sessions of the same Training #4. There is no Training #5 in this sequence.

Training #4 focuses on real spectral-temporal EO learning/evidence handling and related high-throughput processing. Resource Stewardship is the downstream reasoning curriculum: it should use verified evidence packages produced by that pipeline rather than creating a second uncontrolled data path.

Historical evidence must retain its actual class (`RAW_VERIFIED`, `RAW_FOUND_UNVERIFIED`, `DERIVED_EVIDENCE`, `RECOVERED_EVIDENCE` or `MISSING`). A recovered console reconstruction must never be described as an original transcript.

Do not merge experimental results into benchmark truth. Freeze benchmark cases before adaptation and keep a final untouched holdout.

## Long-term outcome

The desired system is a scientific decision-support layer that can help researchers, communities and authorities understand planetary resources and hazards faster. In the future it may help identify where restoration, retention, flood protection or conservation studies deserve attention — while keeping real-world interventions under qualified human, legal and environmental review.

The public-good objective does not reduce the evidence standard; it raises it. If the system may eventually support work around floods, water, glaciers, fires, infrastructure or ecosystems, its observations and model behavior need to be traceable enough that qualified people can decide what to trust and what must be checked next.
