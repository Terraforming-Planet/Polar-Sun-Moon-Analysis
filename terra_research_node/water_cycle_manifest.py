from __future__ import annotations

import argparse
import json
import random
from collections.abc import Iterator
from pathlib import Path
from typing import Any, TypedDict, cast


class Region(TypedDict):
    id: str
    name: str
    lat: float
    lon: float
    span_deg: float
    tags: list[str]


CATEGORIES = (
    "green_water_rich",
    "dry_arid_desert",
    "polar_cryosphere",
    "experimental_paleochannel_counterfactual",
)
POLAR_TAGS = frozenset(
    {"arctic", "antarctica", "glacier", "ice", "ice-shelf", "permafrost", "snow"}
)
DRY_TAGS = frozenset(
    {
        "desert",
        "arid",
        "salt-flat",
        "dry-exposed-bed",
        "drought-context",
        "paleodrainage",
        "paleochannel",
    }
)
GREEN_TAGS = frozenset(
    {
        "forest",
        "wetland",
        "floodplain",
        "river",
        "lake",
        "lagoon",
        "delta",
        "estuary",
        "reservoir",
        "surface-water",
        "agriculture",
    }
)
EXPERIMENT_TAGS = frozenset(
    {
        "paleochannel",
        "paleodrainage",
        "desert",
        "arid",
        "river",
        "delta",
        "river-headwaters",
        "dry-exposed-bed",
    }
)
YEAR_GAPS = (1, 5, 10, 20, 29)
CORE_START_YEAR = 1996
CORE_END_YEAR = 2025
ANCHOR_HOLDOUT_REGION = "kuchnia-pond-pl"


def _load_json(path: Path) -> dict[str, Any]:
    loaded = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(loaded, dict):
        raise ValueError(f"Expected JSON object in {path}")
    return cast(dict[str, Any], loaded)


def load_regions(path: Path) -> list[Region]:
    payload = _load_json(path)
    raw_regions = payload.get("regions")
    if not isinstance(raw_regions, list):
        raise ValueError("Region registry must contain a regions list")

    regions: list[Region] = []
    for raw in raw_regions:
        if not isinstance(raw, dict):
            continue
        tags = raw.get("tags")
        if not isinstance(tags, list):
            continue
        region: Region = {
            "id": str(raw["id"]),
            "name": str(raw["name"]),
            "lat": float(raw["lat"]),
            "lon": float(raw["lon"]),
            "span_deg": float(raw["span_deg"]),
            "tags": [str(tag) for tag in tags],
        }
        regions.append(region)
    if not regions:
        raise ValueError("Region registry did not yield any usable regions")
    return regions


def _eligible(region: Region, category: str) -> bool:
    if region["id"] == ANCHOR_HOLDOUT_REGION:
        return False
    tags = set(region["tags"])
    if category == "polar_cryosphere":
        return bool(tags & POLAR_TAGS)
    if category == "dry_arid_desert":
        return bool(tags & DRY_TAGS) and not bool(tags & POLAR_TAGS)
    if category == "green_water_rich":
        return bool(tags & GREEN_TAGS) and not bool(tags & (POLAR_TAGS | DRY_TAGS))
    if category == "experimental_paleochannel_counterfactual":
        return bool(tags & EXPERIMENT_TAGS) and not bool(tags & POLAR_TAGS)
    raise ValueError(f"Unknown category: {category}")


def region_pools(regions: list[Region]) -> dict[str, list[Region]]:
    pools = {category: [r for r in regions if _eligible(r, category)] for category in CATEGORIES}
    empty = [category for category, pool in pools.items() if not pool]
    if empty:
        raise ValueError(f"No eligible regions for categories: {', '.join(empty)}")
    return pools


