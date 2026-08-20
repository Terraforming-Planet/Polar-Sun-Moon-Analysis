from __future__ import annotations

import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass(frozen=True, slots=True)
class Probe:
    id: str
    name: str
    url: str
    expected: str
    public: bool = True


PROBES = (
    Probe(
        "nasa-gibs",
        "NASA GIBS WMTS",
        "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml",
        "xml",
    ),
    Probe(
        "copernicus-stac",
        "Copernicus Data Space STAC",
        "https://stac.dataspace.copernicus.eu/v1/collections",
        "json",
    ),
    Probe(
        "usgs-landsat",
        "USGS Landsat STAC",
        "https://landsatlook.usgs.gov/stac-server/collections",
        "json",
    ),
    Probe(
        "nasa-cmr-stac",
        "NASA CMR-STAC",
        "https://cmr.earthdata.nasa.gov/stac/",
        "json",
    ),
    Probe(
        "eumetview",
        "EUMETSAT EUMETView WMS",
        "https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities",
        "xml",
    ),
    Probe(
        "eumetsat-store",
        "EUMETSAT Data Store browse",
        "https://api.eumetsat.int/data/browse/collections",
        "json",
    ),
    Probe(
        "dea-stac",
        "Digital Earth Australia STAC",
        "https://explorer.dea.ga.gov.au/stac/collections",
        "json",
    ),
    Probe(
        "inpe-stac",
        "INPE Brazil Data Cube STAC",
        "https://data.inpe.br/bdc/stac/v1/collections",
        "json",
    ),
)


def _probe(probe: Probe, timeout: float = 25.0, retries: int = 3) -> dict[str, object]:
    started = time.monotonic()
    error = ""
    status = 0
    size = 0
    content_type = ""
    for attempt in range(retries):
        try:
            request = Request(
                probe.url,
                headers={"User-Agent": "Terraforming-Planet-TP26-Adapter-Preflight/1.0"},
            )
            with urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed HTTPS URLs
                status = int(getattr(response, "status", 200))
                content_type = str(response.headers.get("Content-Type", ""))
                payload = response.read(256 * 1024)
                size = len(payload)
                if probe.expected == "json":
                    json.loads(payload.decode("utf-8"))
                elif probe.expected == "xml":
                    text = payload.lstrip().lower()
                    if not text.startswith(b"<"):
                        raise ValueError("response is not XML")
                return {
                    **asdict(probe),
                    "ok": 200 <= status < 400,
                    "http_status": status,
                    "content_type": content_type,
                    "sample_bytes": size,
                    "elapsed_ms": round((time.monotonic() - started) * 1000, 1),
                    "error": "",
                }
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            error = str(exc)
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))
    return {
        **asdict(probe),
        "ok": False,
        "http_status": status,
        "content_type": content_type,
        "sample_bytes": size,
        "elapsed_ms": round((time.monotonic() - started) * 1000, 1),
        "error": error,
    }


def run_preflight(repo_root: Path, workers: int = 6) -> dict[str, object]:
    results: list[dict[str, object]] = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = {executor.submit(_probe, probe): probe for probe in PROBES}
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            message = json.dumps(
                {"event": "adapter_probe", **result},
                separators=(",", ":"),
            )
            print(message, flush=True)

    results.sort(key=lambda item: str(item["id"]))
    summary = {
        "schema": "tp26-adapter-preflight-v1",
        "generated_at": datetime.now(UTC).isoformat(),
        "public_adapter_count": len(results),
        "healthy_count": sum(1 for item in results if item.get("ok") is True),
        "results": results,
        "credential_gated": [
            "Natural Resources Canada / CSA EODMS",
            "JAXA G-Portal",
            "ISRO / NRSC Bhoonidhi",
            "EUMETSAT product download API",
        ],
        "rule": (
            "A failed endpoint is a transport observation, not evidence that environmental "
            "data are absent."
        ),
    }
    output = repo_root / "research_runs" / "adapter_preflight_latest.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    completed = json.dumps(
        {"event": "adapter_preflight_complete", "path": str(output), **summary},
        default=str,
    )
    print(completed, flush=True)
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Probe public TP-26 Earth-observation adapters.")
    parser.add_argument("--workers", type=int, default=6)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    repo_root = Path(__file__).resolve().parents[1]
    run_preflight(repo_root, workers=args.workers)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
