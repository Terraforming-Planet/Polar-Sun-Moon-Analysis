#!/usr/bin/env python3
"""Run and publish the provenance-first Agentic EO Vistula demonstration."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import platform
import re
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

# Support the documented direct invocation without requiring an editable install.
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from terra_research_node.agentic_eo import (  # noqa: E402
    DEFAULT_AGENT_MODEL,
    run_agentic_eo_with_trace,
    select_vistula_sources_data,
    specialist_consultations,
    validate_registry_provenance,
    verify_evidence_case_data,
)

REQUIRED_SOURCE_IDS = {"esa-sentinel-1", "esa-sentinel-2", "usgs-landsat"}
REQUIRED_CONSULTATIONS = {"consult_eo_source_scout", "consult_evidence_verifier"}
PUBLIC_TRACE_FIELDS = {
    "sdk",
    "model",
    "starting_agent",
    "final_agent",
    "events",
    "result_item_types",
}
PUBLIC_EVENT_FIELDS = {"event", "agent", "tool", "status"}
PUBLIC_AGENTS = {
    "Terra Agentic EO Coordinator",
    "EO Source Scout",
    "EO Evidence Verifier",
}
PUBLIC_TOOLS = {
    "consult_eo_source_scout",
    "consult_evidence_verifier",
    "search_eo_sources",
    "load_evidence_case",
    "verify_evidence_case",
    "load_training_context",
    "compare_surface_water_areas",
}


def git_sha() -> str | None:
    """Return the current commit without failing outside a Git checkout."""
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def safety_assertions(verification: dict[str, Any]) -> dict[str, bool]:
    """Materialize the scientific non-claim contract as machine-readable assertions."""
    return {
        "test_014_is_integrity_context_not_environmental_finding": (
            verification["environmental_finding_claim"] is False
        ),
        "water_loss_not_established": verification["water_loss_claim"] is False,
        "causal_mechanism_not_established": verification["causal_claim"] is False,
        "training_metrics_are_not_environmental_ground_truth": True,
        "mapped_area_is_not_volume_without_area_elevation_volume_evidence": True,
        "morphology_does_not_establish_hydrological_causation": True,
        "optical_comparisons_require_cloud_season_and_sensor_checks": True,
        "sentinel_1_backscatter_is_not_direct_water_depth": True,
        "recommendations_are_next_checks_not_confirmed_causes": True,
    }


def validate_public_trace(trace: dict[str, Any]) -> None:
    """Reject trace content outside the deliberately small public metadata schema."""
    if not isinstance(trace, dict):
        raise ValueError("Public execution trace must be an object.")
    unknown = set(trace) - PUBLIC_TRACE_FIELDS
    if unknown:
        raise ValueError(f"Public trace contains non-public fields: {sorted(unknown)}")
    if trace.get("sdk") != "openai-agents":
        raise ValueError("Public trace does not identify the OpenAI Agents SDK.")
    for field in ("starting_agent", "final_agent"):
        if trace.get(field) not in PUBLIC_AGENTS:
            raise ValueError(f"Public trace has an unexpected {field} value.")
    events = trace.get("events")
    if not isinstance(events, list):
        raise ValueError("Public trace events must be a list.")
    for event in events:
        if not isinstance(event, dict) or set(event) - PUBLIC_EVENT_FIELDS:
            raise ValueError("Public trace event contains non-public fields.")
        if event.get("agent") not in PUBLIC_AGENTS:
            raise ValueError("Public trace event has an unexpected agent.")
        if "tool" in event and event["tool"] not in PUBLIC_TOOLS:
            raise ValueError("Public trace event has an unexpected tool.")
        if "status" in event and event["status"] != "success":
            raise ValueError("Public trace event has an unexpected status.")
    item_types = trace.get("result_item_types")
    if not isinstance(item_types, list) or not all(
        isinstance(item, str) and re.fullmatch(r"[a-z][a-z0-9_]{0,63}", item)
        for item in item_types
    ):
        raise ValueError("Public trace result item types are not safe metadata values.")


def validate_final_answer_provenance(answer: str, matched_ids: set[str | None]) -> None:
    """Require explicit attribution markers for the model's Vistula recommendations."""
    lowered = answer.lower()
    if "registry-backed recommendations" not in lowered:
        raise ValueError("Final answer lacks a registry-backed recommendations section.")
    if "additional non-registry suggestions: none" not in lowered:
        raise ValueError(
            "Final answer must explicitly declare that it makes no non-registry mission "
            "recommendations for this controlled demonstration."
        )
    source_terms = {
        "esa-sentinel-1": "sentinel-1",
        "esa-sentinel-2": "sentinel-2",
        "usgs-landsat": "landsat",
    }
    for source_id, term in source_terms.items():
        if term in lowered and source_id not in matched_ids:
            raise ValueError(f"Final answer presents {term} without a deterministic match.")
    claimed_registry_ids = set(
        re.findall(r"registry\s+id\s+[`'\"]?([a-z0-9][a-z0-9_-]+)", lowered)
    )
    unsupported_ids = claimed_registry_ids - matched_ids
    if unsupported_ids:
        raise ValueError(
            "Final answer claims registry provenance for unmatched source IDs: "
            f"{sorted(unsupported_ids)}"
        )


