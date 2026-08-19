from __future__ import annotations

import argparse
import hashlib
import json
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from PIL import Image

from .global_public_dataset import Region, _cell_bbox, _load_regions


@dataclass(frozen=True, slots=True)
class AdapterSpec:
    id: str
    name: str
    endpoint: str
    collections: tuple[str, ...]
    region_ids: frozenset[str]
    start_year: int
    end_year: int


@dataclass(frozen=True, slots=True)
class AdapterImageRecord:
    path: str
    sha256: str
    source: str
    source_family: str
    region_id: str
    region_name: str
    observation_date: str
    bbox: tuple[float, float, float, float]
    source_scene_id: str | None
    source_url: str
    derived_window: bool
    evidence_class: str = "OBSERVATION"


AUSTRALIA_REGIONS = frozenset(
    {
        "murray-darling",
        "lake-eyre",
        "coorong",
        "great-barrier-reef-coast",
        "control-simpson-desert",
    }
)
SOUTH_AMERICA_REGIONS = frozenset(
    {
        "amazon-manaus",
        "amazon-obidos",
        "pantanal",
        "parana-delta",
        "orinoco-delta",
        "atacama-salar",
    }
)

ADAPTERS = (
    AdapterSpec(
        id="digital-earth-australia",
        name="Digital Earth Australia",
        endpoint="https://explorer.dea.ga.gov.au/stac/search",
        collections=(
            "ga_s2am_ard_3",
            "ga_s2bm_ard_3",
            "ga_s2cm_ard_3",
            "ga_ls8c_ard_3",
            "ga_ls9c_ard_3",
        ),
        region_ids=AUSTRALIA_REGIONS,
        start_year=2015,
        end_year=2026,
    ),
    AdapterSpec(
        id="inpe-brazil-data-cube",
        name="INPE Brazil Data Cube",
        endpoint="https://data.inpe.br/bdc/stac/v1/search",
        collections=("AMZ1-WFI-L4-SR-1", "CB4-WFI-L4-SR-1", "CB4A-WFI-L4-SR-1"),
        region_ids=SOUTH_AMERICA_REGIONS,
        start_year=2021,
        end_year=2026,
    ),
)

TARGET_DATES = ((3, 15), (6, 15), (9, 15), (12, 15))
RETRYABLE_HTTP = {408, 425, 429, 500, 502, 503, 504}


def _safe_asset_url(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if parsed.scheme != "https":
        return False
    if host == "data.inpe.br" or host.endswith(".inpe.br"):
        return True
    if host == "explorer.dea.ga.gov.au" or host.endswith(".dea.ga.gov.au"):
        return True
    return host.endswith("amazonaws.com") and "dea-public-data" in url


def _request_json(url: str, body: dict[str, Any], retries: int = 4) -> dict[str, Any]:
    payload = json.dumps(body).encode("utf-8")
    request = Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Terraforming-Planet-TP26-Public-Adapter-Harvest/1.0",
        },
    )
    for attempt in range(retries):
        try:
            with urlopen(request, timeout=45.0) as response:  # noqa: S310 - fixed HTTPS APIs
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            if exc.code not in RETRYABLE_HTTP or attempt + 1 >= retries:
                raise
        except (URLError, TimeoutError):
            if attempt + 1 >= retries:
                raise
        time.sleep(min(12.0, 1.5 * (2**attempt)))
    raise RuntimeError("adapter request retries exhausted")


def _download(url: str, path: Path) -> None:
    if not _safe_asset_url(url):
        raise RuntimeError(f"Refusing unapproved adapter asset URL: {url}")
    request = Request(url, headers={"User-Agent": "Terraforming-Planet-TP26/1.0"})
    with urlopen(request, timeout=90.0) as response:  # noqa: S310 - URL validated above
        payload = response.read()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    temporary.write_bytes(payload)
    try:
        with Image.open(temporary) as image:
            image.verify()
    except OSError as exc:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"Adapter asset is not a readable image: {url}") from exc
    if temporary.stat().st_size <= 1024:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"Adapter asset is too small to be useful: {url}")
    temporary.replace(path)


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _item_date(item: dict[str, Any]) -> str:
    props = item.get("properties") or {}
    return str(props.get("datetime") or props.get("start_datetime") or "")[:10]


def _cloud_cover(item: dict[str, Any]) -> float:
    props = item.get("properties") or {}
    for key in ("eo:cloud_cover", "cloud_cover", "cloudCover"):
        value = props.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return 1000.0


def _thumbnail(item: dict[str, Any]) -> str | None:
    assets = item.get("assets") or {}
    for key in ("thumbnail", "rendered_preview", "preview", "quicklook", "visual"):
        candidate = assets.get(key)
        if isinstance(candidate, dict):
            href = candidate.get("href")
            if isinstance(href, str) and _safe_asset_url(href):
                return href
    return None


def _nearest(items: list[dict[str, Any]], target: datetime) -> dict[str, Any] | None:
    candidates: list[tuple[float, float, dict[str, Any]]] = []
    for item in items:
        text = _item_date(item)
        if not text:
            continue
        try:
            date = datetime.fromisoformat(text).replace(tzinfo=UTC)
        except ValueError:
            continue
        candidates.append((abs((date - target).total_seconds()), _cloud_cover(item), item))
    return min(candidates, default=None, key=lambda row: (row[0], row[1]))[2] if candidates else None


