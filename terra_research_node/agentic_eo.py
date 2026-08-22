from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from agents import Agent, RunHooks, Runner
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


def select_vistula_sources_data() -> list[dict[str, Any]]:
    """Select controlled-registry sources relevant to Vistula water/channel checks."""
    selected: dict[str, dict[str, Any]] = {}
    for phenomenon in ("surface_water", "water_extent", "river_channel"):
        for source in search_eo_sources_data(phenomenon):
            source_id = source.get("id")
            if isinstance(source_id, str):
                selected[source_id] = source
    return list(selected.values())


def validate_registry_provenance(matches: list[dict[str, Any]]) -> None:
    """Reject selections that cannot prove identity and official/public provenance."""
    required = {"id", "agency", "mission", "access", "url"}
    for source in matches:
        missing = sorted(field for field in required if not source.get(field))
        if missing:
            raise ValueError(
                f"Registry source {source.get('id', '<unknown>')} lacks provenance: {missing}"
            )


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
            "The search_eo_sources deterministic registry is the authoritative catalogue for "
            "named source recommendations in this demonstration. Search surface_water, "
            "water_extent and river_channel when those concepts are relevant. Prefer and name "
            "only returned registry sources. If an additional source is scientifically useful, "
            "label it explicitly as an additional non-registry suggestion. "
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
            "evidence does not establish an environmental finding or causal mechanism. For named "
            "mission recommendations, prefer the specialist's deterministic registry matches and "
            "use the heading 'Registry-backed recommendations'. Never imply model-memory knowledge "
            "came from that registry. Put any other mission under 'Additional non-registry "
            "suggestions' and label it non-registry. Keep source selection separate from findings."
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


class PublicTraceHooks(RunHooks[Any]):
    """Capture public tool boundaries without arguments, prompts, outputs or reasoning."""

    def __init__(self) -> None:
        self.events: list[dict[str, str]] = []

    async def on_agent_start(self, context: Any, agent: Agent[Any]) -> None:
        self.events.append({"event": "agent_start", "agent": agent.name})

    async def on_agent_end(self, context: Any, agent: Agent[Any], output: Any) -> None:
        self.events.append({"event": "agent_end", "agent": agent.name, "status": "success"})

    async def on_tool_start(self, context: Any, agent: Agent[Any], tool: Any) -> None:
        self.events.append(
            {"event": "tool_start", "agent": agent.name, "tool": str(tool.name)}
        )

    async def on_tool_end(
        self, context: Any, agent: Agent[Any], tool: Any, result: object
    ) -> None:
        self.events.append(
            {
                "event": "tool_end",
                "agent": agent.name,
                "tool": str(tool.name),
                "status": "success",
            }
        )


def build_public_trace(result: Any, hooks: PublicTraceHooks, model: str) -> dict[str, Any]:
    """Build a compact allow-listed trace from SDK lifecycle events and result item types."""
    return {
        "sdk": "openai-agents",
        "model": model,
        "starting_agent": "Terra Agentic EO Coordinator",
        "final_agent": result.last_agent.name,
        "events": hooks.events,
        "result_item_types": [str(getattr(item, "type", "unknown")) for item in result.new_items],
    }


def specialist_consultations(trace: dict[str, Any]) -> set[str]:
    """Return successfully completed observable specialist tool consultations."""
    return {
        str(event.get("tool"))
        for event in trace.get("events", [])
        if isinstance(event, dict)
        and event.get("event") == "tool_end"
        and event.get("status") == "success"
        and event.get("tool") in {"consult_eo_source_scout", "consult_evidence_verifier"}
    }


def run_agentic_eo_with_trace(
    question: str, *, model: str | None = None
) -> tuple[str, dict[str, Any]]:
    """Run the coordinator and return its public answer plus an allow-listed trace."""
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required to run the Agentic EO coordinator.")
    resolved_model = model or DEFAULT_AGENT_MODEL
    hooks = PublicTraceHooks()
    result = Runner.run_sync(
        build_agentic_eo_system(resolved_model), question, max_turns=8, hooks=hooks
    )
    return str(result.final_output), build_public_trace(result, hooks, resolved_model)


def run_agentic_eo(question: str, *, model: str | None = None) -> str:
    """Run the manager agent against one EO research question."""
    answer, _trace = run_agentic_eo_with_trace(question, model=model)
    return answer


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