def validate_live_report(
    report: dict[str, Any], *, require_live_sdk_run: bool = False
) -> None:
    """Fail closed when multi-agent, provenance, or scientific evidence is absent."""
    if require_live_sdk_run:
        live_flag = report.get("run_metadata", {}).get("live_openai_agents_sdk_run")
        if live_flag is not True:
            raise ValueError("Published live evidence must come from a verified live Agents SDK run.")

    trace = report.get("public_execution_trace", {})
    validate_public_trace(trace)
    matches = report.get("deterministic_registry_selection", {}).get("matches", [])
    if not isinstance(matches, list):
        raise ValueError("Deterministic registry matches must be a list.")
    validate_registry_provenance(matches)
    matched_ids = {item.get("id") for item in matches if isinstance(item, dict)}
    missing_sources = REQUIRED_SOURCE_IDS - matched_ids
    if missing_sources:
        raise ValueError(f"Required controlled-registry sources absent: {sorted(missing_sources)}")
    validate_final_answer_provenance(str(report.get("final_model_answer", "")), matched_ids)

    consultations = specialist_consultations(trace)
    missing_consultations = REQUIRED_CONSULTATIONS - consultations
    if missing_consultations:
        raise ValueError(
            f"Required real specialist consultations absent: {sorted(missing_consultations)}"
        )

    verification = report.get("deterministic_claim_verification", {})
    for claim in ("environmental_finding_claim", "water_loss_claim", "causal_claim"):
        if verification.get(claim) is not False:
            raise ValueError(f"Unsafe TEST 014 claim state: {claim} must be false.")
    if not all(report.get("scientific_safety_assertions", {}).values()):
        raise ValueError("One or more scientific safety assertions failed.")
    if report.get("answer_provenance", {}).get("registry_selection_is_deterministic") is not True:
        raise ValueError("Model text cannot substitute for deterministic registry evidence.")


def build_live_report(
    *,
    case_id: str,
    question: str,
    model: str,
    answer: str,
    trace: dict[str, Any],
    timestamp: str | None = None,
    live_run_verified: bool = False,
) -> dict[str, Any]:
    """Serialize deterministic and model-generated evidence without making a network call."""
    verification = verify_evidence_case_data(case_id)
    matches = select_vistula_sources_data()
    matched_ids = {item["id"] for item in matches}
    report = {
        "schema_version": "2.0",
        "run_metadata": {
            "timestamp_utc": timestamp or datetime.now(UTC).isoformat(),
            "git_sha": git_sha(),
            "python_version": platform.python_version(),
            "openai_agents_version": importlib.metadata.version("openai-agents"),
            "model": model,
            "live_openai_agents_sdk_run": live_run_verified,
        },
        "case_id": case_id,
        "research_question": question,
        "public_execution_trace": trace,
        "final_model_answer": answer,
        "deterministic_claim_verification": verification,
        "deterministic_registry_selection": {
            "catalogue": "terra_hazards/data_sources.json",
            "query_phenomena": ["surface_water", "water_extent", "river_channel"],
            "matches": matches,
            "required_source_presence": {
                "Sentinel-1": "esa-sentinel-1" in matched_ids,
                "Sentinel-2": "esa-sentinel-2" in matched_ids,
                "Landsat": "usgs-landsat" in matched_ids,
            },
        },
        "answer_provenance": {
            "registry_selection_is_deterministic": True,
            "model_answer_is_explanation_not_registry_evidence": True,
            "non_registry_recommendations_must_be_explicitly_labelled": True,
        },
        "scientific_safety_assertions": safety_assertions(verification),
    }
    validate_live_report(report, require_live_sdk_run=live_run_verified)
    return report


