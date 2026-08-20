from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Mapping

import requests

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-5.6-luna"
REQUIRED_FIELDS = ("summary", "why_it_matters", "uncertainty", "next_checks")

SYSTEM_INSTRUCTIONS = """You are the Terra Observation System Evidence Explainer.
Use only the supplied evidence JSON. Do not invent measurements, dates, sources, causes,
confidence values, events, or missing observations. Preserve the supplied evidence class.
A morphology or flow-connectivity candidate is not proof of a blockage or causal mechanism.
Clearly separate what was observed, what was deterministically derived, what remains uncertain,
and what should be checked next. Write for a general public, education, NGO, research, or
community-resilience audience without overstating the science.

Return only one JSON object with exactly these string fields:
- summary
- why_it_matters
- uncertainty
- next_checks
"""


class EvidenceExplainerError(RuntimeError):
    """Raised when the evidence explainer cannot produce a validated explanation."""


def _serialize_finding(finding: Mapping[str, Any]) -> str:
    try:
        return json.dumps(dict(finding), ensure_ascii=False, sort_keys=True)
    except (TypeError, ValueError) as exc:
        raise EvidenceExplainerError("Finding must be JSON-serializable.") from exc


def build_explainer_input(finding: Mapping[str, Any]) -> str:
    """Build a provenance-preserving prompt from an already computed finding."""

    payload = _serialize_finding(finding)
    return f"{SYSTEM_INSTRUCTIONS}\n\nEVIDENCE JSON:\n{payload}"


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
    api_key: str | None = None,
    model: str | None = None,
    timeout_seconds: float = 30.0,
) -> dict[str, str]:
    """Explain a computed finding with the OpenAI Responses API.

    Scientific measurements and evidence classification must already exist before this function
    is called. The model receives only the supplied finding and is not allowed to create new
    observations or promote a hypothesis/candidate into a causal claim.
    """

    resolved_key = api_key or os.getenv("OPENAI_API_KEY")
    if not resolved_key:
        raise EvidenceExplainerError(
            "OPENAI_API_KEY is not set. The evidence explainer will not fake an AI result."
        )

    resolved_model = model or os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
    request_payload: dict[str, Any] = {
        "model": resolved_model,
        "input": build_explainer_input(finding),
        "max_output_tokens": 700,
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Explain one existing Terra Observation finding with the OpenAI API."
    )
    parser.add_argument(
        "finding",
        type=Path,
        help="Path to a JSON finding produced by the pipeline.",
    )
    parser.add_argument("--output", type=Path, help="Optional output JSON path.")
    parser.add_argument("--model", default=None, help="Override OPENAI_MODEL for this request.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    raw = json.loads(args.finding.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise EvidenceExplainerError("Finding file must contain one JSON object.")

    result = explain_evidence(raw, model=args.model)
    rendered = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
