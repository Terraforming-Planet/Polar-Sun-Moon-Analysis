from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from agents import Agent, Runner
from agents.decorators import tool

REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_REGISTRY_PATH = REPO_ROOT / "terra_hazards" / "data_sources.json"

EVIDENCE_CASES = {
    "vistula-test-014": REPO_ROOT / "docs" / "evidence" / "test-014-vistula-real-data-context.json",
}

TRAINING_CONTEXTS = {
    "stream-gibs-20260820": (
        REPO_ROOT
        / "docs"
        / "published"
        / "training-runs"
        / "stream_gibs_20260820T013036Z"
        / "analysis.json"
    ),
}

DEFAULT_AGENT_MODEL = os.getenv("OPENAI_AGENT_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-5.6-luna"


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def search_eo_sources_data(phenomenon: str) -> list[dict[str, Any]]:
    """Return official/public EO sources whose phenomenon metadata matches a query."""
    registry = _load_json(SOURCE_REGISTRY_PATH)
    if not isinstance(registry, list):
        raise ValueError("EO source registry must contain a JSON list.")

    needle = phenomenon.strip().lower().replace("-", "_").replace(" ", "_")
    matches: list[dict[str, Any]] = []
    for source in registry:
        if not isinstance(source, dict):
            continue
        phenomena = source.get("phenomena", [])
        normalized = {str(item).lower().replace("-", "_").replace(" ", "_") for item in phenomena}
        if needle in normalized or any(needle in item or item in needle for item in normalized):
            matches.append(source)
    return matches


def load_evidence_case_data(case_id: str) -> dict[str, Any]:
    """Load one repository-backed evidence case by its stable public identifier."""
    path = EVIDENCE_CASES.get(case_id)
    if path is None:
        raise ValueError(f"Unknown evidence case: {case_id}")
    payload = _load_json(path)
    if not isinstance(payload, dict):
        raise ValueError(f"Evidence case {case_id} must contain a JSON object.")
    return payload


def verify_evidence_case_data(case_id: str) -> dict[str, Any]:
    """Check whether an evidence case supports observation, finding and causal claims."""
    payload = load_evidence_case_data(case_id)
    integrity = payload.get("integrity", {}) if isinstance(payload.get("integrity"), dict) else {}
    provenance_fields = integrity.get("per_record_provenance_fields", [])
    if not isinstance(provenance_fields, list):
        provenance_fields = []

    environmental_finding = payload.get("environmental_finding_claim") is True
    water_loss = payload.get("water_loss_claim") is True
    causal = payload.get("causal_claim") is True

    return {
        "case_id": case_id,
        "evidence_class": payload.get("evidence_class", "UNKNOWN"),
        "record_count": integrity.get("record_count"),
        "accepted_count": integrity.get("accepted_count"),
        "provenance_field_count": len(provenance_fields),
        "environmental_finding_claim": environmental_finding,
        "water_loss_claim": water_loss,
        "causal_claim": causal,
        "safe_claims": {
            "dataset_integrity_and_temporal_coverage": bool(provenance_fields),
            "environmental_finding": environmental_finding,
            "water_loss": water_loss,
            "causal_mechanism": causal,
        },
        "limitations": payload.get("limitations", []),
    }


def load_training_context_data(context_id: str) -> dict[str, Any]:
    """Load a compact, claim-safe summary of a published training/evaluation context."""
    path = TRAINING_CONTEXTS.get(context_id)
    if path is None:
        raise ValueError(f"Unknown training context: {context_id}")
    payload = _load_json(path)
    if not isinstance(payload, dict):
        raise ValueError(f"Training context {context_id} must contain a JSON object.")

    cross_checks = payload.get("log_cross_checks", {})
    coverage = payload.get("coverage", {})
    if not isinstance(cross_checks, dict):
        cross_checks = {}
    if not isinstance(coverage, dict):
        coverage = {}

    return {
        "context_id": context_id,
        "run_id": payload.get("run_id"),
        "evidence_class": payload.get("evidence_class", "UNKNOWN"),
        "scientific_finding_claim": payload.get("scientific_finding_claim") is True,
        "ground_truth_claim": payload.get("ground_truth_claim") is True,
        "causal_environmental_claim": payload.get("causal_environmental_claim") is True,
        "streamed_windows": cross_checks.get("streamed_windows_jsonl_lines"),
        "unique_content_sha256": cross_checks.get("streamed_unique_content_sha256"),
        "failure_log_lines": cross_checks.get("failure_log_lines"),
        "earliest_observation_date": coverage.get("earliest_observation_date"),
        "latest_observation_date": coverage.get("latest_observation_date"),
        "findings": payload.get("findings", []),
    }


def compare_surface_water_areas_data(before_km2: float, after_km2: float) -> dict[str, Any]:
    """Calculate transparent mapped-area change without inferring volume or cause."""
    if before_km2 <= 0:
        raise ValueError("before_km2 must be greater than zero.")
    if after_km2 < 0:
        raise ValueError("after_km2 must be non-negative.")
    difference = after_km2 - before_km2
    percent = difference / before_km2 * 100.0
    return {
        "evidence_class": "DERIVED_VALUE",
        "before_km2": before_km2,
        "after_km2": after_km2,
        "difference_km2": round(difference, 6),
        "percent_change": round(percent, 6),
        "volume_change": (
            "UNKNOWN without bathymetry or a defensible area-elevation-volume relationship"
        ),
        "cause": "UNKNOWN from area change alone",
    }


@tool
def search_eo_sources(phenomenon: str) -> str:
    """Search the repository's official/public Earth-observation source registry for a phenomenon.

    Args:
        phenomenon: Scientific phenomenon such as surface_water, flood, ground_deformation,
            water_surface_elevation, active_fire, or surface_soil_moisture.
    """
    return json.dumps(search_eo_sources_data(phenomenon), ensure_ascii=False, sort_keys=True)


@tool
def load_evidence_case(case_id: str) -> str:
    """Load a real repository-backed EO evidence case with provenance and claim flags.

    Args:
        case_id: Stable case identifier. Currently supported: vistula-test-014.
    """
    return json.dumps(load_evidence_case_data(case_id), ensure_ascii=False, sort_keys=True)


@tool
def verify_evidence_case(case_id: str) -> str:
    """Verify which scientific claims a repository-backed evidence case actually supports.

    Args:
        case_id: Stable case identifier. Currently supported: vistula-test-014.
    """
    return json.dumps(verify_evidence_case_data(case_id), ensure_ascii=False, sort_keys=True)


@tool
def load_training_context(context_id: str) -> str:
    """Load a compact published NVIDIA L4 training/evaluation context.

    The tool preserves claim flags and never treats training as environmental ground truth.

    Args:
        context_id: Stable training context. Currently supported: stream-gibs-20260820.
    """
    return json.dumps(load_training_context_data(context_id), ensure_ascii=False, sort_keys=True)


@tool
def compare_surface_water_areas(before_km2: float, after_km2: float) -> str:
    """Calculate mapped surface-water area change while keeping volume and cause explicitly unknown.

    Args:
        before_km2: Earlier mapped water area in square kilometres.
        after_km2: Later mapped water area in square kilometres.
    """
    return json.dumps(
        compare_surface_water_areas_data(before_km2, after_km2),
        ensure_ascii=False,
        sort_keys=True,
    )


def build_agentic_eo_system(model: str | None = None) -> Agent:
    """Build a manager-style multi-agent EO research system."""
    resolved_model = model or DEFAULT_AGENT_MODEL

    source_scout = Agent(
        name="EO Source Scout",
        model=resolved_model,
        instructions=(
            "You are a conservative Earth-observation data-source specialist. "
            "Use search_eo_sources to identify suitable official/public sources. "
            "Explain sensor limitations and access requirements. Never claim that a documented "
            "catalogue entry means the project has already downloaded or analysed that product."
        ),
        tools=[search_eo_sources],
    )

    evidence_verifier = Agent(
        name="EO Evidence Verifier",
        model=resolved_model,
        instructions=(
            "You verify repository-backed Earth-observation evidence. For project cases, load the "
            "case and then verify its claim flags before making any scientific statement. Training "
            "or optimization metrics are not environmental ground truth. A visible morphology "
            "candidate is not proof of hydrological cause. If a claim flag is false, say clearly "
            "that the corresponding claim is not established."
        ),
        tools=[load_evidence_case, verify_evidence_case, load_training_context],
    )

    coordinator = Agent(
        name="Terra Agentic EO Coordinator",
        model=resolved_model,
        instructions=(
            "You coordinate scientific Earth-observation investigations. Decompose the user's "
            "question, ask the EO Source Scout which sensors/products fit the phenomenon, and ask "
            "the EO Evidence Verifier what the repository evidence actually supports when a known "
            "case is relevant. Use deterministic calculations for numeric mapped-area comparisons. "
            "Never invent observations, source IDs, dates, measurements, causes, confidence values "
            "or alerts. Separate OBSERVATION, DERIVED_VALUE, MODEL_ESTIMATE, HYPOTHESIS and "
            "UNKNOWN. Your final answer must contain: Research question; Tool/agent actions; "
            "Evidence; Uncertainty; Recommended next checks. State explicitly when the available "
            "evidence does not establish an environmental finding or causal mechanism."
        ),
        tools=[
            source_scout.as_tool(
                tool_name="consult_eo_source_scout",
                tool_description=(
                    "Ask a specialist to choose relevant official/public EO sensors and explain "
                    "their limitations for the research question."
                ),
                max_turns=4,
            ),
            evidence_verifier.as_tool(
                tool_name="consult_evidence_verifier",
                tool_description=(
                    "Ask a specialist to inspect repository-backed evidence, provenance, training "
                    "context and scientific claim flags."
                ),
                max_turns=5,
            ),
            compare_surface_water_areas,
        ],
    )
    return coordinator


def run_agentic_eo(question: str, *, model: str | None = None) -> str:
    """Run the manager agent against one EO research question."""
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required to run the Agentic EO coordinator.")
    result = Runner.run_sync(build_agentic_eo_system(model), question, max_turns=8)
    return str(result.final_output)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the Terra multi-agent Earth-observation research coordinator."
    )
    parser.add_argument("question", help="Earth-observation research question to investigate.")
    parser.add_argument("--model", default=None, help="Optional OpenAI model override.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    print(run_agentic_eo(args.question, model=args.model))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
