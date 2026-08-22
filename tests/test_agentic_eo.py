from __future__ import annotations

import pytest

from terra_research_node.agentic_eo import (
    PublicTraceHooks,
    build_public_trace,
    compare_surface_water_areas_data,
    load_evidence_case_data,
    load_training_context_data,
    search_eo_sources_data,
    select_vistula_sources_data,
    specialist_consultations,
    validate_registry_provenance,
    verify_evidence_case_data,
)


def test_surface_water_source_search_includes_sentinel_1() -> None:
    matches = search_eo_sources_data("surface_water")
    ids = {item["id"] for item in matches}
    assert "esa-sentinel-1" in ids


def test_vistula_registry_selection_includes_three_complementary_sources() -> None:
    matches = select_vistula_sources_data()
    ids = {item["id"] for item in matches}
    assert {"esa-sentinel-1", "esa-sentinel-2", "usgs-landsat"} <= ids
    validate_registry_provenance(matches)


def test_sentinel_2_registry_metadata_is_scientifically_qualified() -> None:
    source = next(
        item for item in search_eo_sources_data("river_channel") if item["id"] == "esa-sentinel-2"
    )
    assert source["instrument"] == "MSI (MultiSpectral Instrument)"
    assert all(value in source["spatial_resolution"] for value in ("10 m", "20 m", "60 m"))
    assert "cloud" in source["limitations"].lower()
    assert "water depth" in source["limitations"].lower()


def test_landsat_registry_metadata_preserves_archive_differences() -> None:
    source = next(
        item for item in search_eo_sources_data("surface_water") if item["id"] == "usgs-landsat"
    )
    assert all(sensor in source["instrument"] for sensor in ("TM", "ETM+", "OLI", "OLI-2"))
    assert "30 m" in source["spatial_resolution"]
    assert "Sensor and platform differences" in source["limitations"]


def test_public_trace_records_boundaries_without_private_data() -> None:
    hooks = PublicTraceHooks()
    hooks.events = [
        {
            "event": "tool_start",
            "agent": "Terra Agentic EO Coordinator",
            "tool": "consult_eo_source_scout",
        },
        {
            "event": "tool_end",
            "agent": "Terra Agentic EO Coordinator",
            "tool": "consult_eo_source_scout",
            "status": "success",
        }
    ]

    class Result:
        last_agent = type("AgentStub", (), {"name": "Terra Agentic EO Coordinator"})()
        new_items = [type("ItemStub", (), {"type": "tool_call_item"})()]

    trace = build_public_trace(Result(), hooks, "test-model")
    serialized = str(trace).lower()
    assert "argument" not in serialized
    assert "prompt" not in serialized
    assert "api_key" not in serialized
    assert "authorization" not in serialized
    assert specialist_consultations(trace) == {"consult_eo_source_scout"}


def test_specialist_consultation_requires_observable_start_and_end() -> None:
    trace = {
        "events": [
            {
                "event": "tool_end",
                "tool": "consult_eo_source_scout",
                "status": "success",
            }
        ]
    }
    assert specialist_consultations(trace) == set()


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
