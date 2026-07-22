"""Privacy filtering for public environmental point layers."""

from __future__ import annotations

from typing import Any

RESIDENTIAL_TYPES = {"residential", "house", "apartments", "dormitory"}


def _inside(point: tuple[float, float], ring: list[list[float]]) -> bool:
    x, y = point
    result = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = previous[:2]
        x2, y2 = current[:2]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            result = not result
        previous = current
    return result


class PrivacyFilter:
    """Remove public point observations falling inside protected buildings."""

    def __init__(self, strict: bool = True) -> None:
        self.strict = strict

    def protected_polygons(self, buildings: dict[str, Any]) -> list[list[list[float]]]:
        polygons: list[list[list[float]]] = []
        for feature in buildings.get("features", []):
            properties = feature.get("properties", {})
            kind = str(properties.get("building", "unknown")).lower()
            if not self.strict and kind not in RESIDENTIAL_TYPES:
                continue
            geometry = feature.get("geometry", {})
            if geometry.get("type") == "Polygon" and geometry.get("coordinates"):
                polygons.append(geometry["coordinates"][0])
        return polygons

    def filter_points(
        self, observations: dict[str, Any], buildings: dict[str, Any]
    ) -> dict[str, Any]:
        protected = self.protected_polygons(buildings)
        kept: list[dict[str, Any]] = []
        removed = 0
        for feature in observations.get("features", []):
            geometry = feature.get("geometry", {})
            if geometry.get("type") != "Point":
                kept.append(feature)
                continue
            point = tuple(geometry.get("coordinates", [])[:2])
            if len(point) == 2 and any(_inside(point, polygon) for polygon in protected):
                removed += 1
            else:
                kept.append(feature)
        return {
            "type": "FeatureCollection",
            "privacy": {"mode": "strict" if self.strict else "residential", "removed": removed},
            "features": kept,
        }
