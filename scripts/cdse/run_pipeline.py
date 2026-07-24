from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import requests
import yaml
from jinja2 import Template


def load_config(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Configuration must be a YAML mapping")
    for key in ("stac_url", "collection", "start_date", "end_date", "regions"):
        if key not in data:
            raise ValueError(f"Missing configuration key: {key}")
    return data


def validate_bbox(bbox: list[float]) -> None:
    if len(bbox) != 4:
        raise ValueError("Bounding box must contain [west, south, east, north]")
    west, south, east, north = map(float, bbox)
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError(f"Invalid bounding box: {bbox}")


def git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def search_items(
    stac_url: str,
    collection: str,
    bbox: list[float],
    start_date: str,
    end_date: str,
    cloud_cover_max: float,
    limit: int,
) -> list[dict[str, Any]]:
    validate_bbox(bbox)
    endpoint = f"{stac_url.rstrip('/')}/search"
    payload: dict[str, Any] = {
        "collections": [collection],
        "bbox": bbox,
        "datetime": f"{start_date}T00:00:00Z/{end_date}T23:59:59Z",
        "limit": limit,
        "sortby": [{"field": "datetime", "direction": "asc"}],
    }
    response = requests.post(endpoint, json=payload, timeout=90)
    response.raise_for_status()
    body = response.json()
    features = body.get("features", [])
    if not isinstance(features, list):
        raise RuntimeError("CDSE STAC response does not contain a feature list")

    accepted: list[dict[str, Any]] = []
    for feature in features:
        props = feature.get("properties", {})
        cloud = props.get("eo:cloud_cover")
        if cloud is None or float(cloud) <= cloud_cover_max:
            accepted.append(feature)
    return accepted


def item_record(region: str, item: dict[str, Any]) -> dict[str, Any]:
    props = item.get("properties", {})
    assets = item.get("assets", {})
    preview = assets.get("thumbnail", {}).get("href") or assets.get("rendered_preview", {}).get("href")
    return {
        "region": region,
        "id": item.get("id"),
        "datetime": props.get("datetime") or props.get("start_datetime"),
        "cloud_cover": props.get("eo:cloud_cover"),
        "platform": props.get("platform"),
        "constellation": props.get("constellation"),
        "collection": item.get("collection"),
        "preview_url": preview,
        "self_url": next(
            (link.get("href") for link in item.get("links", []) if link.get("rel") == "self"),
            None,
        ),
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")


def write_csv(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "region", "id", "datetime", "cloud_cover", "platform", "constellation",
        "collection", "preview_url", "self_url",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)


def make_chart(path: Path, records: list[dict[str, Any]]) -> None:
    counts: Counter[str] = Counter()
    for record in records:
        stamp = record.get("datetime")
        if stamp:
            counts[str(stamp)[:10]] += 1
    labels = sorted(counts)
    path.parent.mkdir(parents=True, exist_ok=True)
    plt.figure(figsize=(12, 5))
    if labels:
        plt.bar(labels, [counts[label] for label in labels])
        plt.xticks(rotation=70, ha="right")
        plt.ylabel("Available scenes")
        plt.xlabel("Observation date (UTC)")
    else:
        plt.text(0.5, 0.5, "No matching observations", ha="center", va="center")
        plt.axis("off")
    plt.title("Copernicus CDSE observations by date")
    plt.tight_layout()
    plt.savefig(path, dpi=160)
    plt.close()


def make_report(path: Path, metadata: dict[str, Any], records: list[dict[str, Any]]) -> None:
    template = Template("""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Copernicus CDSE analysis</title><style>
body{font-family:system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;line-height:1.5}
table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{border:1px solid #ccc;padding:.45rem;text-align:left}
code{background:#eee;padding:.1rem .25rem}img{max-width:100%}
</style></head><body>
<h1>Copernicus CDSE polar-region catalogue analysis</h1>
<p><strong>Evidence class:</strong> OBSERVATION metadata returned by the official CDSE STAC catalogue.</p>
<ul><li>Run: {{ meta.run_at_utc }}</li><li>Collection: <code>{{ meta.collection }}</code></li>
<li>Date range: {{ meta.start_date }} – {{ meta.end_date }}</li><li>Scenes: {{ meta.scene_count }}</li>
<li>Mode: {{ 'test' if meta.test_mode else 'full' }}</li></ul>
<img src="../charts/copernicus/observation_timeline.png" alt="Observation timeline">
<h2>Observations</h2><table><thead><tr><th>Region</th><th>Date</th><th>Cloud %</th><th>ID</th></tr></thead><tbody>
{% for row in rows %}<tr><td>{{ row.region }}</td><td>{{ row.datetime }}</td><td>{{ row.cloud_cover }}</td><td>{{ row.id }}</td></tr>{% endfor %}
</tbody></table>
<p>This report describes catalogue availability, not emergency alerts or direct measurements at the exact geographic poles.</p>
</body></html>""")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(template.render(meta=metadata, rows=records), encoding="utf-8")


def run(config_path: Path, test_mode: bool = False) -> dict[str, Any]:
    config = load_config(config_path)
    root = Path(config.get("output_root", "docs"))
    limit = min(int(config.get("limit_per_region", 100)), 10 if test_mode else 100)
    all_records: list[dict[str, Any]] = []
    region_summary: dict[str, Any] = {}

    for key, region in config["regions"].items():
        bbox = [float(value) for value in region["bbox"]]
        items = search_items(
            config["stac_url"], config["collection"], bbox,
            config["start_date"], config["end_date"],
            float(config.get("cloud_cover_max", 100)), limit,
        )
        records = [item_record(key, item) for item in items]
        all_records.extend(records)
        region_summary[key] = {
            "name": region.get("name", key), "bbox": bbox, "scene_count": len(records)
        }

    now = datetime.now(UTC).isoformat()
    metadata = {
        "run_at_utc": now,
        "source": "Copernicus Data Space Ecosystem STAC API",
        "stac_url": config["stac_url"],
        "collection": config["collection"],
        "start_date": config["start_date"],
        "end_date": config["end_date"],
        "cloud_cover_max": config.get("cloud_cover_max"),
        "scene_count": len(all_records),
        "test_mode": test_mode,
        "git_commit": git_commit(),
        "regions": region_summary,
        "limitations": [
            "Configured regions are representative polar study areas, not exact 90-degree pole points.",
            "This stage analyses catalogue metadata and scene availability, not pixel-level environmental change.",
        ],
    }
    fingerprint = hashlib.sha256(json.dumps(all_records, sort_keys=True).encode()).hexdigest()
    metadata["records_sha256"] = fingerprint

    data_dir = root / "data" / "copernicus"
    chart_path = root / "charts" / "copernicus" / "observation_timeline.png"
    report_path = root / "reports" / "copernicus-analysis.html"
    write_json(data_dir / "latest_results.json", {"metadata": metadata, "observations": all_records})
    write_json(data_dir / "run_metadata.json", metadata)
    write_csv(data_dir / "observations.csv", all_records)
    make_chart(chart_path, all_records)
    make_report(report_path, metadata, all_records)
    return metadata


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Copernicus CDSE STAC pipeline")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--test", action="store_true")
    args = parser.parse_args()
    metadata = run(args.config, test_mode=args.test)
    print(json.dumps(metadata, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
