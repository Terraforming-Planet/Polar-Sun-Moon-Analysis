#!/usr/bin/env python3
"""Render the 2026-08-12 total solar eclipse path as reproducible PNG frames.

The central-line coordinates, path widths and times below are transcribed from
NASA GSFC's official eclipse path table (WGS84, 120-second cadence):
https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2026Aug12Tpath.html

This renderer is a scientific visualization of the predicted umbral path. It
must not be presented as satellite photography. The broad translucent halo is
only visual context for partial-shadow shading; the black core diameter uses
NASA's published totality-path width for each sample.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path("web/public/eclipse/2026-08-12")
SIZE = 900
R = 365
CENTER = (SIZE // 2, SIZE // 2 + 10)
VIEW_LAT = math.radians(62.0)
VIEW_LON = math.radians(-22.0)
EARTH_RADIUS_KM = 6371.0088
NASA_PATH_URL = (
    "https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2026Aug12Tpath.html"
)
NASA_SCIENCE_URL = (
    "https://science.nasa.gov/eclipses/future-eclipses/"
    "total-solar-eclipse-on-august-12-2026/"
)

# UTC, central latitude deg/min/N|S, central longitude deg/min/E|W, path width km
RAW = """
17:02 82 16.5 N 112 29.2 E 273
17:04 85 17.7 N 104 12.9 E 274
17:06 87 16.7 N 81 31.5 E 274
17:08 87 49.4 N 33 00.0 E 275
17:10 86 50.1 N 1 38.3 W 275
17:12 85 24.2 N 15 10.9 W 275
17:14 83 55.9 N 21 11.2 W 276
17:16 82 29.7 N 24 16.3 W 276
17:18 81 06.6 N 25 59.5 W 277
17:20 79 46.4 N 26 58.9 W 278
17:22 78 29.0 N 27 32.4 W 278
17:24 77 14.0 N 27 49.5 W 279
17:26 76 01.1 N 27 55.7 W 280
17:28 74 50.2 N 27 54.3 W 281
17:30 73 41.0 N 27 47.3 W 282
17:32 72 33.4 N 27 36.2 W 283
17:34 71 27.0 N 27 21.7 W 285
17:36 70 21.9 N 27 04.7 W 286
17:38 69 17.9 N 26 45.6 W 288
17:40 68 14.8 N 26 24.6 W 289
17:42 67 12.6 N 26 01.9 W 291
17:44 66 11.1 N 25 37.8 W 292
17:46 65 10.3 N 25 12.3 W 294
17:48 64 10.1 N 24 45.4 W 296
17:50 63 10.3 N 24 17.2 W 298
17:52 62 11.0 N 23 47.6 W 300
17:54 61 12.0 N 23 16.6 W 302
17:56 60 13.3 N 22 44.2 W 304
17:58 59 14.7 N 22 10.2 W 305
18:00 58 16.3 N 21 34.4 W 307
18:02 57 17.8 N 20 56.8 W 309
18:04 56 19.3 N 20 17.2 W 311
18:06 55 20.6 N 19 35.3 W 313
18:08 54 21.7 N 18 50.8 W 315
18:10 53 22.3 N 18 03.4 W 316
18:12 52 22.3 N 17 12.7 W 318
18:14 51 21.6 N 16 18.2 W 319
18:16 50 20.0 N 15 19.0 W 319
18:18 49 17.1 N 14 14.3 W 319
18:20 48 12.7 N 13 02.9 W 319
18:22 47 06.1 N 11 42.9 W 318
18:24 45 56.6 N 10 11.4 W 315
18:26 44 42.8 N 8 23.9 W 311
18:28 43 22.3 N 6 11.3 W 304
18:30 41 49.0 N 3 11.1 W 294
18:32 39 24.5 N 2 57.0 E 270
""".strip()


def dm(deg: str, minutes: str, hemi: str) -> float:
    value = float(deg) + float(minutes) / 60.0
    return -value if hemi in {"S", "W"} else value


def samples() -> list[dict[str, float | str]]:
    rows: list[dict[str, float | str]] = []
    for line in RAW.splitlines():
        t, lat_d, lat_m, lat_h, lon_d, lon_m, lon_h, width = line.split()
        rows.append(
            {
                "timestamp_utc": f"2026-08-12T{t}:00Z",
                "latitude": dm(lat_d, lat_m, lat_h),
                "longitude": dm(lon_d, lon_m, lon_h),
                "path_width_km": float(width),
            }
        )
    return rows


def project(lat_deg: float, lon_deg: float) -> tuple[float, float, bool]:
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    dlon = lon - VIEW_LON
    cosc = (
        math.sin(VIEW_LAT) * math.sin(lat)
        + math.cos(VIEW_LAT) * math.cos(lat) * math.cos(dlon)
    )
    x = R * math.cos(lat) * math.sin(dlon)
    y = -R * (
        math.cos(VIEW_LAT) * math.sin(lat)
        - math.sin(VIEW_LAT) * math.cos(lat) * math.cos(dlon)
    )
    return CENTER[0] + x, CENTER[1] + y, cosc >= 0


def _draw_polyline(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[float, float]],
    fill: tuple[int, int, int, int],
) -> None:
    if len(points) > 1:
        draw.line(points, fill=fill, width=1)


def base_globe(path_rows: list[dict[str, float | str]]) -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE), (2, 7, 18))
    draw = ImageDraw.Draw(img, "RGBA")
    for rr in range(R, 0, -1):
        f = rr / R
        draw.ellipse(
            (
                CENTER[0] - rr,
                CENTER[1] - rr,
                CENTER[0] + rr,
                CENTER[1] + rr,
            ),
            fill=(8, int(31 + 25 * f), int(57 + 50 * f), 255),
        )
    draw.ellipse(
        (CENTER[0] - R, CENTER[1] - R, CENTER[0] + R, CENTER[1] + R),
        outline=(93, 196, 255, 190),
        width=3,
    )

    for lat in range(-60, 91, 15):
        points: list[tuple[float, float]] = []
        for lon in range(-180, 181, 3):
            x, y, visible = project(lat, lon)
            if visible:
                points.append((x, y))
            else:
                _draw_polyline(draw, points, (150, 210, 235, 40))
                points = []
        _draw_polyline(draw, points, (150, 210, 235, 40))

    for lon in range(-180, 181, 15):
        points = []
        for lat in range(-90, 91, 2):
            x, y, visible = project(lat, lon)
            if visible:
                points.append((x, y))
            else:
                _draw_polyline(draw, points, (150, 210, 235, 32))
                points = []
        _draw_polyline(draw, points, (150, 210, 235, 32))

    visible_path = []
    for row in path_rows:
        x, y, visible = project(
            float(row["latitude"]),
            float(row["longitude"]),
        )
        if visible:
            visible_path.append((x, y))
    if len(visible_path) > 1:
        draw.line(visible_path, fill=(255, 65, 65, 230), width=5)
    return img


def render_frame(
    base: Image.Image,
    row: dict[str, float | str],
    index: int,
    count: int,
) -> Image.Image:
    img = base.copy().convert("RGBA")
    draw = ImageDraw.Draw(img, "RGBA")
    latitude = float(row["latitude"])
    longitude = float(row["longitude"])
    x, y, visible = project(latitude, longitude)
    width_km = float(row["path_width_km"])
    umbra_px = max(5.0, R * (width_km / EARTH_RADIUS_KM))
    if visible:
        halo = umbra_px * 8.5
        draw.ellipse(
            (x - halo, y - halo, x + halo, y + halo),
            fill=(20, 20, 25, 55),
        )
        draw.ellipse(
            (
                x - umbra_px / 2,
                y - umbra_px / 2,
                x + umbra_px / 2,
                y + umbra_px / 2,
            ),
            fill=(0, 0, 0, 240),
            outline=(255, 90, 75, 255),
            width=2,
        )
        draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=(255, 80, 65, 255))

    timestamp = str(row["timestamp_utc"])
    draw.rounded_rectangle(
        (32, 28, 868, 132),
        radius=18,
        fill=(2, 8, 20, 210),
        outline=(67, 193, 244, 150),
        width=2,
    )
    draw.text(
        (54, 48),
        "TOTAL SOLAR ECLIPSE · NASA GSFC PREDICTION",
        fill=(225, 247, 255, 255),
    )
    details = (
        f"{timestamp}   center {latitude:.3f}°, {longitude:.3f}°   "
        f"totality path {width_km:.0f} km"
    )
    draw.text((54, 76), details, fill=(129, 218, 255, 255))
    context = (
        f"Frame {index + 1}/{count} · black core follows NASA central-line/path-width "
        "data · gray halo is illustrative"
    )
    draw.text((54, 103), context, fill=(150, 167, 184, 255))
    draw.text(
        (42, 842),
        "Terraforming Planet · prediction visualization, not satellite photography",
        fill=(170, 190, 210, 255),
    )
    return img.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    frames_dir = OUT / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    rows = samples()
    base = base_globe(rows)
    rendered: list[Image.Image] = []
    for index, row in enumerate(rows):
        frame = render_frame(base, row, index, len(rows))
        stamp = str(row["timestamp_utc"])[11:16].replace(":", "")
        target = frames_dir / f"eclipse-{stamp}Z.png"
        frame.save(target, optimize=True)
        rendered.append(frame.resize((600, 600)))

    rendered[0].save(
        OUT / "eclipse-2026-08-12.gif",
        save_all=True,
        append_images=rendered[1:],
        duration=220,
        loop=0,
        optimize=True,
    )
    manifest = {
        "event": "Total Solar Eclipse 2026-08-12",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "classification": "NASA GSFC predicted central-line visualization",
        "not_satellite_photography": True,
        "greatest_eclipse_utc": "2026-08-12T17:45:53.8Z",
        "greatest_eclipse_latitude": 65 + 13.5 / 60,
        "greatest_eclipse_longitude": -(25 + 13.7 / 60),
        "nasa_path_source": NASA_PATH_URL,
        "nasa_science_source": NASA_SCIENCE_URL,
        "frame_count": len(rows),
        "samples": rows,
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Rendered {len(rows)} frames to {OUT}")


if __name__ == "__main__":
    main()
