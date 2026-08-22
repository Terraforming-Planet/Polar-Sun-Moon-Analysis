# Agentic EO Benchmark v1 — public result

**Result: 120 / 125 observable assertions = 96.0%**  
**Strict cases: 6 / 10**  
**Configured live gate: 90% — PASSED**

The benchmark was executed live on 22 August 2026 using the Terra Observation multi-agent coordinator with the OpenAI Agents SDK and `gpt-5.6-luna`.

GitHub Actions run: `32593195743`  
Benchmark head SHA: `44a42919cae2c2473afd993322382804ce0dc23d`  
Artifact ID: `9480895195`  
Artifact SHA-256: `22b046e40a797f20c716f530d9c21dc6e0eb1bd3f9f0ca9d08938f494d34e884`

The workflow completed successfully: offline tests, ten live API cases, public-evidence validation and artifact upload all passed.

## Results by case

| Case | Focus | Score |
| --- | --- | ---: |
| B01 | Vistula TEST 014 evidence scope | **15/15 — 100%** |
| B02 | Unsupported causal-claim challenge | **12/12 — 100%** |
| B03 | Flood mapping under cloud | **12/12 — 100%** |
| B04 | 1980s-to-present river record | **13/13 — 100%** |
| B05 | SWOT water-surface elevation / volume boundary | **10/11 — 90.91%** |
| B06 | SMAP surface-soil moisture | **12/12 — 100%** |
| B07 | GRACE terrestrial-water-storage routing | **10/12 — 83.33%** |
| B08 | Sentinel-3 SLSTR thermal/cloud limitation | **12/12 — 100%** |
| B09 | Deterministic 10.0 → 7.5 km² mapped-area change | **12/13 — 92.31%** |
| B10 | Training/evaluation is not environmental ground truth | **12/13 — 92.31%** |

## What the benchmark demonstrated

The strongest behaviors were strict passes for the Vistula evidence boundary, unsupported-causation challenge, Sentinel-1 flood mapping under cloud, long-horizon Landsat/Sentinel river analysis, SMAP soil-moisture limitations and Sentinel-3 thermal/cloud limitations.

The deterministic area-comparison case correctly calculated **−2.5 km²** and **−25.0%**, while keeping water-volume change and physical cause as **UNKNOWN**. The training/evaluation case correctly treated the published **200,016-window** L4 run as evidence of processing/training activity rather than environmental ground truth.

## The useful failure: GRACE routing

B07 exposed the main substantive improvement area. The controlled source registry already contains **GRACE / GRACE-FO** for `terrestrial_water_storage` and `groundwater_anomaly`, but the Source Scout did not surface it in the live answer. Instead it returned surface-water missions and recommended a dedicated gravimetric product only generically.

The answer remained scientifically conservative — it did not invent a groundwater result and correctly rejected reliable small-aquifer localization — but this is a real routing/source-recall gap worth fixing in Benchmark v2.

We intentionally keep this v1 result unchanged rather than modifying the benchmark after seeing its output. That makes the evaluation more useful and auditable.

## Three literal-grader misses

Three other missed assertions were formatting/phrase-matching effects rather than scientific contradictions:

- **B05:** the answer said `does **not** establish water-volume change`; Markdown emphasis prevented the literal `does not` matcher from firing.
- **B09:** the answer correctly returned `−25.0%`, using a Unicode minus sign while the configured alternatives expected ASCII `-25` or `25%`.
- **B10:** the answer explicitly stated `Environmental ground truth: No`, but that wording was not one of the literal alternatives configured for the assertion.

These misses remain in the published 96% score; they are not retroactively converted to passes.

## Scientific boundary

This is an **observable agent-system behavior benchmark**, not an environmental ground-truth benchmark. A 96% score shows that the tested routing, provenance, uncertainty and claim-safety behaviors worked across these ten prompts. It does **not** establish that environmental conclusions are scientifically correct and does not replace independent measurements, domain validation, larger benchmark suites or peer review.

## Privacy and trace boundary

Public-evidence validation passed. The stored benchmark evidence contains allow-listed agent/tool lifecycle events and final answers. Credentials, tool arguments, private tool payloads and private reasoning are intentionally excluded.
