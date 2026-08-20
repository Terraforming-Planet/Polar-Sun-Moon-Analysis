from __future__ import annotations

import argparse
import json
import os
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import requests

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-5.6-luna"
REQUIRED_FIELDS = ("summary", "why_it_matters", "uncertainty", "next_checks")

SYSTEM_INSTRUCTIONS = """You are the Terra Observation System Evidence Explainer.
Your job is to explain evidence about real Earth-observation research, with special attention to
water loss, drying lakes and ponds, river-channel change, exposed beds, wetlands, drought-related
surface change, and flow-connectivity candidates.

Use only the supplied EVIDENCE BUNDLE. The bundle can contain:
- a primary finding produced by deterministic analysis;
- structured NVIDIA L4 training/evaluation artifacts;
- structured results from tests performed on real public satellite data.

Do not invent measurements, dates, sources, causes, confidence values, environmental events,
training metrics, test results, or missing observations. Training metrics show that a model or
pipeline learned/processed data; they are not by themselves proof that a lake dried or a river was
blocked. A morphology or flow-connectivity candidate is not proof of a blockage or causal
mechanism. Preserve supplied evidence classes and explicit false/unknown claim flags.

Clearly separate:
1. what the satellite/public-source evidence shows;
2. what was deterministically derived;
3. what the L4 training/evaluation establishes about the pipeline;
4. what remains uncertain;
5. what independent checks should happen next.

Write for communities, educators, NGOs, researchers and environmental responders. Prefer concrete
water/river examples when they are present in the bundle. Do not overstate the science.

Return only one JSON object with exactly these string fields:
- summary
- why_it_matters
- uncertainty
- next_checks
"""


class EvidenceExplainerError(RuntimeError):
    """Raised when the evidence explainer cannot produce a validated explanation."""


def _json_object(value: Mapping[str, Any], *, label: str) -> dict[str, Any]:
    try:
        encoded = json.dumps(dict(value), ensure_ascii=False, sort_keys=True)
        decoded = json.loads(encoded)
    except (TypeError, ValueError) as exc:
        raise EvidenceExplainerError(f"{label} must be JSON-serializable.") from exc
    if not isinstance(decoded, dict):
        raise EvidenceExplainerError(f"{label} must be a JSON object.")
    return decoded


