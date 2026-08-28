from __future__ import annotations

from typing import Any

from .training004_sources.common import canonical_hash


def terra_evidence_view(package: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "schema",
        "question_or_mission_id",
        "aoi",
        "time",
        "season",
        "selected_sources",
        "rejected_sources",
        "quality",
        "derived_metrics",
        "terrain_hydrology",
        "evidence_classes",
        "uncertainty_and_limitations",
        "missing_evidence",
        "recommended_next_observation",
        "provenance_hash",
    }
    return {key: package[key] for key in allowed if key in package}


def eve_parity_status(endpoint: str | None) -> dict[str, Any]:
    if not endpoint:
        return {
            "system": "EVE-Instruct + Terra MCP parity harness",
            "status": "BLOCKED",
            "reason": "No real configured EVE endpoint/runtime; no private endpoint was emulated.",
            "executed": False,
        }
    return {
        "system": "EVE-Instruct + Terra MCP parity harness",
        "status": "CONFIGURED_NOT_EXECUTED",
        "endpoint_hash": canonical_hash({"endpoint": endpoint}),
        "executed": False,
    }


def test001_holdout_status(*, training_complete: bool, requested: bool) -> dict[str, Any]:
    if not requested:
        return {"status": "NOT_RUN", "isolation": "PASS", "reason": "holdout not requested"}
    if not training_complete:
        return {
            "status": "BLOCKED",
            "isolation": "PASS",
            "reason": "relevant training stage did not complete",
        }
    return {
        "status": "BLOCKED",
        "isolation": "PASS",
        "reason": (
            "independent scientific TEST 001 raster workflow is not configured; "
            "repository report remains AUTHOR_FIELD_OBSERVATION"
        ),
    }


def deterministic_evaluate(packages: list[dict[str, Any]]) -> dict[str, Any]:
    failures: list[dict[str, str]] = []
    for package in packages:
        pack_id = str(package.get("question_or_mission_id", "UNKNOWN"))
        for field in ("provenance_hash", "evidence_classes", "uncertainty_and_limitations"):
            if not package.get(field):
                failures.append(
                    {
                        "pack_id": pack_id,
                        "error_class": "provenance"
                        if field == "provenance_hash"
                        else "uncertainty",
                        "failure": f"missing_{field}",
                    }
                )
    return {
        "schema": "terra-training-004-deterministic-evaluation-v1",
        "llm_judge": False,
        "packages": len(packages),
        "failures": failures,
        "passed": not failures,
        "environmental_ground_truth_score": None,
    }
