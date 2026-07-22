"""Honest capability boundaries for mountain water and seafloor research."""

from __future__ import annotations


def mountain_water_method() -> dict[str, object]:
    """Describe an evidence fusion method rather than a fake direct measurement."""
    return {
        "evidence_class": "MODEL_ESTIMATE",
        "spaceborne_inputs": ["snow water equivalent", "SMAP", "GRACE-FO", "InSAR"],
        "ground_validation": ["ERT", "magnetotellurics", "seismic", "boreholes", "piezometers"],
        "limitation": "No satellite directly maps fracture-scale water inside mountain rock.",
    }


def seafloor_method() -> dict[str, object]:
    """Separate coarse satellite inference from direct acoustic surveys."""
    return {
        "satellite_inference": ["radar altimetry", "SWOT sea-surface height", "gravity field"],
        "direct_mapping": ["multibeam sonar", "AUV/ROV sonar", "sub-bottom profiler"],
        "electromagnetic_validation": ["marine CSEM", "magnetotellurics"],
        "limitation": "Satellites do not directly see deep seafloor through seawater.",
    }
