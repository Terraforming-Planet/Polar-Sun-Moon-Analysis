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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA = ROOT / "web" / "public" / "data"
EVENTS_PATH = PUBLIC_DATA / "events" / "latest.json"
HAZARDS_PATH = PUBLIC_DATA / "hazards.json"


def get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "Terraforming-Planet-Monitor/7.0", "Accept": "application/json,text/csv,*/*"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def valid_coordinate(value: Any, minimum: float, maximum: float) -> bool:
    return isinstance(value, (int, float)) and minimum <= float(value) <= maximum


def point_wkt(value: Any) -> tuple[float | None, float | None]:
    match = re.search(r"POINT\s*\(\s*([-+0-9.]+)\s+([-+0-9.]+)\s*\)", str(value or ""), re.I)
    return (float(match.group(2)), float(match.group(1))) if match else (None, None)


def event_feature(event: dict[str, Any]) -> dict[str, Any] | None:
    latitude, longitude = event.get("latitude"), event.get("longitude")
    if not valid_coordinate(latitude, -90, 90) or not valid_coordinate(longitude, -180, 180):
        return None
    return {
        "type": "Feature",
        "id": event.get("id"),
        "geometry": {"type": "Point", "coordinates": [float(longitude), float(latitude)]},
        "properties": {
            "title": event.get("title") or "Environmental event",
            "categories": [event.get("type") or "unknown"],
            "observation_time": None,
            "source_observation_time": event.get("observed_at"),
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
        data = json.loads(get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"))
        before = len(events)
        for feature in data.get("features", []):
            p = feature.get("properties") or {}; c = (feature.get("geometry") or {}).get("coordinates") or []
            magnitude = p.get("mag")
            severity = "critical" if isinstance(magnitude, (int, float)) and magnitude >= 7 else "high" if isinstance(magnitude, (int, float)) and magnitude >= 6 else "moderate" if isinstance(magnitude, (int, float)) and magnitude >= 4.5 else "low"
            timestamp = p.get("time")
            observed = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z") if isinstance(timestamp, (int, float)) else None
            events.append({"id":f"usgs-{feature.get('id')}","type":"earthquake","title":p.get("title") or "Earthquake","severity":severity,"status":p.get("status") or "detected","latitude":c[1] if len(c)>1 else None,"longitude":c[0] if c else None,"observed_at":observed,"source":"USGS","source_url":p.get("url"),"metadata":{"magnitude":magnitude,"depth_km":c[2] if len(c)>2 else None}})
        sources.append({"source":"USGS","status":"ok","count":len(events)-before})
    except Exception as exc:
        sources.append({"source":"USGS","status":"error","count":0,"error":str(exc)})

    try:
        data = json.loads(get("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=500"))
        mapping = {"Wildfires":"fire","Severe Storms":"storm","Floods":"flood","Volcanoes":"volcano","Earthquakes":"earthquake","Landslides":"landslide","Drought":"drought","Sea and Lake Ice":"ice","Snow":"snow","Dust and Haze":"air_quality","Temperature Extremes":"temperature"}
        before = len(events)
        for item in data.get("events", []):
            categories = item.get("categories") or []; category = categories[0].get("title") if categories else "Emergency"
            geometries = item.get("geometry") or []; geometry = sorted(geometries, key=lambda value: str(value.get("date") or ""))[-1] if geometries else {}
            coordinates = geometry.get("coordinates") or []
            latitude = coordinates[1] if geometry.get("type") == "Point" and len(coordinates) > 1 else None
            longitude = coordinates[0] if geometry.get("type") == "Point" and coordinates else None
            events.append({"id":f"eonet-{item.get('id')}","type":mapping.get(category, category.lower().replace(" ", "_")),"title":item.get("title") or category,"severity":"moderate","status":"open","latitude":latitude,"longitude":longitude,"observed_at":geometry.get("date"),"source":"NASA EONET","source_url":item.get("link"),"metadata":{"category":category}})
        sources.append({"source":"NASA EONET","status":"ok","count":len(events)-before})
    except Exception as exc:
        sources.append({"source":"NASA EONET","status":"error","count":0,"error":str(exc)})

    try:
        data = json.loads(get("https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=250&offset=0"))
        mapping = {"Flood":"flood","Storm":"storm","Wildfire":"fire","Forest fire, wild fire":"fire","Earthquake":"earthquake","Volcano":"volcano","Volcanic activity":"volcano","Landslide":"landslide","Mass movement":"landslide"}
        before = len(events)
        for item in data.get("results", []):
            category = str(item.get("category") or "Emergency")
            kind = mapping.get(category, category.lower().replace(" ", "_"))
            latitude, longitude = point_wkt(item.get("centroid"))
            code = item.get("code")
            events.append({"id":f"cems-{code}","type":kind,"title":item.get("name") or f"Copernicus activation {code}","severity":"moderate" if item.get("closed") else "high","status":"closed" if item.get("closed") else "active","latitude":latitude,"longitude":longitude,"observed_at":item.get("eventTime") or item.get("activationTime"),"source":"Copernicus EMS","source_url":f"https://mapping.emergency.copernicus.eu/activations/{code}","metadata":{"code":code,"products":item.get("n_products"),"countries":item.get("countries"),"gdacs_id":item.get("gdacsId")}})
        sources.append({"source":"Copernicus EMS","status":"ok","count":len(events)-before})
    except Exception as exc:
        sources.append({"source":"Copernicus EMS","status":"error","count":0,"error":str(exc)})

    firms_key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    if firms_key:
        try:
            text = get(f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{firms_key}/VIIRS_SNPP_NRT/world/1").decode("utf-8-sig")
            before = len(events)
            for row in csv.DictReader(io.StringIO(text)):
                try:
                    latitude=float(row.get("latitude")); longitude=float(row.get("longitude")); frp=float(row.get("frp") or 0)
                except (TypeError, ValueError):
                    continue
                raw_time=str(row.get("acq_time") or "").zfill(4); date=row.get("acq_date")
                observed=f"{date}T{raw_time[:2]}:{raw_time[2:]}:00Z" if date and len(raw_time)==4 else None
                identifier=hashlib.sha256(f"{date}|{raw_time}|{latitude:.4f}|{longitude:.4f}".encode()).hexdigest()[:20]
                events.append({"id":f"firms-{identifier}","type":"fire","title":"Satellite fire detection","severity":"high" if frp>=100 else "moderate" if frp>=30 else "low","status":"active_detection","latitude":latitude,"longitude":longitude,"observed_at":observed,"source":"NASA FIRMS","source_url":"https://firms.modaps.eosdis.nasa.gov/map/","metadata":{"frp":frp,"satellite":row.get("satellite"),"instrument":row.get("instrument")}})
            sources.append({"source":"NASA FIRMS","status":"ok","count":len(events)-before})
        except Exception as exc:
            sources.append({"source":"NASA FIRMS","status":"error","count":0,"error":str(exc)})
    else:
        sources.append({"source":"NASA FIRMS","status":"disabled","count":0})

    unique = {str(event.get("id")): event for event in events if event.get("id")}
    events = list(unique.values())
    summary: dict[str, int] = {}
    for event in events:
        event_type = str(event.get("type") or "unknown")
        summary[event_type] = summary.get(event_type, 0) + 1

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = {"schema_version":"7.0","project":"Terraforming Planet","generated_at":generated_at,"event_count":len(events),"summary":summary,"sources":sources,"events":events,"limitations":["Public observations are not continuous global video.","Detections require confirmation before operational response.","The system does not identify or track private individuals."]}
    atomic_json(EVENTS_PATH, payload)

    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        if event_feature(event) is not None:
            buckets[str(event.get("type") or "unknown")].append(event)
    limits = {"fire":260,"flood":100,"storm":80,"earthquake":100,"volcano":30,"landslide":20,"drought":10}
    selected: list[dict[str, Any]] = []
    for kind, limit in limits.items():
        selected.extend(buckets.get(kind, [])[:limit])
    if len(selected) < 600:
        used = {str(event.get("id")) for event in selected}
        selected.extend([event for event in events if str(event.get("id")) not in used and event_feature(event) is not None][:600-len(selected)])
    features = [feature for event in selected[:600] if (feature := event_feature(event)) is not None]
    hazard_payload = {"type":"FeatureCollection","generated_at_utc":generated_at,"generatedUtc":generated_at,"notice":"Balanced 3D layer with fires, floods, storms, earthquakes and other official detections.","feature_count":len(features),"summary":summary,"features":features,"alerts":[]}
    atomic_json(HAZARDS_PATH, hazard_payload)

    print("Events:", len(events)); print("3D markers:", len(features)); print("Summary:", summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
