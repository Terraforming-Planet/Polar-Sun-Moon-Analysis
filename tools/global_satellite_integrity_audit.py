from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

API = "https://api.github.com"


def api_get(path: str, token: str | None) -> Any:
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    response = requests.get(f"{API}{path}", headers=headers, timeout=120)
    response.raise_for_status()
    return response.json()


def latest_successful_run(repo: str, branch: str, token: str | None) -> dict[str, Any] | None:
    owner, name = repo.split("/", 1)
    data = api_get(
        f"/repos/{owner}/{name}/actions/runs?branch={branch}&status=success&per_page=20",
        token,
    )
    runs = data.get("workflow_runs", [])
    if not runs:
        return None
    runs.sort(key=lambda r: r.get("updated_at") or r.get("created_at") or "", reverse=True)
    # Prefer experiment / seasonal workflows over unrelated branch jobs.
    preferred = [
        r
        for r in runs
        if any(k in (r.get("name") or "").lower() for k in ("experiment", "seasonal", "satellite"))
    ]
    return (preferred or runs)[0]


def run_artifacts(repo: str, run_id: int, token: str | None) -> list[dict[str, Any]]:
    owner, name = repo.split("/", 1)
    data = api_get(f"/repos/{owner}/{name}/actions/runs/{run_id}/artifacts?per_page=100", token)
    return data.get("artifacts", [])


def normalize_sha(value: Any) -> str | None:
    if not value:
        return None
    text = str(value).strip().lower()
    if text.startswith("sha256:"):
        text = text.split(":", 1)[1]
    return text if len(text) == 64 and all(c in "0123456789abcdef" for c in text) else None


