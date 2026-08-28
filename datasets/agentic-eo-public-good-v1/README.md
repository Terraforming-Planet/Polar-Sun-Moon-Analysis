# Agentic EO Public Good Dataset v1

## Purpose

This dataset is a small, reproducible **agent-behaviour curriculum** for Earth Observation workflows that may help people through safer environmental monitoring and clearer scientific reasoning.

It is designed for the Terra Observation Agentic EO system and for controlled experiments with ESA Φ-lab EVE-Instruct. It is **not** an environmental ground-truth dataset and it is **not** intended to prove that either model is scientifically superior.

The curriculum focuses on observable behaviours that matter for public-good Earth Observation:

- selecting an appropriate official/public EO source for a stated phenomenon;
- stating the sensor/product limitation instead of hiding it;
- separating OBSERVATION, DERIVED_VALUE, MODEL_ESTIMATE, HYPOTHESIS and UNKNOWN;
- refusing unsupported causal claims;
- treating catalogue/event metadata as metadata rather than pixel-level evidence;
- preserving provenance and source identity;
- using deterministic calculations where possible;
- recovering safely when a tool/source is unavailable;
- recommending the next independent check rather than fabricating certainty.

## Scientific scope

Version 1 is deliberately **text/tool oriented**. EVE-Instruct is a text Earth-Intelligence model, so this dataset does not pretend that text fine-tuning teaches direct satellite-image interpretation.

Raw Sentinel/Landsat pixels, segmentation masks, DEM rasters and other multimodal inputs belong in a separate image/geospatial training track with dedicated labels and geospatial validation.

## Source material

The factual backbone comes from the repository's controlled official/public EO source registry:

- NASA FIRMS / VIIRS active fire;
- NASA EONET event catalogue;
- Copernicus Sentinel-1;
- Copernicus Sentinel-2;
- USGS/NASA Landsat;
- Copernicus Sentinel-3 SLSTR;
- NASA/CNES SWOT;
- NASA SMAP;
- NASA/GFZ GRACE and GRACE-FO;
- NOAA multibeam sonar context.

Registry file:

`terra_hazards/data_sources.json`

The generator must never silently add facts from model memory. New sources require an explicit registry change with an official/public provenance URL.

## What is intentionally excluded

1. **Agentic EO Benchmark v1 B01-B10** is not training data. Those cases remain frozen external evaluation material.
2. EVE's own released training corpus/benchmark samples are not copied into this curriculum. EVE has already seen its own training mixture, so using it as our comparison curriculum would create an unfair leakage advantage.
3. No private data, personal tracking data, addresses tied to individuals, credentials or restricted datasets.
4. No synthetic environmental discovery is labelled as observation.
5. No hidden chain-of-thought is stored or requested.

## Dataset structure

The builder writes JSONL examples with:

- `id`
- `split` (`train`, `validation`, `holdout`)
- `group_key`
- `task`
- `messages` (system/user/assistant SFT-compatible messages)
- `expected_capabilities`
- `provenance`
- `safety_tags`

The answer is intentionally concise and observable. It contains the expected scientific boundary but not private reasoning traces.

## Split policy

Variants from the same logical source/task group stay in one split to reduce near-duplicate leakage.

The frozen B01-B10 benchmark is a **second external holdout** and must never be generated into this dataset.

For a publishable experiment:

1. record the pre-curriculum baseline;
2. train/adapt only on `train`;
3. tune implementation choices only on `validation`;
4. report `holdout` exactly once for the final run;
5. re-run frozen B01-B10 as the external benchmark;
6. retain all failures, not only successful examples.

## Important training honesty

This v1 dataset is intentionally modest. It can be useful for:

- tool-routing imitation;
- prompt/policy refinement;
- small adapter/LoRA experiments;
- regression tests;
- evaluating whether an agent learns safer EO behaviour.

It is **not large enough to claim a meaningful new 24B foundation model**. Any statement such as "we trained EVE" must specify the exact adaptation method, number of samples, steps, checkpoint/adapter hash and measured before/after result.

## Terra vs EVE distinction

The current Terra Agentic EO system uses hosted OpenAI model inference plus deterministic tools. We cannot directly retrain the hidden foundation weights of that hosted model from this repository. For Terra, "learning" in this experiment means measurable improvements to the agent policy, prompts, tool routing, registries and deterministic checks unless a separately supported fine-tuning endpoint is explicitly used.

For EVE-Instruct, weight/adaptor training is possible only when an open checkpoint is run in an environment we control. If we use the official EVE hosted GUI/API, treat it as inference-only unless ESA explicitly exposes a training endpoint.

Therefore the comparison report must separate:

- untouched baseline model;
- tool/prompt adapted system;
- any actual weight/LoRA-adapted checkpoint.

Never merge those categories into one score.

## Cloud/L4 policy

The user device does not need to store EVE weights.

Preferred order:

1. official EVE hosted API, if the user's access includes a documented inference API suitable for reproducible automation;
2. otherwise the official `eve-esa` checkpoint loaded on an ephemeral cloud GPU machine;
3. never require downloading model weights to the user's local disk.

A single NVIDIA L4 cannot host the full BF16 EVE-Instruct 24B model (~55 GB VRAM requirement). The comparison may use the official quantized `eve-esa/EVE-Instruct-GGUF-Q4_K_M` (~14.3 GB) on the cloud L4, but the report must label that exact quantized configuration rather than calling it the full BF16 configuration.

## Build

```bash
python scripts/build_agentic_eo_public_good_dataset.py \
  --registry terra_hazards/data_sources.json \
  --seed datasets/agentic-eo-public-good-v1/seed.jsonl \
  --output-dir datasets/agentic-eo-public-good-v1/generated
```

The builder writes deterministic JSONL and `manifest.json` with counts and SHA-256 hashes.

## Success criterion

The most valuable result is not a higher single score. It is a reproducible list of:

- what each system consistently gets right;
- what it gets wrong;
- whether errors are factual, tool-routing, provenance, uncertainty or recovery errors;
- what engineering or training change is justified by the evidence;
- whether that change improves unseen holdout cases without degrading scientific caution.
