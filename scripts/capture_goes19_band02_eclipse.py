from __future__ import annotations

import argparse
import hashlib
import json
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from pathlib import Path

NOAA_CDN = "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/02"
PRODUCT = "GOES19-ABI-FD-02-1808x1808.jpg"
OUTPUT_DIR = Path("web/public/eclipse/2026-08-12/goes19-band02")
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"
USER_AGENT = "Terraforming-Planet-Polar-Sun-Moon-Analysis/1.0 (+public research)"


def floor_to_ten_minutes(value: datetime) -> datetime:
    value = value.astimezone(UTC).replace(second=0, microsecond=0)
    return value.replace(minute=(value.minute // 10) * 10)


def noaa_timestamp(value: datetime) -> str:
    utc = value.astimezone(UTC)
    return f"{utc.year}{utc.timetuple().tm_yday:03d}{utc:%H%M}"


def frame_url(value: datetime) -> str:
    return f"{NOAA_CDN}/{noaa_timestamp(value)}_{PRODUCT}"


def is_jpeg(payload: bytes) -> bool:
    return (
        len(payload) > 10_000
        and payload.startswith(b"\xff\xd8")
        and payload.endswith(b"\xff\xd9")
    )


def fetch_frame(value: datetime, timeout: float = 30.0) -> bytes:
    request = urllib.request.Request(frame_url(value), headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(  # noqa: S310 - fixed NOAA HTTPS host
        request,
        timeout=timeout,
    ) as response:
        payload = response.read()
    if not is_jpeg(payload):
        raise ValueError("NOAA response is not a valid non-trivial JPEG")
    return payload


def find_latest_frame(now: datetime, lookback_slots: int = 8) -> tuple[datetime, bytes, str]:
    candidate = floor_to_ten_minutes(now)
    last_error: Exception | None = None
    for offset in range(lookback_slots + 1):
        observed = candidate - timedelta(minutes=10 * offset)
        try:
            payload = fetch_frame(observed)
            return observed, payload, frame_url(observed)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as exc:
            last_error = exc
    message = f"No GOES-19 Band 2 frame found in {lookback_slots + 1} slots"
    raise RuntimeError(message) from last_error


def load_manifest() -> dict[str, object]:
    if not MANIFEST_PATH.exists():
        return {
            "event_date": "2026-08-12",
            "source": "NOAA NESDIS STAR GOES-19 ABI Full Disk Band 2",
            "source_page": (
                "https://www.star.nesdis.noaa.gov/GOES/"
                "fulldisk_band.php?band=02&length=12&sat=G19"
            ),
            "product": "ABI Band 2 Red Visible 0.64 um",
            "cadence_minutes": 10,
            "image_size_px": [1808, 1808],
            "native_nadir_resolution_km": 0.5,
            "satellite_observation": True,
            "synthetic": False,
            "model_overlay": False,
            "frames": [],
        }
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def store_frame(now: datetime) -> tuple[Path, bool]:
    observed, payload, source_url = find_latest_frame(now)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{observed:%Y%m%dT%H%M%SZ}_GOES19_BAND02_1808.jpg"
    output = OUTPUT_DIR / filename
    digest = hashlib.sha256(payload).hexdigest()

    manifest = load_manifest()
    frames = manifest.setdefault("frames", [])
    if not isinstance(frames, list):
        raise ValueError("Invalid GOES-19 Band 2 manifest: frames must be a list")

    existing = next(
        (
            item
            for item in frames
            if isinstance(item, dict) and item.get("sha256") == digest
        ),
        None,
    )
    if existing:
        return OUTPUT_DIR / str(existing["file"]), False

    output.write_bytes(payload)
    frames.append(
        {
            "observed_utc": observed.isoformat().replace("+00:00", "Z"),
            "captured_utc": now.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "file": filename,
            "source_url": source_url,
            "sha256": digest,
            "bytes": len(payload),
        }
    )
    frames.sort(
        key=lambda item: (
            str(item.get("observed_utc", "")) if isinstance(item, dict) else ""
        )
    )
    manifest["updated_utc"] = now.astimezone(UTC).isoformat().replace("+00:00", "Z")
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return output, True


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Capture the latest official NOAA GOES-19 ABI Band 2 visible frame."
    )
    parser.add_argument("--now", help="Override current UTC time for reproducible runs.")
    args = parser.parse_args()
    now = (
        datetime.fromisoformat(args.now.replace("Z", "+00:00"))
        if args.now
        else datetime.now(UTC)
    )
    output, created = store_frame(now)
    print(json.dumps({"file": str(output), "created": created}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
