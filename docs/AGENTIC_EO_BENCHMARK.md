# Agentic EO Benchmark v1

This benchmark is a small public evaluation harness for the Terra Observation multi-agent Earth-observation coordinator.

It contains exactly **10 live research cases** designed to exercise observable behaviours relevant to reliable agentic EO workflows:

- source selection from the controlled official/public EO registry,
- routing to the EO Source Scout,
- routing to the EO Evidence Verifier,
- deterministic mapped-area calculation,
- provenance-aware answers,
- explicit uncertainty,
- refusal to upgrade hypotheses or training metrics into environmental findings,
- separation of mapped-area change from water-volume change and physical cause,
- public execution traces without chain-of-thought or credentials.

## Cases

| ID | Focus | Expected observable behaviour |
| --- | --- | --- |
| B01 | Vistula TEST 014 scope | Both specialists; preserve non-claim status and select follow-up EO sources |
| B02 | Causal challenge | Evidence verifier; reject unsupported blocked-flow/water-loss causation |
| B03 | Flood mapping under cloud | Source Scout; select Sentinel-1 SAR and state limitations |
| B04 | 1980s-to-present river record | Source Scout; distinguish Landsat historical record from newer Sentinel context |
| B05 | Water-surface elevation | Source Scout; select SWOT and preserve bathymetry/volume limitation |
| B06 | Surface soil moisture | Source Scout; select SMAP and distinguish shallow surface moisture from deep groundwater |
| B07 | Terrestrial water storage | Source Scout; select GRACE/GRACE-FO and preserve regional-scale limitation |
| B08 | Land-surface temperature | Source Scout; select Sentinel-3 SLSTR and preserve opaque-cloud limitation |
| B09 | Mapped-area calculation | Deterministic calculation tool; compute 10.0→7.5 km² without inferring volume/cause |
| B10 | Training is not ground truth | Evidence verifier; preserve published L4 training/evaluation claim boundaries |

## Scoring

The runner uses deterministic, inspectable checks. It does **not** use a second LLM to grade the first LLM.

Each case receives assertions for:

1. non-empty successful completion,
2. required successful tool/agent boundaries in the public trace,
3. the five coordinator answer sections,
4. case-specific facts or registry-backed mission names,
5. case-specific uncertainty/safety language,
6. absence of secret/private-reasoning markers in the public answer and trace.

The default live gate is **90% observable assertion pass rate**.

A case is also marked `strict_pass=true` only when every assertion in that case passes.

## Scientific boundary

This is an **agent-system behaviour benchmark**, not an environmental ground-truth benchmark.

A high score demonstrates that the system followed the tested routing, provenance and scientific-safety behaviours on these ten prompts. It does **not** establish that satellite-derived environmental conclusions are correct, and it does not replace independent measurements, domain validation, peer review or a larger benchmark suite.

## Run locally

```bash
export OPENAI_API_KEY="..."
python scripts/run_agentic_eo_benchmark.py \
  --config config/agentic-eo-benchmark-v1.json \
  --json-output benchmark-artifacts/agentic-eo-benchmark-v1.json \
  --markdown-output benchmark-artifacts/agentic-eo-benchmark-v1.md \
  --fail-under 90
```

The repository workflow runs the same benchmark only on the dedicated benchmark pull-request branch. It uploads the result as a GitHub Actions artifact; it does not publish API credentials, tool arguments or private reasoning.
