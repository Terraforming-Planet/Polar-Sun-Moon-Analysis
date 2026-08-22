from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.run_agentic_eo_benchmark import (
    _completed_tools,
    _evaluate_case,
    _load_config,
    _score,
    _validate_config,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = REPO_ROOT / "config" / "agentic-eo-benchmark-v1.json"


def test_benchmark_v1_has_exactly_ten_unique_cases() -> None:
    config = _load_config(CONFIG_PATH)
    _validate_config(config)
    cases = config["cases"]
    assert len(cases) == 10
    assert len({case["id"] for case in cases}) == 10


def test_benchmark_covers_core_esa_agentic_eo_behaviours() -> None:
    config = _load_config(CONFIG_PATH)
    categories = {case["category"] for case in config["cases"]}
    assert {
        "evidence_verification",
        "scientific_claim_safety",
        "source_selection",
        "deterministic_calculation",
        "evaluation_provenance",
    }.issubset(categories)

    serialized = json.dumps(config, ensure_ascii=False)
    for expected in (
        "Sentinel-1",
        "Sentinel-2",
        "Landsat",
        "SWOT",
        "SMAP",
        "GRACE",
        "Sentinel-3",
        "Vistula TEST 014",
        "stream-gibs-20260820",
    ):
        assert expected in serialized


def test_completed_tools_requires_successful_tool_end() -> None:
    trace = {
        "events": [
            {"event": "tool_start", "tool": "consult_eo_source_scout"},
            {
                "event": "tool_end",
                "tool": "consult_eo_source_scout",
                "status": "success",
            },
            {"event": "tool_end", "tool": "failed_tool", "status": "failure"},
        ]
    }
    assert _completed_tools(trace) == {"consult_eo_source_scout"}


def test_evaluator_scores_routing_sections_terms_and_public_safety() -> None:
    case = {
        "required_tools": ["consult_eo_source_scout"],
        "required_terms_all": ["Sentinel-1"],
        "required_any_groups": [["SAR", "radar"]],
    }
    answer = """Research question
Flood mapping under cloud.
Tool/agent actions
Consulted the source specialist.
Evidence
Sentinel-1 SAR is registry-backed.
Uncertainty
Radar backscatter is not direct water depth.
Recommended next checks
Compare matched acquisitions.
"""
    trace = {
        "events": [
            {
                "event": "tool_end",
                "tool": "consult_eo_source_scout",
                "status": "success",
            }
        ]
    }
    sections = [
        "Research question",
        "Tool/agent actions",
        "Evidence",
        "Uncertainty",
        "Recommended next checks",
    ]
    checks = _evaluate_case(case, answer, trace, sections)
    passed, total, percent = _score(checks)
    assert passed == total
    assert percent == 100.0


def test_evaluator_rejects_missing_tool_and_secret_marker() -> None:
    case = {
        "required_tools": ["consult_evidence_verifier"],
        "required_terms_all": [],
        "required_any_groups": [],
    }
    answer = "Authorization: Bearer example"
    checks = _evaluate_case(case, answer, {"events": []}, [])
    by_name = {item["name"]: item for item in checks}
    assert by_name["tool:consult_evidence_verifier"]["passed"] is False
    assert by_name["public_trace_safety"]["passed"] is False


def test_validate_config_rejects_wrong_case_count() -> None:
    config = _load_config(CONFIG_PATH)
    config["cases"] = config["cases"][:-1]
    with pytest.raises(ValueError, match="exactly 10"):
        _validate_config(config)