def manifest_records(root: Path) -> tuple[list[dict[str, Any]], list[str]]:
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    for path in sorted(root.rglob("manifest.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover - audit should retain corrupt-file context
            errors.append(f"{path}: {exc}")
            continue
        test_id = data.get("test_number") or data.get("experiment_id")
        season_from_path = next((p for p in path.parts if p.lower() in {"spring", "autumn"}), None)
        for rec in data.get("records", []):
            if rec.get("status") != "ok":
                continue
            row = dict(rec)
            row["_manifest"] = str(path)
            row["_test_id"] = str(test_id) if test_id is not None else None
            row["_season"] = str(rec.get("season") or season_from_path or "unknown").lower()
            records.append(row)
    return records, errors


def deep_manifest_audit(root: Path) -> dict[str, Any]:
    records, parse_errors = manifest_records(root)
    duplicate_item_within_test: list[dict[str, Any]] = []
    exact_sha_cross_test: list[dict[str, Any]] = []
    cross_test_item_reuse: list[dict[str, Any]] = []

    item_groups: dict[tuple[str | None, str], list[dict[str, Any]]] = defaultdict(list)
    global_items: dict[str, list[dict[str, Any]]] = defaultdict(list)
    global_shas: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for rec in records:
        item = rec.get("item_id") or rec.get("product_id")
        sha = normalize_sha(rec.get("sha256") or rec.get("image_sha256") or rec.get("evidence_sha256"))
        if item:
            item_groups[(rec.get("_test_id"), str(item))].append(rec)
            global_items[str(item)].append(rec)
        if sha:
            global_shas[sha].append(rec)

    for (test_id, item), rows in item_groups.items():
        seasons = {r.get("_season") for r in rows}
        years = {r.get("year") for r in rows}
        if len(rows) > 1 and (len(seasons) > 1 or len(years) > 1):
            duplicate_item_within_test.append(
                {"test_id": test_id, "item_id": item, "count": len(rows), "seasons": sorted(seasons), "years": sorted(str(y) for y in years)}
            )

    for item, rows in global_items.items():
        tests = sorted({str(r.get("_test_id")) for r in rows if r.get("_test_id") is not None})
        if len(tests) > 1:
            # Reusing the same official satellite acquisition for different AOIs is legal and expected.
            cross_test_item_reuse.append({"item_id": item, "tests": tests, "count": len(rows), "classification": "allowed_if_AOI_differs"})

    for sha, rows in global_shas.items():
        tests = sorted({str(r.get("_test_id")) for r in rows if r.get("_test_id") is not None})
        if len(tests) > 1:
            exact_sha_cross_test.append({"sha256": sha, "tests": tests, "count": len(rows), "classification": "review_required"})

    return {
        "manifest_root": str(root),
        "manifest_records_ok": len(records),
        "parse_errors": parse_errors,
        "duplicate_item_within_test": duplicate_item_within_test,
        "cross_test_item_reuse": cross_test_item_reuse,
        "exact_rendered_sha_cross_test": exact_sha_cross_test,
        "near_duplicate_image_audit": "not_run_without_extracted_image_set",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", default="config/terrawater_tests_001_015.json")
    parser.add_argument("--output", default="audit_output")
    parser.add_argument("--manifests-root")
    args = parser.parse_args()

    registry_path = Path(args.registry)
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    repo = registry["repository"]
    token = os.environ.get("GITHUB_TOKEN")
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)

    test_results: list[dict[str, Any]] = []
    blockers: list[str] = []
    warnings: list[str] = []

    for test in registry["tests"]:
        run = latest_successful_run(repo, test["branch"], token)
        result: dict[str, Any] = {
            "id": test["id"],
            "name": test["name"],
            "kind": test["kind"],
            "branch": test["branch"],
            "aliases_excluded_from_canonical_ranking": test.get("aliases_excluded_from_canonical_ranking", []),
        }
        if run is None:
            result["status"] = "BLOCKED_NO_SUCCESSFUL_RUN"
            blockers.append(f"TEST {test['id']:03d}: no successful workflow run on {test['branch']}")
            test_results.append(result)
            continue

        artifacts = run_artifacts(repo, int(run["id"]), token)
        usable = [a for a in artifacts if not a.get("expired") and int(a.get("size_in_bytes") or 0) > 0]
        result.update(
            {
                "status": "OK" if usable else "BLOCKED_NO_USABLE_ARTIFACT",
                "run_id": run["id"],
                "run_name": run.get("name"),
                "run_url": run.get("html_url"),
                "head_sha": run.get("head_sha"),
                "updated_at": run.get("updated_at"),
                "artifacts": [
                    {
                        "id": a.get("id"),
                        "name": a.get("name"),
                        "size_in_bytes": a.get("size_in_bytes"),
                        "digest": a.get("digest"),
                        "expired": a.get("expired"),
                        "created_at": a.get("created_at"),
                        "expires_at": a.get("expires_at"),
                    }
                    for a in artifacts
                ],
            }
        )
        if not usable:
            blockers.append(f"TEST {test['id']:03d}: successful run has no unexpired non-empty artifact")
        test_results.append(result)

    deep = deep_manifest_audit(Path(args.manifests_root)) if args.manifests_root else None
    if deep:
        if deep["parse_errors"]:
            blockers.extend(f"manifest parse error: {e}" for e in deep["parse_errors"])
        if deep["duplicate_item_within_test"]:
            blockers.append(f"{len(deep['duplicate_item_within_test'])} within-test item_id reuse group(s) require review")
        if deep["exact_rendered_sha_cross_test"]:
            warnings.append(f"{len(deep['exact_rendered_sha_cross_test'])} exact rendered SHA group(s) occur across tests; verify AOI/output identity")

    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "repository": repo,
        "registry_sha256": hashlib.sha256(registry_path.read_bytes()).hexdigest(),
        "tests": test_results,
        "deep_manifest_audit": deep,
        "blockers": blockers,
        "warnings": warnings,
        "ranking_gate": "PASS" if not blockers and deep is not None else "WAIT_FOR_DEEP_MANIFEST_AUDIT" if not blockers else "BLOCKED",
        "scientific_guardrail": "river width/surface observations must not be reported as discharge or volume without independent gauge/bathymetry data",
    }
    (out / "global_integrity_audit.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = [
        "# TerraWater global satellite integrity audit — TEST 001–015",
        "",
        f"Generated: {report['generated_at']}",
        "",
        "| Test | Object | Branch | Run | Artifact status |",
        "|---:|---|---|---:|---|",
    ]
    for row in test_results:
        artifacts = row.get("artifacts", [])
        artifact_text = ", ".join(f"{a['name']} ({int(a['size_in_bytes'] or 0)/1e6:.1f} MB)" for a in artifacts) or "none"
        lines.append(f"| {row['id']:03d} | {row['name']} | `{row['branch']}` | {row.get('run_id', '-')} | {row['status']}: {artifact_text} |")
    lines += ["", f"## Ranking gate: **{report['ranking_gate']}**", ""]
    if blockers:
        lines += ["## Blockers"] + [f"- {x}" for x in blockers] + [""]
    if warnings:
        lines += ["## Warnings"] + [f"- {x}" for x in warnings] + [""]
    lines += [
        "## Interpretation rule",
        "The same official satellite acquisition may legitimately be reused for different AOIs. That is not treated as fabricated evidence. Exact rendered-image SHA reuse across different tests is more suspicious and is flagged for review.",
        "",
        "River surface width/area is not converted into discharge or water volume without independent gauge or bathymetric data.",
    ]
    (out / "GLOBAL_INTEGRITY_AUDIT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(json.dumps({"tests": len(test_results), "blockers": len(blockers), "warnings": len(warnings), "ranking_gate": report["ranking_gate"]}, indent=2))
    return 1 if blockers else 0


if __name__ == "__main__":
    sys.exit(main())
