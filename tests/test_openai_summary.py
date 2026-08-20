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


def test_explainer_refuses_to_fake_result_without_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(EvidenceExplainerError, match="OPENAI_API_KEY"):
        openai_summary.explain_evidence({"evidence_class": "OBSERVATION"})


def test_explainer_calls_responses_api_and_validates_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    explanation = {
        "summary": "Mapped open-water area decreased in the compared observations.",
        "why_it_matters": "The change can guide further environmental review.",
        "uncertainty": "The imagery alone does not establish a physical cause.",
        "next_checks": "Compare discharge, DEM, structures and matched-season imagery.",
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
            "evidence_class": "DERIVED_VALUE",
            "causal_claim": False,
        },
        api_key="test-key-not-a-real-secret",
        model="gpt-5.6-luna",
    )

    assert result == explanation
    assert captured["url"] == openai_summary.OPENAI_RESPONSES_URL
    request_json = captured["json"]
    assert request_json["model"] == "gpt-5.6-luna"
    assert "vistula_grudziadz_gniew" in request_json["input"]
    assert "test-key-not-a-real-secret" not in request_json["input"]
    assert captured["headers"]["Authorization"] == "Bearer test-key-not-a-real-secret"
