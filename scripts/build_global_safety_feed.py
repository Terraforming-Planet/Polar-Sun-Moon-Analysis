#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import urllib.request
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA = ROOT / "web" / "public" / "data"
EVENTS_PATH = PUBLIC_DATA / "events" / "latest.json"
HAZARDS_PATH = PUBLIC_DATA / "hazards.json"


def get(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Terraforming-Planet-Monitor/7.0",
            "Accept": "application/json,text/csv,*/*",
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(path)


def valid_coordinate(value: Any, minimum: float, maximum: float) -> bool:
    return isinstance(value, (int, float)) and minimum <= float(value) <= maximum


def point_wkt(value: Any) -> tuple[float | None, float | None]:
    match = re.search(
        r"POINT\s*\(\s*([-+0-9.]+)\s+([-+0-9.]+)\s*\)",
        str(value or ""),
        re.I,
    )
    return (float(match.group(2)), float(match.group(1))) if match else (None, None)


def normalized_geojson_geometry(event: dict[str, Any]) -> dict[str, Any] | None:
    geometry = event.get("geometry")
    if isinstance(geometry, dict):
        geometry_type = geometry.get("type")
        coordinates = geometry.get("coordinates")
        if geometry_type == "Point" and isinstance(coordinates, list) and len(coordinates) >= 2:
            longitude, latitude = coordinates[:2]
            if valid_coordinate(longitude, -180, 180) and valid_coordinate(latitude, -90, 90):
                return {
                    "type": "Point",
                    "coordinates": [float(longitude), float(latitude)],
                }
        if geometry_type == "Polygon" and isinstance(coordinates, list) and coordinates:
            rings: list[list[list[float]]] = []
            for ring in coordinates:
                if not isinstance(ring, list) or len(ring) < 4:
                    return None
                normalized_ring: list[list[float]] = []
                for point in ring:
                    if not isinstance(point, list) or len(point) < 2:
                        return None
                    longitude, latitude = point[:2]
                    if not valid_coordinate(longitude, -180, 180) or not valid_coordinate(
                        latitude, -90, 90
                    ):
                        return None
                    normalized_ring.append([float(longitude), float(latitude)])
                rings.append(normalized_ring)
            return {"type": "Polygon", "coordinates": rings}

    latitude = event.get("latitude")
    longitude = event.get("longitude")
    if not valid_coordinate(latitude, -90, 90) or not valid_coordinate(
        longitude, -180, 180
    ):
        return None
    return {
        "type": "Point",
        "coordinates": [float(longitude), float(latitude)],
    }


def event_feature(event: dict[str, Any]) -> dict[str, Any] | None:
    geometry = normalized_geojson_geometry(event)
    if geometry is None:
        return None
    observed_at = event.get("observed_at")
    return {
        "type": "Feature",
        "id": event.get("id"),
        "geometry": geometry,
        "properties": {
            "title": event.get("title") or "Environmental event",
            "categories": [event.get("type") or "unknown"],
            "observation_time": observed_at,
            "source_observation_time": observed_at,
            "source_url": event.get("source_url"),
            "source": event.get("source"),
            "severity": event.get("severity"),
            "status": event.get("status"),
            "event_id": event.get("id"),
        },
    }


def main() -> int:
    events: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []

    try:
        data = json.loads(
            get(
                "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/"
                "all_day.geojson"
            )
        )
        before = len(events)
        for feature in data.get("features", []):
            properties = feature.get("properties") or {}
            coordinates = (feature.get("geometry") or {}).get("coordinates") or []
            magnitude = properties.get("mag")
            if isinstance(magnitude, (int, float)) and magnitude >= 7:
                severity = "critical"
            elif isinstance(magnitude, (int, float)) and magnitude >= 6:
                severity = "high"
            elif isinstance(magnitude, (int, float)) and magnitude >= 4.5:
                severity = "moderate"
            else:
                severity = "low"
            timestamp = properties.get("time")
            observed = (
                datetime.fromtimestamp(timestamp / 1000, tz=UTC)
                .isoformat()
                .replace("+00:00", "Z")
                if isinstance(timestamp, (int, float))
                else None
            )
            events.append(
                {
                    "id": f"usgs-{feature.get('id')}",
                    "type": "earthquake",
                    "title": properties.get("title") or "Earthquake",
                    "severity": severity,
                    "status": properties.get("status") or "detected",
                    "latitude": coordinates[1] if len(coordinates) > 1 else None,
                    "longitude": coordinates[0] if coordinates else None,
                    "observed_at": observed,
                    "source": "USGS",
                    "source_url": properties.get("url"),
                    "metadata": {
                        "magnitude": magnitude,
                        "depth_km": coordinates[2] if len(coordinates) > 2 else None,
                    },
                }
            )
        sources.append(
            {"source": "USGS", "status": "ok", "count": len(events) - before}
        )
    except Exception as exc:
        sources.append(
            {"source": "USGS", "status": "error", "count": 0, "error": str(exc)}
        )

    try:
        data = json.loads(
            get("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=500")
        )
        mapping = {
            "Wildfires": "fire",
            "Severe Storms": "storm",
            "Floods": "flood",
            "Volcanoes": "volcano",
            "Earthquakes": "earthquake",
            "Landslides": "landslide",
            "Drought": "drought",
            "Sea and Lake Ice": "ice",
            "Snow": "snow",
            "Dust and Haze": "air_quality",
            "Temperature Extremes": "temperature",
        }
        before = len(events)
        for item in data.get("events", []):
            categories = item.get("categories") or []
            category = categories[0].get("title") if categories else "Emergency"
            geometries = item.get("geometry") or []
            geometry = (
                sorted(
                    geometries,
                    key=lambda value: str(value.get("date") or ""),
                )[-1]
                if geometries
                else {}
            )
            coordinates = geometry.get("coordinates") or []
            latitude = (
                coordinates[1]
                if geometry.get("type") == "Point" and len(coordinates) > 1
                else None
            )
            longitude = (
                coordinates[0]
                if geometry.get("type") == "Point" and coordinates
                else None
            )
            preserved_geometry = (
                {
                    "type": geometry.get("type"),
                    "coordinates": coordinates,
                }
                if geometry.get("type") in {"Point", "Polygon"}
                else None
            )
            events.append(
                {
                    "id": f"eonet-{item.get('id')}",
                    "type": mapping.get(
                        category,
                        category.lower().replace(" ", "_"),
                    ),
                    "title": item.get("title") or category,
                    "severity": "moderate",
                    "status": "open",
                    "latitude": latitude,
                    "longitude": longitude,
                    "geometry": preserved_geometry,
                    "observed_at": geometry.get("date"),
                    "source": "NASA EONET",
                    "source_url": item.get("link"),
                    "metadata": {"category": category},
                }
            )
        sources.append(
            {
                "source": "NASA EONET",
                "status": "ok",
                "count": len(events) - before,
            }
        )
    except Exception as exc:
        sources.append(
            {
                "source": "NASA EONET",
                "status": "error",
                "count": 0,
                "error": str(exc),
            }
        )

    try:
        data = json.loads(
            get(
                "https://rapidmapping.emergency.copernicus.eu/backend/"
                "dashboard-api/public-activations-info/?limit=250&offset=0"
            )
        )
        mapping = {
            "Flood": "flood",
            "Storm": "storm",
            "Wildfire": "fire",
            "Forest fire, wild fire": "fire",
            "Earthquake": "earthquake",
            "Volcano": "volcano",
            "Volcanic activity": "volcano",
            "Landslide": "landslide",
            "Mass movement": "landslide",
        }
        before = len(events)
        for item in data.get("results", []):
            category = str(item.get("category") or "Emergency")
            kind = mapping.get(category, category.lower().replace(" ", "_"))
            latitude, longitude = point_wkt(item.get("centroid"))
            code = item.get("code")
            events.append(
                {
                    "id": f"cems-{code}",
                    "type": kind,
                    "title": item.get("name")
                    or f"Copernicus activation {code}",
                    "severity": "moderate" if item.get("closed") else "high",
                    "status": "closed" if item.get("closed") else "active",
                    "latitude": latitude,
                    "longitude": longitude,
                    "observed_at": item.get("eventTime")
                    or item.get("activationTime"),
                    "source": "Copernicus EMS",
                    "source_url": (
                        "https://mapping.emergency.copernicus.eu/activations/"
                        f"{code}"
                    ),
                    "metadata": {
                        "code": code,
                        "products": item.get("n_products"),
                        "countries": item.get("countries"),
                        "gdacs_id": item.get("gdacsId"),
                    },
                }
            )
        sources.append(
            {
                "source": "Copernicus EMS",
                "status": "ok",
                "count": len(events) - before,
            }
        )
    except Exception as exc:
        sources.append(
            {
                "source": "Copernicus EMS",
                "status": "error",
                "count": 0,
                "error": str(exc),
            }
        )

    firms_key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    if firms_key:
        try:
            text = get(
                "https://firms.modaps.eosdis.nasa.gov/api/area/csv/"
                f"{firms_key}/VIIRS_SNPP_NRT/world/1"
            ).decode("utf-8-sig")
            before = len(events)
            for row in csv.DictReader(io.StringIO(text)):
                try:
                    latitude = float(row.get("latitude"))
                    longitude = float(row.get("longitude"))
                    frp = float(row.get("frp") or 0)
                except (TypeError, ValueError):
                    continue
                raw_time = str(row.get("acq_time") or "").zfill(4)
                date = row.get("acq_date")
                observed = (
                    f"{date}T{raw_time[:2]}:{raw_time[2:]}:00Z"
                    if date and len(raw_time) == 4
                    else None
                )
                identifier = hashlib.sha256(
                    f"{date}|{raw_time}|{latitude:.4f}|{longitude:.4f}".encode()
                ).hexdigest()[:20]
                if frp >= 100:
                    severity = "high"
                elif frp >= 30:
                    severity = "moderate"
                else:
                    severity = "low"
                events.append(
                    {
                        "id": f"firms-{identifier}",
                        "type": "fire",
                        "title": "Satellite fire detection",
                        "severity": severity,
                        "status": "active_detection",
                        "latitude": latitude,
                        "longitude": longitude,
                        "observed_at": observed,
                        "source": "NASA FIRMS",
                        "source_url": "https://firms.modaps.eosdis.nasa.gov/map/",
                        "metadata": {
                            "frp": frp,
                            "satellite": row.get("satellite"),
                            "instrument": row.get("instrument"),
                        },
                    }
                )
            sources.append(
                {
                    "source": "NASA FIRMS",
                    "status": "ok",
                    "count": len(events) - before,
                }
            )
        except Exception as exc:
            sources.append(
                {
                    "source": "NASA FIRMS",
                    "status": "error",
                    "count": 0,
                    "error": str(exc),
                }
            )
    else:
        sources.append(
            {"source": "NASA FIRMS", "status": "disabled", "count": 0}
        )

    unique = {
        str(event.get("id")): event for event in events if event.get("id")
    }
    events = list(unique.values())
    summary: dict[str, int] = {}
    for event in events:
        event_type = str(event.get("type") or "unknown")
        summary[event_type] = summary.get(event_type, 0) + 1

    generated_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    payload = {
        "schema_version": "7.0",
        "project": "Terraforming Planet",
        "generated_at": generated_at,
        "event_count": len(events),
        "summary": summary,
        "sources": sources,
        "events": events,
        "limitations": [
            "Public observations are not continuous global video.",
            "Detections require confirmation before operational response.",
            "The system does not identify or track private individuals.",
        ],
    }
    atomic_json(EVENTS_PATH, payload)

    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        if event_feature(event) is not None:
            buckets[str(event.get("type") or "unknown")].append(event)
    limits = {
        "fire": 260,
        "flood": 100,
        "storm": 80,
        "earthquake": 100,
        "volcano": 30,
        "landslide": 20,
        "drought": 10,
    }
    selected: list[dict[str, Any]] = []
    for kind, limit in limits.items():
        selected.extend(buckets.get(kind, [])[:limit])
    if len(selected) < 600:
        used = {str(event.get("id")) for event in selected}
        selected.extend(
            [
                event
                for event in events
                if str(event.get("id")) not in used
                and event_feature(event) is not None
            ][: 600 - len(selected)]
        )
    features = [
        feature
        for event in selected[:600]
        if (feature := event_feature(event)) is not None
    ]
    rendered_summary: dict[str, int] = {}
    for feature in features:
        categories = feature.get("properties", {}).get("categories") or ["unknown"]
        category = str(categories[0])
        rendered_summary[category] = rendered_summary.get(category, 0) + 1
    hazard_payload = {
        "type": "FeatureCollection",
        "generated_at_utc": generated_at,
        "generatedUtc": generated_at,
        "notice": (
            "Balanced 3D layer with fires, floods, storms, earthquakes "
            "and other official detections."
        ),
        "feature_count": len(features),
        "summary": summary,
        "rendered_summary": rendered_summary,
        "features": features,
        "alerts": [],
    }
    atomic_json(HAZARDS_PATH, hazard_payload)

    print("Events:", len(events))
    print("3D markers:", len(features))
    print("Summary:", summary)
    print("Rendered summary:", rendered_summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
