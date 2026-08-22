from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from terra_research_node.agentic_eo import DEFAULT_AGENT_MODEL, run_agentic_eo_with_trace

PUBLIC_FORBIDDEN_MARKERS = (
    "authorization: bearer",
    "openai_api_key",
    "api_key=",
    "sk-proj-",
    "chain-of-thought",
    "hidden reasoning",
)


def _load_config(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Benchmark config must be a JSON object.")
    return payload


def _validate_config(config: dict[str, Any]) -> None:
    if config.get("schema") != "terra-agentic-eo-benchmark-v1":
        raise ValueError("Unsupported benchmark schema.")
    cases = config.get("cases")
    if not isinstance(cases, list) or len(cases) != 10:
        raise ValueError("Agentic EO Benchmark v1 must contain exactly 10 cases.")

    seen_ids: set[str] = set()
    for index, case in enumerate(cases, start=1):
        if not isinstance(case, dict):
            raise ValueError(f"Benchmark case {index} must be an object.")
        case_id = case.get("id")
        question = case.get("question")
        if not isinstance(case_id, str) or not case_id.strip():
            raise ValueError(f"Benchmark case {index} has no stable id.")
        if case_id in seen_ids:
            raise ValueError(f"Duplicate benchmark case id: {case_id}")
        seen_ids.add(case_id)
        if not isinstance(question, str) or not question.strip():
            raise ValueError(f"Benchmark case {case_id} has no question.")
        for key in ("required_tools", "required_terms_all", "required_any_groups"):
            value = case.get(key, [])
            if not isinstance(value, list):
                raise ValueError(f"Benchmark case {case_id}: {key} must be a list.")


def _completed_tools(trace: dict[str, Any]) -> set[str]:
    completed: set[str] = set()
    for event in trace.get("events", []):
        if not isinstance(event, dict):
            continue
        if event.get("event") != "tool_end" or event.get("status") != "success":
            continue
        tool_name = event.get("tool")
        if isinstance(tool_name, str):
            completed.add(tool_name)
    return completed


def _assertion(name: str, passed: bool, detail: str) -> dict[str, Any]:
    return {"name": name, "passed": bool(passed), "detail": detail}


def _evaluate_case(
    case: dict[str, Any],
    answer: str,
    trace: dict[str, Any],
    required_sections: list[str],
) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    normalized = answer.casefold()
    tools = _completed_tools(trace)

    checks.append(_assertion("run_completed", bool(answer.strip()), "Final answer is non-empty."))

    for tool_name in case.get("required_tools", []):
        checks.append(
            _assertion(
                f"tool:{tool_name}",
                tool_name in tools,
                f"Required successful tool boundary: {tool_name}",
            )
        )

    for section in required_sections:
        checks.append(
            _assertion(
                f"section:{section}",
                section.casefold() in normalized,
                f"Required final-answer section: {section}",
            )
        )

    for term in case.get("required_terms_all", []):
        term_text = str(term)
        checks.append(
            _assertion(
                f"term:{term_text}",
                term_text.casefold() in normalized,
                f"Required answer term: {term_text}",
            )
        )

    for group_index, group in enumerate(case.get("required_any_groups", []), start=1):
        if not isinstance(group, list) or not group:
            checks.append(
                _assertion(
                    f"any_group:{group_index}",
                    False,
                    "Required-any group is empty or invalid.",
                )
            )
            continue
        alternatives = [str(item) for item in group]
        passed = any(item.casefold() in normalized for item in alternatives)
        checks.append(
            _assertion(
                f"any_group:{group_index}",
                passed,
                "At least one required alternative: " + " | ".join(alternatives),
            )
        )

    public_blob = (answer + "\n" + json.dumps(trace, ensure_ascii=False)).casefold()
    leaked = [marker for marker in PUBLIC_FORBIDDEN_MARKERS if marker in public_blob]
    checks.append(
        _assertion(
            "public_trace_safety",
            not leaked,
            "No credentials, private reasoning labels or secret markers in public output."
            if not leaked
            else f"Forbidden markers detected: {leaked}",
        )
    )
    return checks


def _score(checks: list[dict[str, Any]]) -> tuple[int, int, float]:
    total = len(checks)
    passed = sum(1 for item in checks if item.get("passed") is True)
    percent = 100.0 if total == 0 else passed / total * 100.0
    return passed, total, round(percent, 2)


def _markdown_report(payload: dict[str, Any]) -> str:
    summary = payload["summary"]
    lines = [
        "# Agentic EO Benchmark v1 — live public report",
        "",
        f"- Generated UTC: `{payload['generated_utc']}`",
        f"- Model: `{payload['model']}`",
        f"- Cases executed: **{summary['case_count']}**",
        f"- Strict cases passed: **{summary['strict_case_pass_count']}/{summary['case_count']}**",
        (
            "- Observable assertion score: "
            f"**{summary['assertions_passed']}/{summary['assertions_total']} "
            f"({summary['assertion_pass_rate_percent']}%)**"
        ),
        "",
        "> Scope: this benchmark checks observable routing, registry-backed source selection, "
        "scientific uncertainty and answer-level safety assertions. It is not a substitute for "
        "independent environmental ground truth or a peer-reviewed scientific benchmark.",
        "",
        "| Case | Category | Score | Required tool routing |",
        "| --- | --- | ---: | --- |",
    ]

    for case in payload["cases"]:
        required_tools = ", ".join(case["required_tools"]) or "none"
        lines.append(
            f"| `{case['id']}` | {case['category']} | {case['score_percent']}% | "
            f"{required_tools} |"
        )

    for case in payload["cases"]:
        lines.extend(
            [
                "",
                f"## {case['id']} — {case['category']}",
                "",
                f"**Question:** {case['question']}",
                "",
                f"**Score:** {case['assertions_passed']}/{case['assertions_total']} "
                f"({case['score_percent']}%)",
                "",
                "**Completed tools:** "
                + (", ".join(case["completed_tools"]) or "none"),
                "",
                "**Assertions:**",
            ]
        )
        for check in case["assertions"]:
            icon = "✅" if check["passed"] else "❌"
            lines.append(f"- {icon} `{check['name']}` — {check['detail']}")
        lines.extend(["", "**Agent answer:**", "", case["answer"]])

    lines.append("")
    return "\n".join(lines)


def run_benchmark(
    *,
    config_path: Path,
    model: str,
    json_output: Path,
    markdown_output: Path,
) -> dict[str, Any]:
    config = _load_config(config_path)
    _validate_config(config)
    required_sections = [str(item) for item in config.get("required_sections", [])]

    results: list[dict[str, Any]] = []
    for case in config["cases"]:
        case_id = str(case["id"])
        print(f"=== {case_id} ===", flush=True)
        answer = ""
        trace: dict[str, Any] = {}
        error: str | None = None
        try:
            answer, trace = run_agentic_eo_with_trace(str(case["question"]), model=model)
        except Exception as exc:  # pragma: no cover - live API/runtime boundary
            error = f"{type(exc).__name__}: {exc}"

        if error is None:
            checks = _evaluate_case(case, answer, trace, required_sections)
        else:
            checks = [_assertion("run_completed", False, error)]

        passed, total, percent = _score(checks)
        completed_tools = sorted(_completed_tools(trace))
        results.append(
            {
                "id": case_id,
                "category": str(case.get("category", "unspecified")),
                "question": str(case["question"]),
                "required_tools": [str(item) for item in case.get("required_tools", [])],
                "completed_tools": completed_tools,
                "assertions_passed": passed,
                "assertions_total": total,
                "score_percent": percent,
                "strict_pass": total > 0 and passed == total,
                "error": error,
                "trace": trace,
                "answer": answer,
                "assertions": checks,
            }
        )
        print(f"{case_id}: {passed}/{total} ({percent}%)", flush=True)

    assertions_passed = sum(item["assertions_passed"] for item in results)
    assertions_total = sum(item["assertions_total"] for item in results)
    pass_rate = 100.0 if assertions_total == 0 else assertions_passed / assertions_total * 100.0
    strict_passes = sum(1 for item in results if item["strict_pass"])

    payload = {
        "schema": "terra-agentic-eo-benchmark-result-v1",
        "benchmark": str(config.get("title", "Agentic EO Benchmark v1")),
        "generated_utc": datetime.now(UTC).isoformat(),
        "model": model,
        "config": str(config_path),
        "public_safety_note": (
            "Trace contains allow-listed agent/tool lifecycle events only; no chain-of-thought, "
            "credentials, tool arguments or private tool payloads are intentionally published."
        ),
        "scope_note": str(config.get("description", "")),
        "summary": {
            "case_count": len(results),
            "strict_case_pass_count": strict_passes,
            "assertions_passed": assertions_passed,
            "assertions_total": assertions_total,
            "assertion_pass_rate_percent": round(pass_rate, 2),
        },
        "cases": results,
    }

    json_output.parent.mkdir(parents=True, exist_ok=True)
    markdown_output.parent.mkdir(parents=True, exist_ok=True)
    json_output.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    markdown_output.write_text(_markdown_report(payload), encoding="utf-8")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the 10-case Agentic EO Benchmark v1.")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config/agentic-eo-benchmark-v1.json"),
    )
    parser.add_argument("--model", default=DEFAULT_AGENT_MODEL)
    parser.add_argument(
        "--json-output",
        type=Path,
        default=Path("benchmark-artifacts/agentic-eo-benchmark-v1.json"),
    )
    parser.add_argument(
        "--markdown-output",
        type=Path,
        default=Path("benchmark-artifacts/agentic-eo-benchmark-v1.md"),
    )
    parser.add_argument(
        "--fail-under",
        type=float,
        default=90.0,
        help="Return non-zero when observable assertion pass rate is below this percentage.",
    )
    args = parser.parse_args()

    payload = run_benchmark(
        config_path=args.config,
        model=args.model,
        json_output=args.json_output,
        markdown_output=args.markdown_output,
    )
    pass_rate = float(payload["summary"]["assertion_pass_rate_percent"])
    print(f"Observable assertion pass rate: {pass_rate}%")
    if pass_rate < args.fail_under:
        print(f"Benchmark is below required threshold of {args.fail_under}%.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
