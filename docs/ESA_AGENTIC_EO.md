# ESA Agentic EO provenance-first demonstration

This public demonstration uses the OpenAI Agents SDK in a manager-and-specialists pattern. The
**Terra Agentic EO Coordinator** plans and synthesizes the investigation. It must consult **EO
Source Scout** for source selection and **EO Evidence Verifier** for repository claim checks; both
specialists are exposed with the SDK agents-as-tools mechanism.

Source selection is deterministic and separate from environmental evidence. The scout searches
the controlled `terra_hazards/data_sources.json` catalogue. For a Vistula surface-water and river-
channel investigation it returns official/public records for Sentinel-1, Sentinel-2 and Landsat,
including agency, mission, instrument, access route, URL and limitations. A catalogue match means
that a source is suitable to investigate—it does not mean imagery was acquired or analysed, and
it is not an environmental finding. Any model suggestion outside the registry must be visibly
labelled non-registry; registry-backed sources are preferred.

Sentinel-1 supplies cloud- and illumination-independent C-band radar backscatter, while
Sentinel-2 supplies 10/20/60 m band-dependent MSI optical observations and Landsat supplies a
longer, sensor-dependent multispectral record. Together they support complementary classification,
cross-checking and long-baseline morphology analysis. Their measurements require acquisition,
seasonal, sensor and processing comparability. Radar backscatter is not water depth, optical
morphology is not hydrological cause, and mapped area is not volume. SWOT adds a different
measurement dimension when water-surface elevation or river slope is the question; volume still
requires bathymetry or a defensible area–elevation–volume relationship.

The evidence verifier deterministically reads Vistula TEST 014. Its authoritative flags remain
`environmental_finding_claim=false`, `water_loss_claim=false`, and `causal_claim=false`: TEST 014
establishes dataset integrity and temporal coverage, not water loss or a physical cause. Published
NVIDIA L4 metrics describe pipeline/training execution and are never environmental ground truth.

## Public trace and reproduction

The live runner records observable SDK boundaries only: agent names, tool names, success states,
high-level result item types, model/SDK metadata, timestamp and commit. It deliberately excludes
chain-of-thought, reasoning summaries, specialist prompts, tool arguments and outputs, environment
variables, credentials, and authorization data. It exits non-zero unless both specialist tool
consultations really completed and the three required sources came from provenance-complete
registry matches.

From the repository root, with dependencies installed and `OPENAI_API_KEY` set only in the
environment, run:

```bash
python scripts/run_agentic_eo_live.py \
  --case-id vistula-test-014 \
  --question "Using the repository evidence for Vistula TEST 014, state what is actually established, select the most suitable official/public EO sources for investigating possible surface-water or river-channel change, and recommend the next scientific checks. Do not infer a physical cause that the evidence does not establish." \
  --json-output docs/published/agentic-eo/vistula-test-014-live.json \
  --markdown-output docs/published/agentic-eo/vistula-test-014-live.md
```

The JSON and Markdown prove a real manager run, two observable specialist consultations,
deterministic verification, controlled source provenance, and reproducible runtime context. They
do not prove water loss, volume change, blockage, river change, or causation. Recommended matched-
season optical/radar scenes, discharge or gauge records, elevation/bathymetry evidence, hydraulic-
structure records and field checks remain future scientific work.

In agentic EO terms this demonstrates planning/orchestration, constrained tool use, multi-agent
collaboration, deterministic verification, uncertainty awareness, provenance and reproducibility.
The model explains the evidence; deterministic repository tools define what evidence and source
provenance actually exist.
