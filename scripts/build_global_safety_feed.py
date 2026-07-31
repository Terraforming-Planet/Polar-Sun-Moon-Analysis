#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA = ROOT / "web" / "public" / "data"
EVENTS_PATH = PUBLIC_DATA / "events" / "latest.json"
HAZARDS_PATH = PUBLIC_DATA / "hazards.json"


def get(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Terraforming-Planet-Monitor/6.0"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
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


def event_feature(event: dict[str, Any]) -> dict[str, Any] | None:
    latitude = event.get("latitude")
    longitude = event.get("longitude")
    if not valid_coordinate(latitude, -90, 90):
        return None
    if not valid_coordinate(longitude, -180, 180):
        return None

    return {
        "type": "Feature",
        "id": event.get("id"),
        "geometry": {
            "type": "Point",
            "coordinates": [float(longitude), float(latitude)],
        },
        "properties": {
            "title": event.get("title") or "Environmental event",
            "categories": [event.get("type") or "unknown"],
            "observation_time": event.get("observed_at"),
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
        data = json.loads(get(
            "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
        ))
        before = len(events)
        for feature in data.get("features", []):
            properties = feature.get("properties") or {}
            coordinates = (feature.get("geometry") or {}).get("coordinates") or []
            magnitude = properties.get("mag")
            severity = (
                "critical" if isinstance(magnitude, (int, float)) and magnitude >= 7
                else "high" if isinstance(magnitude, (int, float)) and magnitude >= 6
                else "moderate" if isinstance(magnitude, (int, float)) and magnitude >= 4.5
                else "low"
            )
            timestamp = properties.get("time")
            observed = (
                datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc)
                .isoformat()
                .replace("+00:00", "Z")
                if isinstance(timestamp, (int, float)) else None
            )
            events.append({
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
            })
        sources.append({"source": "USGS", "status": "ok", "count": len(events) - before})
    except Exception as exc:
        sources.append({"source": "USGS", "status": "error", "count": 0, "error": str(exc)})

    try:
        data = json.loads(get("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=500"))
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
            geometry = sorted(geometries, key=lambda value: str(value.get("date") or ""))[-1] if geometries else {}
            coordinates = geometry.get("coordinates") or []
            latitude = coordinates[1] if geometry.get("type") == "Point" and len(coordinates) > 1 else None
            longitude = coordinates[0] if geometry.get("type") == "Point" and coordinates else None
            events.append({
                "id": f"eonet-{item.get('id')}",
                "type": mapping.get(category, category.lower().replace(" ", "_")),
                "title": item.get("title") or category,
                "severity": "moderate",
                "status": "open",
                "latitude": latitude,
                "longitude": longitude,
                "observed_at": geometry.get("date"),
                "source": "NASA EONET",
                "source_url": item.get("link"),
                "metadata": {"category": category},
            })
        sources.append({"source": "NASA EONET", "status": "ok", "count": len(events) - before})
    except Exception as exc:
        sources.append({"source": "NASA EONET", "status": "error", "count": 0, "error": str(exc)})

    firms_key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    if firms_key:
        try:
            text = get(
                f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{firms_key}/VIIRS_SNPP_NRT/world/1"
            ).decode("utf-8-sig")
            before = len(events)
            for row in csv.DictReader(io.StringIO(text)):
                try:
                    latitude = float(row.get("latitude"))
                    longitude = float(row.get("longitude"))
                except (TypeError, ValueError):
                    continue
                raw_time = str(row.get("acq_time") or "").zfill(4)
                date = row.get("acq_date")
                observed = (
                    f"{date}T{raw_time[:2]}:{raw_time[2:]}:00Z"
                    if date and len(raw_time) == 4 else None
                )
                identifier = hashlib.sha256(
                    f"{date}|{raw_time}|{latitude:.4f}|{longitude:.4f}".encode()
                ).hexdigest()[:20]
                try:
                    frp = float(row.get("frp") or 0)
                except (TypeError, ValueError):
                    frp = 0.0
                severity = "high" if frp >= 100 else "moderate" if frp >= 30 else "low"
                events.append({
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
                })
            sources.append({"source": "NASA FIRMS", "status": "ok", "count": len(events) - before})
        except Exception as exc:
            sources.append({"source": "NASA FIRMS", "status": "error", "count": 0, "error": str(exc)})
    else:
        sources.append({"source": "NASA FIRMS", "status": "disabled", "count": 0})

    unique = {str(event.get("id")): event for event in events if event.get("id")}
    events = list(unique.values())
    summary: dict[str, int] = {}
    for event in events:
        event_type = str(event.get("type") or "unknown")
        summary[event_type] = summary.get(event_type, 0) + 1

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = {
        "schema_version": "6.0",
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

    features = [feature for event in events if (feature := event_feature(event)) is not None]
    hazard_payload = {
        "type": "FeatureCollection",
        "generated_at_utc": generated_at,
        "generatedUtc": generated_at,
        "notice": (
            "Automated public-source environmental observations. "
            "Markers are decision-support data and require confirmation."
        ),
        "feature_count": len(features),
        "features": features,
        "alerts": [],
    }
    atomic_json(HAZARDS_PATH, hazard_payload)

    print("Events:", len(events))
    print("3D markers:", len(features))
    print("Summary:", summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