def build_evidence_bundle(
    finding: Mapping[str, Any],
    *,
    training_context: Sequence[Mapping[str, Any]] = (),
    test_context: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    """Build the exact structured evidence package sent to OpenAI.

    Raw satellite imagery is not required here. The scientific pipeline and L4/test workflows
    should first produce structured, reproducible artifacts with source/provenance metadata.
    """

    return {
        "schema": "terra-openai-evidence-bundle-v1",
        "primary_finding": _json_object(finding, label="Finding"),
        "l4_training_and_evaluation": [
            _json_object(item, label="Training context") for item in training_context
        ],
        "real_data_tests": [_json_object(item, label="Test context") for item in test_context],
    }


def build_explainer_input(
    finding: Mapping[str, Any],
    *,
    training_context: Sequence[Mapping[str, Any]] = (),
    test_context: Sequence[Mapping[str, Any]] = (),
) -> str:
    """Build a provenance-preserving prompt from computed research artifacts."""

    bundle = build_evidence_bundle(
        finding,
        training_context=training_context,
        test_context=test_context,
    )
    payload = json.dumps(bundle, ensure_ascii=False, sort_keys=True)
    return f"{SYSTEM_INSTRUCTIONS}\n\nEVIDENCE BUNDLE:\n{payload}"


def _extract_output_text(payload: Mapping[str, Any]) -> str:
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()

    output = payload.get("output")
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for part in content:
                if not isinstance(part, dict) or part.get("type") != "output_text":
                    continue
                text = part.get("text")
                if isinstance(text, str) and text.strip():
                    return text.strip()

    raise EvidenceExplainerError("OpenAI response did not contain output text.")


def _validate_explanation(payload: Any) -> dict[str, str]:
    if not isinstance(payload, dict):
        raise EvidenceExplainerError("OpenAI explanation must be a JSON object.")

    explanation: dict[str, str] = {}
    for field in REQUIRED_FIELDS:
        value = payload.get(field)
        if not isinstance(value, str) or not value.strip():
            raise EvidenceExplainerError(f"OpenAI explanation is missing '{field}'.")
        explanation[field] = value.strip()
    return explanation


def explain_evidence(
    finding: Mapping[str, Any],
    *,
    training_context: Sequence[Mapping[str, Any]] = (),
    test_context: Sequence[Mapping[str, Any]] = (),
    api_key: str | None = None,
    model: str | None = None,
    timeout_seconds: float = 30.0,
) -> dict[str, str]:
    """Explain real-data research evidence with the OpenAI Responses API.

    Scientific measurements and classifications must already exist before this function is called.
    L4 training/evaluation artifacts can be supplied as context, but they may never be treated as
    environmental ground truth unless a separate real-data evaluation supports that claim.
    """

    resolved_key = api_key or os.getenv("OPENAI_API_KEY")
    if not resolved_key:
        raise EvidenceExplainerError(
            "OPENAI_API_KEY is not set. The evidence explainer will not fake an AI result."
        )

    resolved_model = model or os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
    request_payload: dict[str, Any] = {
        "model": resolved_model,
        "input": build_explainer_input(
            finding,
            training_context=training_context,
            test_context=test_context,
        ),
        "max_output_tokens": 900,
    }
    headers = {
        "Authorization": f"Bearer {resolved_key}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(
            OPENAI_RESPONSES_URL,
            headers=headers,
            json=request_payload,
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        raw_payload = response.json()
    except requests.RequestException as exc:
        raise EvidenceExplainerError("OpenAI Responses API request failed.") from exc
    except ValueError as exc:
        raise EvidenceExplainerError("OpenAI Responses API returned invalid JSON.") from exc

    if not isinstance(raw_payload, dict):
        raise EvidenceExplainerError("OpenAI Responses API returned an unexpected payload.")

    output_text = _extract_output_text(raw_payload)
    try:
        parsed = json.loads(output_text)
    except json.JSONDecodeError as exc:
        raise EvidenceExplainerError("OpenAI explanation was not valid JSON.") from exc
    return _validate_explanation(parsed)


def _load_json_object(path: Path, *, label: str) -> dict[str, Any]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EvidenceExplainerError(f"Could not read {label}: {path}") from exc
    if not isinstance(raw, dict):
        raise EvidenceExplainerError(f"{label} must contain one JSON object: {path}")
    return raw


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Explain a Terra Observation finding using optional L4 training and real-data test "
            "artifacts as grounded context."
        )
    )
    parser.add_argument(
        "finding",
        type=Path,
        help="Path to a JSON finding produced by the scientific pipeline.",
    )
    parser.add_argument(
        "--training-context",
        type=Path,
        action="append",
        default=[],
        help="Structured L4 training/evaluation JSON. Repeat for multiple runs.",
    )
    parser.add_argument(
        "--test-context",
        type=Path,
        action="append",
        default=[],
        help="Structured real-satellite-data test JSON. Repeat for multiple tests.",
    )
    parser.add_argument("--output", type=Path, help="Optional output JSON path.")
    parser.add_argument("--model", default=None, help="Override OPENAI_MODEL for this request.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    finding = _load_json_object(args.finding, label="Finding")
    training_context = [
        _load_json_object(path, label="Training context") for path in args.training_context
    ]
    test_context = [_load_json_object(path, label="Test context") for path in args.test_context]

    result = explain_evidence(
        finding,
        training_context=training_context,
        test_context=test_context,
        model=args.model,
    )
    rendered = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
