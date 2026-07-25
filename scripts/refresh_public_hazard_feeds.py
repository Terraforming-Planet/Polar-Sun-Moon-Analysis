from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

USGS_URL = (
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/"
    "all_day.geojson"
)
EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200"
TIMEOUT = 45


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def fetch_json(url: str) -> dict[str, Any]:
    response = requests.get(
        url,
        timeout=TIMEOUT,
        headers={
            "User-Agent": (
                "Terraforming-Planet/Polar-Sun-Moon-Analysis "
                "hazard-monitor/1.0"
            )
        },
    )
    response.raise_for_status()
    return response.json()


def sha256_json(payload: object) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def normalize_earthquakes(payload: dict[str, Any]) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    alerts: list[dict[str, Any]] = []

    for feature in payload.get("features", []):
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        magnitude = properties.get("mag")
        event_time_ms = properties.get("time")

        if len(coordinates) < 3 or magnitude is None or event_time_ms is None:
            continue

        observation_utc = datetime.fromtimestamp(
            event_time_ms / 1000,
            tz=UTC,
        ).isoformat().replace("+00:00", "Z")

        normalized = {
            "type": "Feature",
            "id": feature.get("id"),
            "geometry": {
                "type": "Point",
                "coordinates": coordinates[:3],
            },
            "properties": {
                "source": "USGS",
                "evidenceType": "measured-detection",
                "magnitude": magnitude,
                "depthKm": coordinates[2],
                "observationUtc": observation_utc,
                "place": properties.get("place"),
                "status": properties.get("status"),
                "eventUrl": properties.get("url"),
                "detailUrl": properties.get("detail"),
                "tsunami": bool(properties.get("tsunami")),
            },
        }
        features.append(normalized)

        if float(magnitude) >= 5.0:
            alerts.append(
                {
                    "id": f"usgs-{feature.get('id')}",
                    "kind": "earthquake",
                    "status": "automatic-rule-match",
                    "evidenceType": "measured-detection",
                    "source": "USGS",
                    "observationUtc": observation_utc,
                    "rule": "magnitude >= 5.0",
                    "inputs": {
                        "magnitude": magnitude,
                        "depthKm": coordinates[2],
                        "coordinates": coordinates[:2],
                    },
                    "title": properties.get("title"),
                    "officialUrl": properties.get("url"),
                }
            )

    return {
        "geojson": {
            "type": "FeatureCollection",
            "generatedUtc": utc_now(),
            "sourceUrl": USGS_URL,
            "features": features,
        },
        "alerts": alerts,
    }


def normalize_eonet(payload: dict[str, Any]) -> dict[str, Any]:
    events: list[dict[str, Any]] = []
    for event in payload.get("events", []):
        geometry = event.get("geometry") or []
        latest = geometry[-1] if geometry else None
        categories = [item.get("title") for item in event.get("categories", [])]
        events.append(
            {
                "id": event.get("id"),
                "title": event.get("title"),
                "categories": categories,
                "closed": event.get("closed"),
                "latestGeometry": latest,
                "sources": event.get("sources", []),
                "link": event.get("link"),
                "evidenceType": "event-catalogue",
                "scientificLimit": (
                    "EONET is an event catalogue; it is not a direct measurement "
                    "of severity, area, intensity, or current danger."
                ),
            }
        )
    return {
        "generatedUtc": utc_now(),
        "sourceUrl": EONET_URL,
        "events": events,
    }


def write_json(path: Path, payload: object) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    retrieved_utc = utc_now()
    source_status: list[dict[str, Any]] = []
    alerts: list[dict[str, Any]] = []

    try:
        usgs_raw = fetch_json(USGS_URL)
        earthquakes = normalize_earthquakes(usgs_raw)
        write_json(OUT / "earthquakes.geojson", earthquakes["geojson"])
        alerts.extend(earthquakes["alerts"])
        source_status.append(
            {
                "id": "usgs-earthquakes-day",
                "agency": "USGS",
                "availability": "available",
                "retrievalUtc": retrieved_utc,
                "officialSourceUrl": USGS_URL,
                "checksumSha256": sha256_json(usgs_raw),
                "lastError": None,
            }
        )
    except Exception as exc:
        source_status.append(
            {
                "id": "usgs-earthquakes-day",
                "agency": "USGS",
                "availability": "unavailable",
                "retrievalUtc": retrieved_utc,
                "officialSourceUrl": USGS_URL,
                "lastError": str(exc),
            }
        )

    try:
        eonet_raw = fetch_json(EONET_URL)
        eonet = normalize_eonet(eonet_raw)
        write_json(OUT / "eonet-events.json", eonet)
        source_status.append(
            {
                "id": "nasa-eonet-open-events",
                "agency": "NASA EONET",
                "availability": "available",
                "retrievalUtc": retrieved_utc,
                "officialSourceUrl": EONET_URL,
                "checksumSha256": sha256_json(eonet_raw),
                "lastError": None,
            }
        )
    except Exception as exc:
        source_status.append(
            {
                "id": "nasa-eonet-open-events",
                "agency": "NASA EONET",
                "availability": "unavailable",
                "retrievalUtc": retrieved_utc,
                "officialSourceUrl": EONET_URL,
                "lastError": str(exc),
            }
        )

    write_json(
        OUT / "hazards.json",
        {
            "schemaVersion": 1,
            "generatedUtc": utc_now(),
            "alerts": alerts,
            "sources": source_status,
            "limitations": [
                "Automatic rules are screening rules, not emergency authority alerts.",
                "EONET events are catalogue entries, not measured severity.",
                "Flood, fire and polar alerts require separate validated satellite products.",
            ],
        },
    )


if __name__ == "__main__":
    main()
