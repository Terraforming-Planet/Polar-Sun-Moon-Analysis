"""Transparent environmental change calculations with explicit evidence classes."""

from __future__ import annotations

from collections import Counter
from typing import Any


def analyze_lake_change(
    area_before_km2: float,
    area_after_km2: float,
    before_date: str,
    after_date: str,
    cloud_fraction_before: float | None = None,
    cloud_fraction_after: float | None = None,
) -> dict[str, Any]:
    """Measure area change without pretending that area alone is volume."""
    if area_before_km2 <= 0 or area_after_km2 < 0:
        raise ValueError("Lake areas must be physically valid")
    change = area_after_km2 - area_before_km2
    return {
        "evidence_class": "DERIVED_VALUE",
        "before": {"date": before_date, "area_km2": area_before_km2},
        "after": {"date": after_date, "area_km2": area_after_km2},
        "absolute_change_km2": change,
        "percent_change": change / area_before_km2 * 100,
        "cloud_fraction": {
            "before": cloud_fraction_before,
            "after": cloud_fraction_after,
        },
        "volume_change": None,
        "volume_notice": "UNKNOWN: bathymetry or an area-elevation-volume curve is required.",
        "hypotheses": [
            "precipitation deficit",
            "higher evaporation",
            "changed inflow or outflow",
            "water abstraction or irrigation",
            "dam, drainage or land-cover change",
        ],
    }


def classify_fire_activity(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarize FIRMS detections without converting detections into false forecasts."""
    confidence = Counter(str(record.get("confidence", "unknown")) for record in records)
    frp_values = [float(record["frp"]) for record in records if record.get("frp")]
    return {
        "evidence_class": "DERIVED_VALUE",
        "detections": len(records),
        "confidence_counts": dict(confidence),
        "mean_fire_radiative_power_mw": sum(frp_values) / len(frp_values)
        if frp_values
        else None,
        "forecast": None,
        "notice": "A hotspot is evidence of a thermal anomaly, not a standalone spread forecast.",
    }
