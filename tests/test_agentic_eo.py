from __future__ import annotations

import pytest

from terra_research_node.agentic_eo import (
    compare_surface_water_areas_data,
    load_evidence_case_data,
    load_training_context_data,
    search_eo_sources_data,
    verify_evidence_case_data,
)


def test_surface_water_source_search_includes_sentinel_1() -> None:
    matches = search_eo_sources_data("surface_water")
    ids = {item["id"] for item in matches}
    assert "esa-sentinel-1" in ids


def test_vistula_case_preserves_non_claim_flags() -> None:
    payload = load_evidence_case_data("vistula-test-014")
    assert payload["evidence_class"] == "OBSERVATION"
    assert payload["environmental_finding_claim"] is False
    assert payload["water_loss_claim"] is False
    assert payload["causal_claim"] is False


def test_vistula_verifier_does_not_promote_unproven_claims() -> None:
    report = verify_evidence_case_data("vistula-test-014")
    assert report["safe_claims"]["dataset_integrity_and_temporal_coverage"] is True
    assert report["safe_claims"]["environmental_finding"] is False
    assert report["safe_claims"]["water_loss"] is False
    assert report["safe_claims"]["causal_mechanism"] is False
    assert report["accepted_count"] == 72


def test_training_context_is_not_ground_truth() -> None:
    report = load_training_context_data("stream-gibs-20260820")
    assert report["streamed_windows"] == 200016
    assert report["scientific_finding_claim"] is False
    assert report["ground_truth_claim"] is False
    assert report["causal_environmental_claim"] is False


def test_surface_water_change_is_transparent_and_non_causal() -> None:
    report = compare_surface_water_areas_data(10.0, 7.5)
    assert report["difference_km2"] == -2.5
    assert report["percent_change"] == -25.0
    assert report["evidence_class"] == "DERIVED_VALUE"
    assert report["cause"].startswith("UNKNOWN")
    assert report["volume_change"].startswith("UNKNOWN")


def test_surface_water_change_rejects_invalid_baseline() -> None:
    with pytest.raises(ValueError):
        compare_surface_water_areas_data(0.0, 1.0)
