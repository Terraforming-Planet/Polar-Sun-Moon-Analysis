# EVE-Instruct vs Terra Agentic EO — comparative benchmark design

This document defines a planned reproducible comparison between the Terra Observation System's existing Agentic EO coordinator and ESA Φ-lab's public EVE-Instruct model on an NVIDIA L4.

## Why this benchmark exists

Terra already has a frozen 10-case Agentic EO benchmark covering EO source selection, evidence verification, scientific uncertainty, deterministic area calculations and claim safety. The comparative benchmark reuses those exact questions rather than creating a new test after seeing EVE outputs.

The purpose is diagnosis, not marketing. A useful outcome is a clear list of strengths, failures and improvements for reliable Agentic AI in Earth Observation.

## Systems

### Terra Agentic EO Coordinator

The existing repository-backed multi-agent system using the Terra EO Source Scout, EO Evidence Verifier and deterministic calculation tools.

### EVE-Instruct + Terra parity harness

The public EVE-Instruct model is run locally through an OpenAI-compatible inference server and receives a strictly allow-listed interface to the same deterministic Terra source/evidence functions used in the comparison.

This label matters: the parity harness is not the same thing as ESA's complete production agent stack. Results from this track must not be presented as a general benchmark of ESA's internal systems.

A separate optional track may later run the public `eve-esa/agents` LangGraph package if it can be reproduced locally without private ESA services.

## Frozen cases

The comparison references `config/agentic-eo-benchmark-v1.json` and keeps B01-B10 unchanged:

1. Vistula TEST 014 evidence scope
2. unsupported causal claim challenge
3. flood mapping under cloud
4. long-term Landsat/Sentinel river record
5. SWOT water-surface elevation and volume boundary
6. SMAP surface-soil moisture
7. GRACE/GRACE-FO terrestrial-water-storage routing
8. Sentinel-3 SLSTR thermal/cloud limitation
9. deterministic 10.0 → 7.5 km² area calculation
10. training/evaluation is not environmental ground truth

## Fairness rules

Both systems must receive the same question text, source registry, evidence, calculator, output structure and turn budget. Neither model sees the scorer's answer keys. Network browsing is disabled in the parity track.

Different implementation-specific tool names are normalized into logical capabilities such as source selection, evidence verification and deterministic calculation.

## Metrics

Results are reported as separate dimensions rather than compressed into a misleading single marketing score:

- observable assertion pass rate;
- strict-case pass rate;
- logical tool-routing success;
- provenance and scientific-claim safety;
- recovery behavior after controlled tool failures;
- latency, turns and tool-call count;
- token usage when available;
- local EVE GPU VRAM/utilization/power telemetry when available.

The benchmark does not use another LLM as the grader.

## NVIDIA L4

Preferred EVE model for the first local run:

`eve-esa/EVE-Instruct-GGUF-Q4_K_M`

Public source:
https://huggingface.co/eve-esa/EVE-Instruct-GGUF-Q4_K_M

The model is served locally with a tool-calling-capable OpenAI-compatible runtime. The run records the exact GPU, driver, runtime and launch configuration. Model weights and caches are never committed to Git.

## Repetitions

A one-repetition smoke run verifies compatibility. A publishable comparison should use three repetitions per case/system when practical and preserve all repetitions. Best-run cherry-picking is forbidden.

If equal repetition counts are impossible because one side uses a paid remote API, the difference must be stated explicitly.

## Scientific limits

A high score does not establish environmental ground truth. It demonstrates only that a system met the tested observable routing, provenance and safety behaviors on this frozen case set.

The public report must not claim "Terra beats ESA" or any equivalent organizational ranking. It should instead show exactly where each tested configuration succeeded or failed and what should be improved next.

## Public references

- EVE organization: https://github.com/eve-esa
- EVE-Instruct: https://huggingface.co/eve-esa/EVE-Instruct
- EVE public agents: https://github.com/eve-esa/agents
- EVE MCP registry: https://github.com/eve-esa/mcp-tool-registry
- EVE evalkit: https://github.com/eve-esa/evalkit

Implementation requirements and acceptance criteria are in `CODEX_EVE_TERRA_AGENTIC_EO_L4_BENCHMARK.md`.
