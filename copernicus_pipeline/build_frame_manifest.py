#!/usr/bin/env python3
"""Build a timestamped Copernicus frame manifest for the web viewer.

Designed to run inside CDSE JupyterLab. It stores metadata in mystorage and can
copy the public manifest into web/public/data when the repository is mounted.
No credentials are committed. STAC catalogue search is public; authenticated
asset download is intentionally a separate step.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STAC_SEARCH_URL = "https://stac.dataspace.copernicus.eu/v1/search"
DEFAULT_COLLECTIONS = ["sentinel-2-l2a", "sentinel-1-grd"]


def post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "terraforming-planet/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)


def feature_to_frame(feature: dict[str, Any]) -> dict[str, Any]:
    properties = feature.get("properties") or {}
    assets = feature.get("assets") or {}
    preview = (
        assets.get("thumbnail")
        or assets.get("visual")
        or assets.get("rendered_preview")
        or {}
    )
    cloud_cover = properties.get("eo:cloud_cover")
    stac_url = next(
        (
            link.get("href")
            for link in feature.get("links", [])
            if link.get("rel") == "self"
        ),
        None,
    )
    return {
        "id": feature.get("id"),
        "collection": feature.get("collection"),
        "timestamp_utc": properties.get("datetime")
        or properties.get("start_datetime"),
        "cloud_cover_percent": cloud_cover,
        "bbox": feature.get("bbox"),
        "geometry": feature.get("geometry"),
        "preview_url": preview.get("href"),
        "stac_url": stac_url,
        "source": "Copernicus Data Space Ecosystem STAC",
        "is_live": False,
    }


def build_manifest(
    *,
    bbox: list[float],
    start: str,
    end: str,
    collections: list[str],
    limit: int,
) -> dict[str, Any]:
    payload = {
        "collections": collections,
        "bbox": bbox,
        "datetime": f"{start}/{end}",
        "limit": min(max(limit, 1), 1000),
        "sortby": [{"field": "datetime", "direction": "desc"}],
    }
    result = post_json(STAC_SEARCH_URL, payload)
    frames = [feature_to_frame(feature) for feature in result.get("features", [])]
    frames = [frame for frame in frames if frame.get("timestamp_utc")]
    frames.sort(key=lambda frame: frame["timestamp_utc"], reverse=True)
    return {
        "schema_version": 1,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "query": {
            "bbox": bbox,
            "start": start,
            "end": end,
            "collections": collections,
        },
        "frame_count": len(frames),
        "frames": frames,
        "notice": (
            "Manifest contains published observations, not a continuous "
            "real-time video stream."
        ),
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--bbox",
        nargs=4,
        type=float,
        metavar=("WEST", "SOUTH", "EAST", "NORTH"),
        required=True,
    )
    parser.add_argument(
        "--start",
        required=True,
        help="ISO-8601 UTC start, e.g. 2026-07-30T00:00:00Z",
    )
    parser.add_argument("--end", required=True, help="ISO-8601 UTC end")
    parser.add_argument(
        "--collections",
        nargs="+",
        default=DEFAULT_COLLECTIONS,
    )
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument(
        "--output",
        default=os.environ.get(
            "CDSE_MANIFEST_PATH",
            "mystorage/terraforming-planet/frames/latest.json",
        ),
    )
    parser.add_argument(
        "--public-copy",
        default="",
        help=(
            "Optional repository path, e.g. "
            "web/public/data/copernicus/frames.json"
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = build_manifest(
        bbox=list(args.bbox),
        start=args.start,
        end=args.end,
        collections=list(args.collections),
        limit=args.limit,
    )
    output = Path(args.output)
    write_json(output, manifest)
    if args.public_copy:
        write_json(Path(args.public_copy), manifest)
    print(
        f"Wrote {manifest['frame_count']} timestamped observations "
        f"to {output}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Copernicus manifest pipeline failed: {exc}", file=sys.stderr)
        raise