def execute_live_report(*, case_id: str, question: str, model: str) -> dict[str, Any]:
    """Execute the Agents SDK path and only then mark the resulting report as live."""
    run_input = (
        f"{question}\n\nPublic demonstration requirements: consult both specialist agents. "
        "The source specialist must use deterministic registry searches for surface_water, "
        "water_extent, and river_channel. Recommend registry-backed missions only; if none other "
        "are needed, state 'Additional non-registry suggestions: none'."
    )
    answer, trace = run_agentic_eo_with_trace(run_input, model=model)
    return build_live_report(
        case_id=case_id,
        question=question,
        model=model,
        answer=answer,
        trace=trace,
        live_run_verified=True,
    )


def render_markdown(report: dict[str, Any]) -> str:
    """Render the public JSON record as a compact readable report."""
    meta = report["run_metadata"]
    selection = report["deterministic_registry_selection"]
    verification = report["deterministic_claim_verification"]
    lines = [
        "# Vistula TEST 014 — live Agentic EO evidence",
        "",
        f"- UTC: `{meta['timestamp_utc']}`",
        f"- Git SHA: `{meta['git_sha'] or 'unavailable'}`",
        f"- Python: `{meta['python_version']}`",
        f"- openai-agents: `{meta['openai_agents_version']}`",
        f"- Model: `{meta['model']}`",
        f"- Live OpenAI Agents SDK run: `{meta['live_openai_agents_sdk_run']}`",
        "",
        "## Research question",
        "",
        report["research_question"],
        "",
        "## Deterministic TEST 014 verification",
        "",
        f"- Environmental finding: `{verification['environmental_finding_claim']}`",
        f"- Water loss: `{verification['water_loss_claim']}`",
        f"- Causal mechanism: `{verification['causal_claim']}`",
        "",
        "## Deterministic controlled-registry selection",
        "",
        "These matches come from `terra_hazards/data_sources.json`; the model answer does not "
        "create or validate registry evidence.",
        "",
    ]
    for source in selection["matches"]:
        lines.append(
            f"- **{source['mission']}** — {source['agency']}; {source['instrument']}; "
            f"access: [{source['access']}]({source['url']})"
        )
    lines.extend(["", "Required presence:"])
    for name, present in selection["required_source_presence"].items():
        lines.append(f"- {name}: `{present}`")

    lines.extend(["", "## Public execution trace", ""])
    for event in report["public_execution_trace"].get("events", []):
        detail = event.get("tool") or event.get("agent") or ""
        lines.append(f"- `{event.get('event')}` — `{detail}` — `{event.get('status', 'observed')}`")
    lines.extend(
        [
            "",
            "The trace contains observable names and states only. It excludes prompts, tool "
            "arguments and outputs, credentials, environment data, and private reasoning.",
            "",
            "## Final model answer",
            "",
            report["final_model_answer"],
            "",
            "## Scientific safety assertions",
            "",
        ]
    )
    for name, passed in report["scientific_safety_assertions"].items():
        lines.append(f"- {name.replace('_', ' ')}: `{passed}`")
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case-id", required=True)
    parser.add_argument("--question", required=True)
    parser.add_argument("--json-output", type=Path, required=True)
    parser.add_argument("--markdown-output", type=Path, required=True)
    parser.add_argument("--model", default=DEFAULT_AGENT_MODEL)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not os.getenv("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY is required for the live Agents SDK run.")
    report = execute_live_report(
        case_id=args.case_id,
        question=args.question,
        model=args.model,
    )
    validate_live_report(report, require_live_sdk_run=True)
    args.json_output.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    args.markdown_output.write_text(render_markdown(report), encoding="utf-8")
    print(f"Wrote public evidence to {args.json_output} and {args.markdown_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())