from __future__ import annotations

import json
from typing import Any

import pytest

from terra_research_node import openai_summary
from terra_research_node.openai_summary import EvidenceExplainerError


class _FakeResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self._payload


def test_build_explainer_input_preserves_evidence_and_causal_guardrail() -> None:
    finding = {
        "analysis_mode": "flow_connectivity_candidate",
        "evidence_class": "DERIVED_VALUE",
        "metrics": {"water_area_change_percent": -31.0},
        "causal_claim": False,
    }

    prompt = openai_summary.build_explainer_input(finding)

    assert "DERIVED_VALUE" in prompt
    assert "flow_connectivity_candidate" in prompt
    assert '"causal_claim": false' in prompt
    assert "not proof of a blockage" in prompt


def test_evidence_bundle_includes_l4_and_real_data_test_context() -> None:
    bundle = openai_summary.build_evidence_bundle(
        {
            "aoi_id": "lake_kuchnia",
            "analysis_mode": "surface_water_change",
            "evidence_class": "DERIVED_VALUE",
        },
        training_context=[
            {
                "run_id": "stream_gibs_20260820T013036Z",
                "gpu": "NVIDIA L4",
                "remote_windows_trained": 200016,
                "scientific_finding_claim": False,
            }
        ],
        test_context=[
            {
                "test_id": "water-change-001",
                "source": "USGS Landsat",
                "matched_season": True,
                "causal_claim": False,
            }
        ],
    )

    assert bundle["schema"] == "terra-openai-evidence-bundle-v1"
    assert bundle["primary_finding"]["aoi_id"] == "lake_kuchnia"
    assert bundle["l4_training_and_evaluation"][0]["remote_windows_trained"] == 200016
    assert bundle["l4_training_and_evaluation"][0]["scientific_finding_claim"] is False
    assert bundle["real_data_tests"][0]["source"] == "USGS Landsat"
    assert bundle["real_data_tests"][0]["causal_claim"] is False


def test_explainer_refuses_to_fake_result_without_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(EvidenceExplainerError, match="OPENAI_API_KEY"):
        openai_summary.explain_evidence({"evidence_class": "OBSERVATION"})


def test_explainer_calls_responses_api_with_grounded_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    explanation = {
        "summary": "The compared satellite evidence shows a reduction in mapped surface water.",
        "why_it_matters": "Persistent water loss can affect ecosystems and local water management.",
        "uncertainty": "The imagery and training context do not establish the physical cause.",
        "next_checks": "Verify matched-season scenes, discharge, DEM and field hydrology.",
    }

    def fake_post(url: str, **kwargs: Any) -> _FakeResponse:
        captured["url"] = url
        captured.update(kwargs)
        return _FakeResponse(
            {
                "output": [
                    {
                        "content": [
                            {
                                "type": "output_text",
                                "text": json.dumps(explanation),
                            }
                        ]
                    }
                ]
            }
        )

    monkeypatch.setattr(openai_summary.requests, "post", fake_post)
    result = openai_summary.explain_evidence(
        {
            "aoi_id": "vistula_grudziadz_gniew",
            "analysis_mode": "river_width_and_channel_shift",
            "evidence_class": "DERIVED_VALUE",
            "causal_claim": False,
        },
        training_context=[
            {
                "run_id": "stream_gibs_20260820T013036Z",
                "remote_windows_trained": 200016,
                "regions": 75,
                "scientific_finding_claim": False,
            }
        ],
        test_context=[
            {
                "test_id": "vistula-real-data-test",
                "source": "NASA GIBS / Landsat-family evidence",
                "causal_claim": False,
            }
        ],
        api_key="test-key-not-a-real-secret",
        model="gpt-5.6-luna",
    )

    assert result == explanation
    assert captured["url"] == openai_summary.OPENAI_RESPONSES_URL
    request_json = captured["json"]
    assert request_json["model"] == "gpt-5.6-luna"
    assert "vistula_grudziadz_gniew" in request_json["input"]
    assert "stream_gibs_20260820T013036Z" in request_json["input"]
    assert "vistula-real-data-test" in request_json["input"]
    assert "test-key-not-a-real-secret" not in request_json["input"]
    assert captured["headers"]["Authorization"] == "Bearer test-key-not-a-real-secret"
