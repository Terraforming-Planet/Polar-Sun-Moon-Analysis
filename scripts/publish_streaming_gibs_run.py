from __future__ import annotations

import argparse
import hashlib
import html
import json
import shutil
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any


def _pct(num: float, den: float) -> float:
    return 0.0 if not den else 100.0 * num / den


def _loss_reduction(first: float | None, value: float | None) -> float | None:
    if first in (None, 0) or value is None:
        return None
    return 100.0 * (1.0 - float(value) / float(first))


def _latest_run(repo: Path) -> Path:
    runs = sorted(
        (p for p in (repo / "research_runs").glob("stream_gibs_*") if (p / "metrics.json").exists()),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not runs:
        raise SystemExit("No completed stream_gibs_* run with metrics.json was found.")
    return runs[0]


def _scan_windows(path: Path) -> dict[str, Any]:
    regions: Counter[str] = Counter()
    years: Counter[str] = Counter()
    seasons: Counter[str] = Counter()
    hashes: set[str] = set()
    payload_bytes = 0
    lines = 0
    earliest: str | None = None
    latest: str | None = None
    if not path.exists():
        return {
            "line_count": 0,
            "unique_content_sha256": 0,
            "payload_bytes": 0,
            "counts_by_region": {},
            "counts_by_year": {},
            "counts_by_month": {},
            "earliest_observation_date": None,
            "latest_observation_date": None,
        }
    with path.open("r", encoding="utf-8") as handle:
        for raw in handle:
            if not raw.strip():
                continue
            item = json.loads(raw)
            lines += 1
            name = str(item.get("region_name") or item.get("region_id") or "unknown")
            date = str(item.get("observation_date") or "")
            regions[name] += 1
            if len(date) >= 7:
                years[date[:4]] += 1
                seasons[date[5:7]] += 1
                earliest = date if earliest is None or date < earliest else earliest
                latest = date if latest is None or date > latest else latest
            sha = item.get("sha256")
            if sha:
                hashes.add(str(sha))
            payload_bytes += int(item.get("payload_bytes") or 0)
    return {
        "line_count": lines,
        "unique_content_sha256": len(hashes),
        "payload_bytes": payload_bytes,
        "counts_by_region": dict(sorted(regions.items())),
        "counts_by_year": dict(sorted(years.items())),
        "counts_by_month": dict(sorted(seasons.items())),
        "earliest_observation_date": earliest,
        "latest_observation_date": latest,
    }


def _count_lines(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip())


def derive(metrics: dict[str, Any], scan: dict[str, Any], failure_lines: int) -> dict[str, Any]:
    trained = int(metrics.get("remote_unique_windows_trained") or 0)
    unique_content = int(metrics.get("remote_unique_content_sha256") or scan["unique_content_sha256"] or 0)
    pool = int(metrics.get("candidate_window_pool") or 0)
    target = int(metrics.get("target_remote_windows") or 0)
    elapsed = float(metrics.get("elapsed_seconds") or 0)
    samples = int(metrics.get("samples_seen") or 0)
    steps = int(metrics.get("steps") or 0)
    remote_bytes = int(metrics.get("remote_download_bytes") or scan["payload_bytes"] or 0)
    failures = int(metrics.get("failures") or failure_lines)
    duplicate_content = max(0, trained - unique_content)
    findings = [
        {
            "id": "FINDING-01",
            "class": "DERIVED_VALUE",
            "title": "Streaming target reached",
            "value": f"{trained:,} distinct geospatial/time windows used for optimization",
            "detail": f"Target completion {_pct(trained, target):.3f}% from a candidate pool of {pool:,} windows.",
        },
        {
            "id": "FINDING-02",
            "class": "DERIVED_VALUE",
            "title": "Content diversity",
            "value": f"{unique_content:,} distinct payload SHA-256 values",
            "detail": f"{_pct(unique_content, trained):.2f}% content-unique; {duplicate_content:,} trained windows had payload content matching another trained window.",
        },
        {
            "id": "FINDING-03",
            "class": "DERIVED_VALUE",
            "title": "Throughput and reliability",
            "value": f"{trained / elapsed:.2f} windows/s" if elapsed else "unknown",
            "detail": f"{remote_bytes / 1_000_000_000:.3f} GB streamed; {failures} recorded failures ({_pct(failures, trained + failures):.4f}%).",
        },
        {
            "id": "FINDING-04",
            "class": "DERIVED_VALUE",
            "title": "Optimization behavior",
            "value": f"{steps:,} steps · {samples:,} samples",
            "detail": (
                f"Loss first→last reduction {_loss_reduction(metrics.get('loss_first'), metrics.get('loss_last')):.2f}%; "
                f"best reduction {_loss_reduction(metrics.get('loss_first'), metrics.get('loss_best')):.2f}%."
            ),
        },
        {
            "id": "FINDING-05",
            "class": "UNKNOWN",
            "title": "Environmental conclusions",
            "value": "Not established by this training run alone",
            "detail": "The run decoded and optimized on imagery but did not persist water/snow/vegetation/shoreline pixel metrics. Environmental findings require a separate reproducible scene-analysis pass.",
        },
    ]
    return {
        "schema": "tp26-streaming-gibs-analysis-v1",
        "run_id": metrics.get("run_id"),
        "evidence_class": "DERIVED_VALUE",
        "scientific_finding_claim": False,
        "ground_truth_claim": False,
        "causal_environmental_claim": False,
        "target_completion_percent": round(_pct(trained, target), 4),
        "candidate_pool_coverage_percent": round(_pct(trained, pool), 4),
        "content_unique_percent": round(_pct(unique_content, trained), 4),
        "duplicate_content_windows": duplicate_content,
        "windows_per_second": round(trained / elapsed, 4) if elapsed else None,
        "steps_per_second": round(steps / elapsed, 4) if elapsed else None,
        "samples_per_second": round(samples / elapsed, 4) if elapsed else None,
        "average_payload_bytes_per_window": round(remote_bytes / trained, 2) if trained else None,
        "failure_rate_percent": round(_pct(failures, trained + failures), 6),
        "loss_reduction_first_to_last_percent": round(_loss_reduction(metrics.get("loss_first"), metrics.get("loss_last")) or 0.0, 4),
        "loss_reduction_first_to_best_percent": round(_loss_reduction(metrics.get("loss_first"), metrics.get("loss_best")) or 0.0, 4),
        "log_cross_checks": {
            "streamed_windows_jsonl_lines": scan["line_count"],
            "metrics_remote_unique_windows_trained": trained,
            "line_count_matches_metrics": scan["line_count"] == trained,
            "streamed_unique_content_sha256": scan["unique_content_sha256"],
            "metrics_unique_content_sha256": unique_content,
            "content_hash_count_matches_metrics": scan["unique_content_sha256"] == unique_content,
            "failure_log_lines": failure_lines,
        },
        "coverage": scan,
        "findings": findings,
    }


def _archive(run_dir: Path) -> tuple[Path, str, int]:
    archive = run_dir.parent / f"{run_dir.name}_FULL_LOGS.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in sorted(run_dir.iterdir()):
            if not path.is_file() or path.suffix.lower() in {".pt", ".pth", ".ckpt"}:
                continue
            zf.write(path, arcname=path.name)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest().upper()
    (Path(str(archive) + ".sha256.txt")).write_text(f"{digest}  {archive.name}\n", encoding="ascii")
    return archive, digest, archive.stat().st_size


def _html_report(metrics: dict[str, Any], analysis: dict[str, Any], archive: Path, digest: str, size: int) -> str:
    findings = "".join(
        f'<article class="finding"><span>{html.escape(item["class"])}</span><h3>{html.escape(item["title"])}</h3><b>{html.escape(item["value"])}</b><p>{html.escape(item["detail"])}</p></article>'
        for item in analysis["findings"]
    )
    region_count = len(analysis["coverage"]["counts_by_region"])
    trained = int(metrics.get("remote_unique_windows_trained") or 0)
    unique_hashes = int(metrics.get("remote_unique_content_sha256") or 0)
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TP-26 L4 Training #3 — Streaming NASA GIBS</title>
<style>:root{{color-scheme:dark;--bg:#020711;--panel:#071421;--line:#24506d;--cyan:#72e9ff;--text:#e9f8ff;--muted:#94b9ca;--good:#70efad;--warn:#ffd27a}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 50% 0,#0a2940 0,#020711 40%);color:var(--text);font-family:Inter,system-ui,sans-serif}}main{{width:min(1120px,calc(100% - 28px));margin:auto;padding:28px 0 60px}}a{{color:var(--cyan)}}h1{{font-size:clamp(2rem,6vw,3.5rem);line-height:1.02}}.lead,.muted{{color:var(--muted)}}.grid{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}}.card,.section,.finding{{border:1px solid var(--line);border-radius:14px;background:rgba(7,20,33,.94);padding:16px}}.card b{{display:block;font-size:1.55rem}}.section{{margin-top:12px}}.findings{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}}.finding span{{font-size:.7rem;color:var(--cyan);font-weight:800}}.finding b{{display:block;font-size:1.2rem}}code{{color:#bceeff;word-break:break-all}}@media(max-width:760px){{.grid,.findings{{grid-template-columns:1fr 1fr}}}}@media(max-width:460px){{.grid,.findings{{grid-template-columns:1fr}}}}</style></head>
<body><main><a href="../../../">← Terraforming Planet</a><p class="muted">TP-26 · NVIDIA L4 · completed streaming research run</p><h1>L4 Training #3 — Streaming NASA GIBS</h1><p class="lead">This report separates measured training/data-pipeline findings from environmental claims. Distinct WMS windows are not the same thing as unique satellite source scenes.</p>
<div class="grid"><div class="card"><b>{trained:,}</b>trained geospatial/time windows</div><div class="card"><b>{unique_hashes:,}</b>distinct payload hashes</div><div class="card"><b>{region_count}</b>research regions represented in the saved window log</div><div class="card"><b>{float(metrics.get("elapsed_seconds") or 0)/60:.2f} min</b>wall-clock runtime</div></div>
<section class="section"><h2>Evidence-backed conclusions</h2><div class="findings">{findings}</div></section>
<section class="section"><h2>Coverage and integrity</h2><p>Candidate pool coverage: <b>{analysis["candidate_pool_coverage_percent"]:.2f}%</b>. Content-unique ratio: <b>{analysis["content_unique_percent"]:.2f}%</b>. Recorded failure rate: <b>{analysis["failure_rate_percent"]:.4f}%</b>. Streamed window log cross-check: <b>{analysis["log_cross_checks"]["line_count_matches_metrics"]}</b>.</p><p>Observation date span in the saved log: <b>{analysis["coverage"]["earliest_observation_date"]}</b> → <b>{analysis["coverage"]["latest_observation_date"]}</b>.</p></section>
<section class="section"><h2>Scientific interpretation</h2><p>The run demonstrates that the pipeline can continuously decode and train on a very large set of public NASA GIBS MODIS/VIIRS true-colour geospatial/time windows while maintaining low transport failure rates. The reconstruction objective improved substantially. It does <strong>not</strong> by itself establish water loss, glacier retreat, drought causation, blocked channels or any other environmental event, because scene-level environmental indices were not persisted during this run.</p></section>
<section class="section"><h2>Published files</h2><p><a href="metrics.json">metrics.json</a> · <a href="training_manifest.json">training_manifest.json</a> · <a href="analysis.json">analysis.json</a> · <a href="stream_failures.jsonl">stream_failures.jsonl</a></p><p class="muted">The full log archive remains local because it contains the large 200k-line window manifest. Checkpoint weights are intentionally excluded from the log archive.</p><code>{html.escape(archive.name)} · {size:,} bytes · SHA-256 {digest}</code></section>
</main></body></html>'''


def publish(repo: Path, run_dir: Path) -> Path:
    metrics = json.loads((run_dir / "metrics.json").read_text(encoding="utf-8"))
    scan = _scan_windows(run_dir / "streamed_windows.jsonl")
    failure_lines = _count_lines(run_dir / "stream_failures.jsonl")
    analysis = derive(metrics, scan, failure_lines)
    archive, digest, archive_size = _archive(run_dir)
    analysis["archive"] = {"filename": archive.name, "size_bytes": archive_size, "sha256": digest, "availability": "local full-log archive; checkpoint excluded"}

    out = repo / "published" / "training-runs" / run_dir.name
    out.mkdir(parents=True, exist_ok=True)
    (out / "analysis.json").write_text(json.dumps(analysis, indent=2), encoding="utf-8")
    (out / "summary.json").write_text(json.dumps({"run_id": run_dir.name, "metrics": metrics, "archive": analysis["archive"], "findings": analysis["findings"]}, indent=2), encoding="utf-8")
    for name in ("metrics.json", "training_manifest.json", "stream_failures.jsonl"):
        source = run_dir / name
        if source.exists():
            shutil.copy2(source, out / name)
    (out / "index.html").write_text(_html_report(metrics, analysis, archive, digest, archive_size), encoding="utf-8")

    web_index = repo / "web" / "index.html"
    if web_index.exists():
        text = web_index.read_text(encoding="utf-8")
        href = f"./published/training-runs/{run_dir.name}/"
        if href not in text:
            link = f'      <a class="training-link" href="{href}">L4 Training #3 · Streaming NASA GIBS</a>\n'
            text = text.replace("    </nav>", link + "    </nav>")
            web_index.write_text(text, encoding="utf-8")
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", default="")
    args = parser.parse_args()
    repo = Path.cwd()
    run_dir = Path(args.run_dir).resolve() if args.run_dir else _latest_run(repo)
    out = publish(repo, run_dir)
    print(f"Published report prepared: {out}")
    print(f"Full log ZIP prepared: {run_dir.parent / (run_dir.name + '_FULL_LOGS.zip')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
