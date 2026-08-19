from __future__ import annotations

import hashlib
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"}
EXCLUDED_PARTS = {
    ".git",
    ".venv",
    "node_modules",
    "research_runs",
    "dist",
    "__pycache__",
    "charts",
    "screenshots",
}
EXCLUDED_NAME_TOKENS = {"logo", "icon", "avatar", "banner", "splash", "ui-"}
ROOTS = (
    "research_cache",
    "cache",
    "data",
    "docs/published",
    "web/public",
)


@dataclass(slots=True, frozen=True)
class EarthObservationRecord:
    path: str
    source_family: str
    domain: str
    year: int | None
    split: str
    record_id: str


def _infer_source(text: str) -> str:
    if "sentinel-1" in text or "sentinel1" in text or "sar" in text or "opera" in text:
        return "sentinel_1_sar"
    if "sentinel-2" in text or "sentinel2" in text:
        return "sentinel_2_optical"
    if "landsat" in text or "usgs" in text:
        return "landsat"
    if "gibs" in text or "modis" in text or "viirs" in text:
        return "nasa_gibs"
    if "copernicus" in text:
        return "copernicus"
    return "other_earth_observation"


def _infer_domain(text: str) -> str:
    if any(token in text for token in ("river", "wisla", "vistula", "channel", "drain")):
        return "river"
    if any(token in text for token in ("lake", "jezior", "water", "mndwi")):
        return "surface_water"
    if any(token in text for token in ("flood", "powodz")):
        return "flood"
    if any(token in text for token in ("paleo", "sahara", "desert")):
        return "paleodrainage"
    if any(token in text for token in ("coast", "estuary", "ocean")):
        return "coast_ocean"
    if any(token in text for token in ("ice", "glacier", "snow", "arctic")):
        return "ice_snow"
    return "general_earth"


def _infer_year(text: str, start_year: int, end_year: int) -> int | None:
    for raw in re.findall(r"(?<!\d)(19\d{2}|20\d{2})(?!\d)", text):
        year = int(raw)
        if start_year <= year <= end_year:
            return year
    return None


def _split(record_id: str) -> str:
    bucket = int(record_id[:8], 16) % 100
    if bucket < 80:
        return "train"
    if bucket < 90:
        return "validation"
    return "test"


def _candidate_paths(repo_root: Path) -> list[Path]:
    found: set[Path] = set()
    for relative_root in ROOTS:
        root = repo_root / relative_root
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            lowered_parts = {part.lower() for part in path.parts}
            if lowered_parts & EXCLUDED_PARTS:
                continue
            lowered_name = path.name.lower()
            if any(token in lowered_name for token in EXCLUDED_NAME_TOKENS):
                continue
            text = path.as_posix().lower()
            if not any(
                token in text
                for token in (
                    "landsat",
                    "sentinel",
                    "satellite",
                    "copernicus",
                    "gibs",
                    "sar",
                    "water",
                    "river",
                    "lake",
                    "flood",
                    "ocean",
                    "sahara",
                    "arctic",
                    "experiment",
                    "published",
                )
            ):
                continue
            found.add(path)
    return sorted(found, key=lambda path: path.as_posix())


def build_earth_observation_dataset(
    repo_root: Path,
    *,
    start_year: int = 1990,
    end_year: int = 2026,
    max_images: int = 768,
) -> tuple[list[EarthObservationRecord], dict[str, Any]]:
    """Create a deterministic, provenance-friendly dataset index from local project imagery."""
    records: list[EarthObservationRecord] = []
    for path in _candidate_paths(repo_root):
        relative = path.relative_to(repo_root).as_posix()
        text = relative.lower()
        record_id = hashlib.sha256(relative.encode("utf-8")).hexdigest()
        records.append(
            EarthObservationRecord(
                path=relative,
                source_family=_infer_source(text),
                domain=_infer_domain(text),
                year=_infer_year(text, start_year, end_year),
                split=_split(record_id),
                record_id=record_id,
            )
        )

    # Round-robin across source/domain strata so one directory cannot dominate the run.
    strata: dict[tuple[str, str], list[EarthObservationRecord]] = {}
    for record in records:
        strata.setdefault((record.source_family, record.domain), []).append(record)
    for items in strata.values():
        items.sort(key=lambda item: (item.year is None, item.year or 9999, item.path))

    selected: list[EarthObservationRecord] = []
    keys = sorted(strata)
    while keys and len(selected) < max_images:
        next_keys: list[tuple[str, str]] = []
        for key in keys:
            items = strata[key]
            if items and len(selected) < max_images:
                selected.append(items.pop(0))
            if items:
                next_keys.append(key)
        keys = next_keys

    def counts(field: str) -> dict[str, int]:
        result: dict[str, int] = {}
        for record in selected:
            value = getattr(record, field)
            key = "unknown" if value is None else str(value)
            result[key] = result.get(key, 0) + 1
        return dict(sorted(result.items()))

    manifest: dict[str, Any] = {
        "schema": "terra-earth-observation-dataset-v1",
        "purpose": (
            "Self-supervised Earth-observation pretraining and later water/river fine-tuning. "
            "No context JSON/CSV is promoted to pixel ground truth."
        ),
        "start_year": start_year,
        "end_year": end_year,
        "candidate_count": len(records),
        "selected_count": len(selected),
        "max_images": max_images,
        "counts_by_source": counts("source_family"),
        "counts_by_domain": counts("domain"),
        "counts_by_split": counts("split"),
        "counts_by_year": counts("year"),
        "records": [asdict(record) for record in selected],
    }
    return selected, manifest