def quota_counts(config: dict[str, Any], total: int) -> dict[str, int]:
    if total < 4:
        raise ValueError("At least four packs are required")
    target = cast(dict[str, Any], config["target"])
    configured_total = int(target["temporal_change_packs"])
    distribution = cast(dict[str, dict[str, Any]], target["distribution"])
    if total == configured_total:
        return {category: int(distribution[category]["packs"]) for category in CATEGORIES}

    counts: dict[str, int] = {}
    allocated = 0
    for category in CATEGORIES[:-1]:
        percent = float(distribution[category]["percent"])
        count = int(total * percent / 100.0)
        counts[category] = count
        allocated += count
    counts[CATEGORIES[-1]] = total - allocated
    return counts


def _category_schedule(config: dict[str, Any], total: int, seed: int) -> list[str]:
    counts = quota_counts(config, total)
    schedule: list[str] = []
    for category in CATEGORIES:
        schedule.extend([category] * counts[category])
    random.Random(seed).shuffle(schedule)
    return schedule


def _season_definition(lat: float, index: int) -> dict[str, object]:
    spring_first = index % 2 == 0
    if abs(lat) < 23.5:
        first = "hydrological_window_a" if spring_first else "hydrological_window_b"
        second = "hydrological_window_b" if spring_first else "hydrological_window_a"
        return {
            "zone": "tropical",
            "primary": first,
            "secondary": second,
            "window_source": "derive from official precipitation climatology",
            "spring_autumn_label_allowed": False,
        }

    northern = lat >= 0.0
    if northern:
        spring = ["03-01", "05-31"]
        autumn = ["09-01", "11-30"]
    else:
        spring = ["09-01", "11-30"]
        autumn = ["03-01", "05-31"]
    primary_name = "spring" if spring_first else "autumn"
    secondary_name = "autumn" if spring_first else "spring"
    windows = {"spring": spring, "autumn": autumn}
    return {
        "zone": "polar" if abs(lat) >= 60.0 else "mid_latitude",
        "primary": primary_name,
        "secondary": secondary_name,
        "primary_window": windows[primary_name],
        "secondary_window": windows[secondary_name],
        "sar_first_if_optical_invalid": abs(lat) >= 60.0,
    }


