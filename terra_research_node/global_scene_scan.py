from __future__ import annotations

import argparse
import json
import math
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

USGS_STAC_SEARCH = "https://landsatlook.usgs.gov/stac-server/search"
DEFAULT_COLLECTION = "landsat-c2l2-sr"


def _run_id() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")


def _year_windows(start_year: int, end_year: int) -> list[tuple[int, str]]:
    if end_year < start_year:
        raise ValueError("end_year must be >= start_year")
    return [
        (
            year,
            f"{year}-01-01T00:00:00Z/{year}-12-31T23:59:59Z",
        )
        for year in range(start_year, end_year + 1)
    ]


def _compact_feature(feature: dict[str, Any]) -> dict[str, Any]:
    props = feature.get("properties") or {}
    return {
        "id": feature.get("id"),
        "collection": feature.get("collection"),
        "datetime": props.get("datetime"),
        "platform": props.get("platform"),
        "instruments": props.get("instruments"),
        "cloud_cover": props.get("eo:cloud_cover"),
        "wrs_path": props.get("landsat:wrs_path"),
        "wrs_row": props.get("landsat:wrs_row"),
        "bbox": feature.get("bbox"),
        "asset_keys": sorted((feature.get("assets") or {}).keys()),
    }


def _request_json(
    url: str,
    *,
    method: str = "POST",
    body: dict[str, Any] | None = None,
    timeout: float = 60.0,
    retries: int = 5,
) -> dict[str, Any]:
    encoded = None if body is None else json.dumps(body).encode("utf-8")
    headers = {
        "Accept": "application/geo+json, application/json",
        "Content-Type": "application/json",
        "User-Agent": "Terraforming-Planet-Terra-Research/1.0",
    }
    for attempt in range(retries):
        try:
            request = Request(url, data=encoded, headers=headers, method=method.upper())
            with urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed HTTPS STAC URL
                payload = json.loads(response.read().decode("utf-8"))
            if not isinstance(payload, dict):
                raise RuntimeError("STAC response was not a JSON object")
            return payload
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            if attempt + 1 >= retries:
                raise RuntimeError(f"STAC request failed after {retries} attempts: {exc}") from exc
            time.sleep(min(30.0, 2.0**attempt))
    raise RuntimeError("unreachable")


def _next_request(payload: dict[str, Any]) -> tuple[str, str, dict[str, Any] | None] | None:
    for link in payload.get("links") or []:
        if link.get("rel") != "next" or not link.get("href"):
            continue
        method = str(link.get("method") or "GET").upper()
        body = link.get("body") if isinstance(link.get("body"), dict) else None
        return str(link["href"]), method, body
    return None


def scan_usgs_landsat(
    *,
    target_scenes: int,
    start_year: int,
    end_year: int,
    collection: str,
    output_dir: Path,
    page_size: int = 500,
) -> dict[str, Any]:
    if target_scenes <= 0:
        raise ValueError("target_scenes must be positive")
    output_dir.mkdir(parents=True, exist_ok=True)
    scenes_path = output_dir / "scenes.jsonl"
    events_path = output_dir / "events.jsonl"

    windows = _year_windows(start_year, end_year)
    quota_per_year = math.ceil(target_scenes / len(windows))
    seen: set[str] = set()
    counts_by_year: dict[str, int] = {}
    request_count = 0
    started = datetime.now(UTC)

    with scenes_path.open("w", encoding="utf-8") as scenes_file, events_path.open(
        "w", encoding="utf-8"
    ) as events_file:
        for year, interval in windows:
            if len(seen) >= target_scenes:
                break
            year_count = 0
            url = USGS_STAC_SEARCH
            method = "POST"
            body: dict[str, Any] | None = {
                "collections": [collection],
                "datetime": interval,
                "limit": min(max(page_size, 1), 1000),
            }
            while year_count < quota_per_year and len(seen) < target_scenes:
                payload = _request_json(url, method=method, body=body)
                request_count += 1
                features = payload.get("features") or []
                if not features:
                    break
                added = 0
                for raw_feature in features:
                    if not isinstance(raw_feature, dict):
                        continue
                    feature_id = raw_feature.get("id")
                    if not isinstance(feature_id, str) or not feature_id or feature_id in seen:
                        continue
                    seen.add(feature_id)
                    compact = _compact_feature(raw_feature)
                    scenes_file.write(json.dumps(compact, separators=(",", ":")) + "\n")
                    year_count += 1
                    added += 1
                    if year_count >= quota_per_year or len(seen) >= target_scenes:
                        break
                scenes_file.flush()
                event = {
                    "event": "catalog_page",
                    "year": year,
                    "added": added,
                    "year_total": year_count,
                    "unique_total": len(seen),
                    "request_count": request_count,
                }
                events_file.write(json.dumps(event, separators=(",", ":")) + "\n")
                events_file.flush()
                print(json.dumps(event), flush=True)
                next_request = _next_request(payload)
                if next_request is None or added == 0:
                    break
                url, method, body = next_request
            counts_by_year[str(year)] = year_count

    ended = datetime.now(UTC)
    summary = {
        "schema": "terra-global-catalog-scan-v1",
        "source": "USGS Landsat Collection 2 STAC",
        "source_url": "https://landsatlook.usgs.gov/stac-server/",
        "collection": collection,
        "start_year": start_year,
        "end_year": end_year,
        "target_scenes": target_scenes,
        "unique_scenes_screened": len(seen),
        "request_count": request_count,
        "counts_by_year": counts_by_year,
        "started_at": started.isoformat(),
        "ended_at": ended.isoformat(),
        "elapsed_seconds": (ended - started).total_seconds(),
        "evidence_class": "CATALOG_METADATA_SCREENING",
        "pixel_analysis_completed": False,
        "note": (
            "Each row is a unique official USGS STAC scene record. This stage screens catalog "
            "metadata only; it must not be reported as full pixel analysis. Pixel work should use "
            "COG window/range reads or server-side processing for shortlisted scenes."
        ),
        "files": {
            "scenes": scenes_path.name,
            "events": events_path.name,
        },
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps({"event": "scan_complete", **summary}), flush=True)
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Screen 100k+ unique official USGS Landsat scene records without full downloads."
    )
    parser.add_argument("--target-scenes", type=int, default=200_000)
    parser.add_argument("--start-year", type=int, default=1990)
    parser.add_argument("--end-year", type=int, default=2026)
    parser.add_argument("--collection", default=DEFAULT_COLLECTION)
    parser.add_argument("--page-size", type=int, default=500)
    parser.add_argument("--output-dir", type=Path)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    output_dir = args.output_dir or Path("research_runs") / f"catalog_{_run_id()}"
    scan_usgs_landsat(
        target_scenes=args.target_scenes,
        start_year=args.start_year,
        end_year=args.end_year,
        collection=args.collection,
        output_dir=output_dir,
        page_size=args.page_size,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