def _search(
    adapter: AdapterSpec,
    collection: str,
    region: Region,
    year: int,
    month: int,
    day: int,
) -> dict[str, Any] | None:
    bbox = _cell_bbox(region, 1, 0)
    target = datetime(year, month, day, tzinfo=UTC)
    start_month = max(1, month - 1)
    end_month = min(12, month + 1)
    payload = {
        "collections": [collection],
        "bbox": list(bbox),
        "datetime": (
            f"{year:04d}-{start_month:02d}-01T00:00:00Z/"
            f"{year:04d}-{end_month:02d}-28T23:59:59Z"
        ),
        "limit": 50,
    }
    response = _request_json(adapter.endpoint, payload)
    features = [item for item in response.get("features") or [] if isinstance(item, dict)]
    return _nearest(features, target)


def _load_hashes(manifest: Path) -> set[str]:
    hashes: set[str] = set()
    if not manifest.exists():
        return hashes
    for line in manifest.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            raw = json.loads(line)
        except json.JSONDecodeError:
            continue
        value = raw.get("sha256")
        if isinstance(value, str):
            hashes.add(value)
    return hashes


def _append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, separators=(",", ":")) + "\n")


def harvest(repo_root: Path, max_per_adapter: int = 2000) -> dict[str, Any]:
    regions = _load_regions(repo_root / "config" / "global_training_regions.json")
    region_by_id = {region.id: region for region in regions}
    cache_root = repo_root / "research_cache" / "global_public_dataset"
    manifest = cache_root / "records.jsonl"
    run_root = repo_root / "research_runs" / f"adapter_harvest_{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"
    failures = run_root / "failures.jsonl"
    run_root.mkdir(parents=True, exist_ok=True)
    hashes = _load_hashes(manifest)
    counts: dict[str, int] = {}

    for adapter in ADAPTERS:
        count = 0
        selected_regions = [region_by_id[key] for key in adapter.region_ids if key in region_by_id]
        for region in selected_regions:
            if count >= max_per_adapter:
                break
            end_year = min(adapter.end_year, datetime.now(UTC).year)
            for year in range(adapter.start_year, end_year + 1):
                if count >= max_per_adapter:
                    break
                for month, day in TARGET_DATES:
                    if count >= max_per_adapter:
                        break
                    for collection in adapter.collections:
                        try:
                            item = _search(adapter, collection, region, year, month, day)
                            if item is None:
                                continue
                            url = _thumbnail(item)
                            if not url:
                                continue
                            scene_id = str(item.get("id") or "unknown")
                            observed = _item_date(item) or f"{year:04d}-{month:02d}-{day:02d}"
                            suffix = ".png" if ".png" in url.lower() else ".jpg"
                            path = (
                                cache_root
                                / adapter.id
                                / collection
                                / region.id
                                / f"{observed}-{scene_id}{suffix}"
                            )
                            if not path.exists():
                                _download(url, path)
                            sha = _hash(path)
                            if sha in hashes:
                                continue
                            record = AdapterImageRecord(
                                path=path.as_posix(),
                                sha256=sha,
                                source=adapter.name,
                                source_family=f"{adapter.id}:{collection}",
                                region_id=region.id,
                                region_name=region.name,
                                observation_date=observed,
                                bbox=_cell_bbox(region, 1, 0),
                                source_scene_id=scene_id,
                                source_url=url,
                                derived_window=False,
                            )
                            _append_jsonl(manifest, asdict(record))
                            hashes.add(sha)
                            count += 1
                            print(
                                json.dumps(
                                    {
                                        "event": "public_adapter_image",
                                        "adapter": adapter.id,
                                        "collection": collection,
                                        "region": region.id,
                                        "scene_id": scene_id,
                                        "unique_total": len(hashes),
                                    },
                                    separators=(",", ":"),
                                ),
                                flush=True,
                            )
                            break
                        except (HTTPError, URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
                            _append_jsonl(
                                failures,
                                {
                                    "adapter": adapter.id,
                                    "collection": collection,
                                    "region": region.id,
                                    "year": year,
                                    "month": month,
                                    "error": str(exc),
                                },
                            )
        counts[adapter.id] = count

    summary = {
        "schema": "tp26-public-adapter-harvest-v1",
        "generated_at": datetime.now(UTC).isoformat(),
        "counts_by_adapter": counts,
        "manifest": manifest.as_posix(),
        "unique_hashes_after": len(hashes),
        "failure_log": failures.as_posix(),
        "evidence_class": "OBSERVATION",
    }
    (run_root / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps({"event": "public_adapter_harvest_complete", **summary}), flush=True)
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Harvest additional public TP-26 satellite imagery from DEA and INPE."
    )
    parser.add_argument("--max-per-adapter", type=int, default=2000)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    repo_root = Path(__file__).resolve().parents[1]
    harvest(repo_root, max_per_adapter=max(1, args.max_per_adapter))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