def _temporal_pair(index: int) -> dict[str, object]:
    within_year = index % 5 == 0
    if within_year:
        year = CORE_START_YEAR + ((index // 5) % 30)
        return {
            "mode": "within_year_seasonal_response",
            "reference_year": year,
            "comparison_year": year,
            "year_gap": 0,
        }

    gap = YEAR_GAPS[index % len(YEAR_GAPS)]
    available_starts = CORE_END_YEAR - CORE_START_YEAR - gap + 1
    start = CORE_START_YEAR + ((index // len(YEAR_GAPS)) % available_starts)
    return {
        "mode": "same_season_cross_year",
        "reference_year": start,
        "comparison_year": start + gap,
        "year_gap": gap,
    }


def _experimental_subtask(index: int) -> str | None:
    bucket = index % 20
    if bucket < 10:
        return "paleochannel_candidate_detection"
    if bucket < 15:
        return "water_routing_counterfactual"
    if bucket < 18:
        return "downstream_consequence_analysis"
    return "negative_or_falsification_control"


def iter_manifest_records(
    config: dict[str, Any],
    regions: list[Region],
    total: int | None = None,
    seed: int = 4004,
) -> Iterator[dict[str, object]]:
    target = cast(dict[str, Any], config["target"])
    pack_total = int(target["temporal_change_packs"]) if total is None else total
    pools = region_pools(regions)
    schedule = _category_schedule(config, pack_total, seed)
    category_index = {category: 0 for category in CATEGORIES}

    for global_index, category in enumerate(schedule):
        local_index = category_index[category]
        category_index[category] += 1
        pool = pools[category]
        region = pool[local_index % len(pool)]
        season = _season_definition(region["lat"], local_index)
        temporal = _temporal_pair(local_index)
        experimental = None
        if category == "experimental_paleochannel_counterfactual":
            experimental = _experimental_subtask(local_index)

        yield {
            "pack_id": f"T004-W30-{global_index + 1:07d}",
            "dataset_schema": config["schema"],
            "category": category,
            "region_id": region["id"],
            "region_name": region["name"],
            "center": {"lat": region["lat"], "lon": region["lon"]},
            "region_span_deg": region["span_deg"],
            "region_tags": region["tags"],
            "season": season,
            "temporal": temporal,
            "spatial_windows": {
                "landsat_historic_core_km": 15.36,
                "sentinel2_recent_detail_km": 5.12,
                "dem_regional_context_km_at_90m": 46.08,
            },
            "acquisition_policy": {
                "optical_preferred_cloud_percent_max": 15,
                "optical_fallback_cloud_percent_max": 30,
                "no_valid_optical_action": "UNKNOWN_and_optional_SAR_complement",
                "official_public_only": True,
                "require_product_or_granule_id": True,
            },
            "preferred_evidence": [
                "Landsat Collection 2 Level-2 Surface Reflectance",
                "Sentinel-2 Level-2A for recent detail",
                "Sentinel-1/OPERA radar when complementary or cloud-limited",
                "NASADEM or authorized Copernicus DEM context",
                "JRC Global Surface Water as derived cross-check",
            ],
            "terrain_features": [
                "elevation",
                "local_relief",
                "slope",
                "flow_direction_if_auditable",
                "flow_accumulation_if_auditable",
                "height_above_drainage_if_auditable",
            ],
            "candidate_change_classes": [
                "surface_water_loss",
                "surface_water_gain",
                "seasonal_recurrence_change",
                "shoreline_or_channel_migration",
                "potential_overbank_spill_context",
                "no_material_change",
                "unknown",
            ],
            "experimental_subtask": experimental,
            "claim_boundary": {
                "change_measurement": "DERIVED_VALUE_unless_independently_validated",
                "spill_risk": "MODEL_ESTIMATE",
                "paleochannel_or_intervention": "HYPOTHESIS_or_MODEL_ESTIMATE",
                "causal_claim_from_correlation": False,
                "training_metric_is_environmental_finding": False,
            },
            "test_001_exact_pixels_excluded": region["id"] != ANCHOR_HOLDOUT_REGION,
        }


def build_manifest(
    config_path: Path,
    regions_path: Path,
    output_path: Path,
    total: int | None = None,
    seed: int = 4004,
) -> dict[str, object]:
    config = _load_json(config_path)
    regions = load_regions(regions_path)
    pack_total = int(config["target"]["temporal_change_packs"]) if total is None else total
    counts = quota_counts(config, pack_total)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        for record in iter_manifest_records(config, regions, pack_total, seed):
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True))
            handle.write("\n")

    summary: dict[str, object] = {
        "schema": "terra-training-004-water-cycle-manifest-summary-v1",
        "config": str(config_path),
        "regions": str(regions_path),
        "output": str(output_path),
        "packs": pack_total,
        "category_counts": counts,
        "core_years": [CORE_START_YEAR, CORE_END_YEAR],
        "test_001_anchor_holdout_region": ANCHOR_HOLDOUT_REGION,
        "data_downloaded": False,
        "next_stage": "resolve each slot against official catalogues on L4/CDSE",
    }
    summary_path = output_path.with_suffix(".summary.json")
    summary_path.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Training #4 30-year water-cycle slots")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config/training-004-water-cycle-30y.json"),
    )
    parser.add_argument(
        "--regions",
        type=Path,
        default=Path("config/global_training_regions.json"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("research_runs/training004_water_cycle_manifest.jsonl"),
    )
    parser.add_argument("--count", type=int, default=None)
    parser.add_argument("--seed", type=int, default=4004)
    args = parser.parse_args()
    summary = build_manifest(args.config, args.regions, args.output, args.count, args.seed)
    print(json.dumps(summary, indent=2, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
