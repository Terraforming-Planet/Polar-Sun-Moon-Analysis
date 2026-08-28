from pathlib import Path

from terra_research_node.water_cycle_manifest import (
    ANCHOR_HOLDOUT_REGION,
    CATEGORIES,
    _load_json,
    iter_manifest_records,
    load_regions,
    quota_counts,
)

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "training-004-water-cycle-30y.json"
REGIONS = ROOT / "config" / "global_training_regions.json"


def test_full_target_has_exact_30_30_30_10_distribution() -> None:
    config = _load_json(CONFIG)
    assert quota_counts(config, 500_000) == {
        "green_water_rich": 150_000,
        "dry_arid_desert": 150_000,
        "polar_cryosphere": 150_000,
        "experimental_paleochannel_counterfactual": 50_000,
    }


def test_small_manifest_preserves_distribution_and_anchor_holdout() -> None:
    config = _load_json(CONFIG)
    regions = load_regions(REGIONS)
    records = list(iter_manifest_records(config, regions, total=100, seed=4004))

    assert len(records) == 100
    counts = {category: 0 for category in CATEGORIES}
    for record in records:
        counts[str(record["category"])] += 1
        assert record["region_id"] != ANCHOR_HOLDOUT_REGION
        temporal = record["temporal"]
        assert isinstance(temporal, dict)
        reference_year = int(temporal["reference_year"])
        comparison_year = int(temporal["comparison_year"])
        assert 1996 <= reference_year <= 2025
        assert 1996 <= comparison_year <= 2025

    assert counts == {
        "green_water_rich": 30,
        "dry_arid_desert": 30,
        "polar_cryosphere": 30,
        "experimental_paleochannel_counterfactual": 10,
    }


def test_manifest_does_not_encode_environmental_causality() -> None:
    config = _load_json(CONFIG)
    regions = load_regions(REGIONS)
    record = next(iter_manifest_records(config, regions, total=4, seed=4004))
    boundary = record["claim_boundary"]
    assert isinstance(boundary, dict)
    assert boundary["causal_claim_from_correlation"] is False
    assert boundary["training_metric_is_environmental_finding"] is False


def test_tropical_regions_do_not_receive_fake_spring_autumn_labels() -> None:
    config = _load_json(CONFIG)
    regions = load_regions(REGIONS)
    records = iter_manifest_records(config, regions, total=400, seed=4004)
    tropical = None
    for record in records:
        center = record["sample_center"]
        assert isinstance(center, dict)
        if abs(float(center["lat"])) < 23.5:
            tropical = record
            break
    assert tropical is not None
    season = tropical["season"]
    assert isinstance(season, dict)
    assert season["zone"] == "tropical"
    assert season["spring_autumn_label_allowed"] is False


def test_repeated_region_uses_multiple_nearby_sample_centers() -> None:
    config = _load_json(CONFIG)
    regions = load_regions(REGIONS)
    records = list(iter_manifest_records(config, regions, total=4000, seed=4004))
    centers_by_region: dict[str, set[tuple[float, float]]] = {}
    for record in records:
        region_id = str(record["region_id"])
        center = record["sample_center"]
        assert isinstance(center, dict)
        point = (round(float(center["lat"]), 6), round(float(center["lon"]), 6))
        centers_by_region.setdefault(region_id, set()).add(point)

    assert any(len(centers) > 1 for centers in centers_by_region.values())


def test_landsat_slc_off_is_never_interpreted_as_water_loss() -> None:
    config = _load_json(CONFIG)
    regions = load_regions(REGIONS)
    record = next(iter_manifest_records(config, regions, total=4, seed=4004))
    policy = record["acquisition_policy"]
    assert isinstance(policy, dict)
    assert policy["qa_pixel_required"] is True
    assert policy["landsat7_slc_off_gaps_after_2003_05_30"] == (
        "mask_as_invalid_not_water_loss"
    )
