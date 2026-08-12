from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

CONFIG_PATH = Path("config/eclipse_2026_observation.json")


def load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def manifest_status(config: dict[str, object]) -> dict[str, object]:
    capture = config.get("capture")
    if not isinstance(capture, dict):
        raise ValueError("capture configuration is missing")
    manifest_value = capture.get("manifest")
    if not isinstance(manifest_value, str):
        raise ValueError("capture manifest path is missing")
    manifest_path = Path(manifest_value)
    if not manifest_path.exists():
        return {"available": False, "frame_count": 0, "latest_observed_utc": None}

    manifest = load_json(manifest_path)
    frames = manifest.get("frames")
    if not isinstance(frames, list):
        raise ValueError("GOES-19 manifest frames must be a list")

    latest: str | None = None
    valid_frames = 0
    for frame in frames:
        if not isinstance(frame, dict):
            continue
        source_url = frame.get("source_url")
        observed_utc = frame.get("observed_utc")
        digest = frame.get("sha256")
        if not isinstance(source_url, str) or not source_url.startswith(
            "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/"
        ):
            raise ValueError("frame source is not official NOAA GOES-19 GeoColor")
        if not isinstance(observed_utc, str):
            raise ValueError("frame observation time is missing")
        if not isinstance(digest, str) or len(digest) != hashlib.sha256().digest_size * 2:
            raise ValueError("frame SHA-256 is missing or malformed")
        parse_utc(observed_utc)
        valid_frames += 1
        if latest is None or observed_utc > latest:
            latest = observed_utc

    return {
        "available": valid_frames > 0,
        "frame_count": valid_frames,
        "latest_observed_utc": latest,
    }


def build_report(now: datetime, config: dict[str, object]) -> dict[str, object]:
    verified = config.get("verified_times_utc")
    capture = config.get("capture")
    policy = config.get("research_policy")
    if not isinstance(verified, dict) or not isinstance(capture, dict) or not isinstance(policy, dict):
        raise ValueError("invalid eclipse readiness configuration")

    path_start = parse_utc(str(verified["totality_path_table_first_row"]))
    greatest = parse_utc(str(verified["greatest_eclipse"]))
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    now = now.astimezone(UTC)

    if now < path_start:
        phase = "pre-totality-path"
    elif now < greatest:
        phase = "totality-path-active-before-maximum"
    else:
        phase = "post-maximum"

    return {
        "checked_utc": now.isoformat().replace("+00:00", "Z"),
        "phase": phase,
        "seconds_to_totality_path_table_start": max(0, int((path_start - now).total_seconds())),
        "seconds_to_greatest_eclipse": max(0, int((greatest - now).total_seconds())),
        "capture_policy_ok": (
            capture.get("source_nominal_cadence_minutes") == 10
            and capture.get("poll_interval_seconds") == 5
            and capture.get("synthetic_frames_allowed") is False
        ),
        "research_policy_ok": all(value is True for value in policy.values()),
        "goes19": manifest_status(config),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate eclipse observation readiness.")
    parser.add_argument("--now", help="UTC timestamp override for reproducible checks")
    parser.add_argument("--config", default=str(CONFIG_PATH))
    args = parser.parse_args()

    config = load_json(Path(args.config))
    now = parse_utc(args.now) if args.now else datetime.now(UTC)
    report = build_report(now, config)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["capture_policy_ok"] and report["research_policy_ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
