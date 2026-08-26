from __future__ import annotations

import json
from collections import Counter
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

from .training004_sources.common import EvidenceClass, canonical_hash
from .water_cycle_manifest import ANCHOR_HOLDOUT_REGION, CATEGORIES

FROZEN_IDS = frozenset({*(f"B{i:02d}" for i in range(1, 11)), *(f"M{i:03d}" for i in range(1, 7))})


def acquisition_key(record: dict[str, Any]) -> str:
    center = cast(dict[str, Any], record["sample_center"])
    temporal = cast(dict[str, Any], record["temporal"])
    season = cast(dict[str, Any], record["season"])
    key = {
        "provider": "USGS",
        "sensor_family": "landsat-c2l2-sr",
        "cell": [round(float(center["lat"]) * 2) / 2, round(float(center["lon"]) * 2) / 2],
        "years": [temporal["reference_year"], temporal["comparison_year"]],
        "mode": temporal["mode"],
        "windows": [season.get("primary_window"), season.get("secondary_window")],
        "quality_policy": "cloud15_fallback30_qa_pixel_v1",
    }
    return canonical_hash(key)


@dataclass
class AcquisitionPlan:
    unique: dict[str, dict[str, Any]]
    pack_to_key: dict[str, str]

    @classmethod
    def build(cls, records: Iterable[dict[str, Any]]) -> AcquisitionPlan:
        unique: dict[str, dict[str, Any]] = {}
        mapping: dict[str, str] = {}
        for record in records:
            key = acquisition_key(record)
            pack_id = str(record["pack_id"])
            mapping[pack_id] = key
            if key not in unique:
                unique[key] = {
                    "acquisition_key": key,
                    "request": record,
                    "asset_reuse_count": 0,
                    "state": "PENDING",
                }
            unique[key]["asset_reuse_count"] = int(unique[key]["asset_reuse_count"]) + 1
        return cls(unique, mapping)

    def write(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "schema": "terra-training-004-acquisition-plan-v1",
            "unique_request_count": len(self.unique),
            "pack_count": len(self.pack_to_key),
            "requests": self.unique,
            "pack_to_key": self.pack_to_key,
        }
        path.write_text(json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8")


def split_for_group(region_id: str) -> str:
    if region_id == ANCHOR_HOLDOUT_REGION:
        raise ValueError("TEST 001 is an anchor holdout, not a Training #4 split member")
    value = int(canonical_hash({"region_id": region_id})[:8], 16) % 100
    if value < 75:
        return "train"
    if value < 90:
        return "validation"
    return "final_geographic_holdout"


def build_split_manifest(records: Iterable[dict[str, Any]], path: Path) -> dict[str, Any]:
    groups: dict[str, str] = {}
    counts: Counter[str] = Counter()
    category_counts: dict[str, Counter[str]] = {category: Counter() for category in CATEGORIES}
    output: list[dict[str, str]] = []
    for record in records:
        region = str(record["region_id"])
        pack_id = str(record["pack_id"])
        if region == ANCHOR_HOLDOUT_REGION or pack_id in FROZEN_IDS:
            raise ValueError(f"Evaluation leakage detected: {pack_id}/{region}")
        split = groups.setdefault(region, split_for_group(region))
        category = str(record["category"])
        counts[split] += 1
        category_counts[category][split] += 1
        output.append({"pack_id": pack_id, "group_key": region, "split": split})
    payload: dict[str, Any] = {
        "schema": "terra-training-004-geographic-split-v1",
        "rule": "region/watershed group before windows; stable SHA-256 75/15/10",
        "test001_excluded": True,
        "frozen_external_cases_excluded": sorted(FROZEN_IDS),
        "counts": dict(counts),
        "category_counts": {key: dict(value) for key, value in category_counts.items()},
        "records": output,
    }
    payload["deterministic_hash"] = canonical_hash(payload)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return payload


def build_evidence_package(
    record: dict[str, Any],
    resolved: dict[str, Any] | None = None,
    *,
    quality: dict[str, Any] | None = None,
    derived: dict[str, Any] | None = None,
) -> dict[str, Any]:
    selected: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    status = "UNKNOWN/UNAVAILABLE"
    if resolved is not None:
        status = str(resolved.get("status", status))
        for slot in ("reference_observation", "comparison_observation"):
            observation = resolved.get(slot)
            if isinstance(observation, dict):
                (selected if observation.get("status") == "selected" else rejected).append(
                    {"slot": slot, **observation}
                )
    evidence_class = (
        EvidenceClass.OBSERVATION.value if status == "RESOLVED" else EvidenceClass.UNKNOWN.value
    )
    package: dict[str, Any] = {
        "schema": "terra-eo-evidence-package/v1",
        "question_or_mission_id": str(record["pack_id"]),
        "aoi": record["sample_center"],
        "time": record["temporal"],
        "season": record["season"],
        "selected_sources": selected,
        "rejected_sources": rejected,
        "quality": quality or {},
        "derived_metrics": derived or {},
        "terrain_hydrology": {"state": "UNKNOWN", "reason": "not_resolved_in_this_package"},
        "evidence_classes": [evidence_class],
        "uncertainty_and_limitations": [
            "Mapped 2-D water area is not depth or volume.",
            "Morphology does not establish physical cause.",
        ],
        "missing_evidence": [] if status == "RESOLVED" else ["scientifically_valid_optical_pair"],
        "recommended_next_observation": (
            "Validate with an independent official product or in-situ record."
        ),
    }
    package["provenance_hash"] = canonical_hash(package)
    return package


def representative_records(path: Path, maximum: int) -> list[dict[str, Any]]:
    if maximum < 4:
        raise ValueError("Smoke mode requires at least four packs")
    base, remainder = divmod(maximum, len(CATEGORIES))
    targets = {
        category: base + (1 if index < remainder else 0)
        for index, category in enumerate(CATEGORIES)
    }
    buckets: dict[str, list[dict[str, Any]]] = {name: [] for name in CATEGORIES}
    for record in iter_jsonl(path):
        category = str(record.get("category"))
        if category in buckets and len(buckets[category]) < targets[category]:
            buckets[category].append(record)
        if all(len(buckets[name]) >= targets[name] for name in CATEGORIES):
            break
    if any(len(buckets[name]) < targets[name] for name in CATEGORIES):
        raise ValueError("Manifest does not represent all four categories")
    return [
        record
        for index in range(max(targets.values()))
        for record in (buckets[name][index] for name in CATEGORIES if index < len(buckets[name]))
    ]


def iter_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                yield cast(dict[str, Any], json.loads(line))
