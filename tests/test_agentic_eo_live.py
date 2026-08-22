from __future__ import annotations

import pytest

from scripts.run_agentic_eo_live import build_live_report, validate_live_report

ANSWER = """Registry-backed recommendations
Sentinel-1, Sentinel-2, and Landsat are controlled-registry matches.
Additional non-registry suggestions: none
"""


def complete_trace() -> dict[str, object]:
    return {
        "sdk": "openai-agents",
        "model": "offline-test-model",
        "starting_agent": "Terra Agentic EO Coordinator",
        "final_agent": "Terra Agentic EO Coordinator",
        "result_item_types": ["tool_call_item", "tool_call_output_item"],
        "events": [
            {
                "event": "tool_end",
                "agent": "Terra Agentic EO Coordinator",
                "tool": "consult_eo_source_scout",
                "status": "success",
            },
            {
                "event": "tool_end",
                "agent": "Terra Agentic EO Coordinator",
                "tool": "consult_evidence_verifier",
                "status": "success",
            },
        ],
    }


def test_live_report_serializer_is_offline_and_structured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("scripts.run_agentic_eo_live.git_sha", lambda: "abc123")
    report = build_live_report(
        case_id="vistula-test-014",
        question="What is established?",
        model="offline-test-model",
        answer=ANSWER,
        trace=complete_trace(),
        timestamp="2026-08-22T00:00:00+00:00",
    )
    assert report["research_question"] == "What is established?"
    assert report["run_metadata"]["git_sha"] == "abc123"
    assert report["deterministic_registry_selection"]["required_source_presence"] == {
        "Sentinel-1": True,
        "Sentinel-2": True,
        "Landsat": True,
    }


def test_report_rejects_missing_real_specialist_consultation() -> None:
    trace = complete_trace()
    trace["events"] = trace["events"][:1]  # type: ignore[index]
    with pytest.raises(ValueError, match="consult_evidence_verifier"):
        build_live_report(
            case_id="vistula-test-014",
            question="What is established?",
            model="offline-test-model",
            answer=ANSWER,
            trace=trace,
        )


def test_model_text_cannot_substitute_for_registry_evidence() -> None:
    report = build_live_report(
        case_id="vistula-test-014",
        question="What is established?",
        model="offline-test-model",
        answer=ANSWER,
        trace=complete_trace(),
    )
    report["deterministic_registry_selection"]["matches"] = []
    with pytest.raises(ValueError, match="controlled-registry sources absent"):
        validate_live_report(report)


def test_unlabelled_model_recommendations_fail_provenance_validation() -> None:
    with pytest.raises(ValueError, match="registry-backed recommendations"):
        build_live_report(
            case_id="vistula-test-014",
            question="What is established?",
            model="offline-test-model",
            answer="Use Sentinel-1, Sentinel-2 and Landsat.",
            trace=complete_trace(),
        )
