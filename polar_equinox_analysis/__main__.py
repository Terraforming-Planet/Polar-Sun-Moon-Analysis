"""Command line interface for polar observations and web data generation."""

from __future__ import annotations

import argparse
import json
import logging
from datetime import UTC, datetime
from pathlib import Path

from .horizons import HorizonsClient
from .pipeline import PolarEquinoxPipeline


def main() -> None:
    parser = argparse.ArgumentParser(description="NASA JPL polar and Solar System observations")
    subparsers = parser.add_subparsers(dest="command")
    polar = subparsers.add_parser("polar", help="Generate polar Sun/Moon observations")
    polar.add_argument("--start-year", type=int, default=2006)
    polar.add_argument("--end-year", type=int)
    polar.add_argument("--include-future", action="store_true")
    polar.add_argument("--output-dir", default="outputs")
    polar.add_argument("--cache-dir", default=".cache/horizons")
    polar.add_argument("--force-download", action="store_true")

    solar = subparsers.add_parser("solar-system", help="Generate a JPL 3D position snapshot")
    solar.add_argument("--output", default="web/public/data/solar-system.json")
    solar.add_argument("--cache-dir", default=".cache/horizons")

    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if args.command in {None, "polar"}:
        pipeline = PolarEquinoxPipeline(
            getattr(args, "output_dir", "outputs"),
            getattr(args, "cache_dir", ".cache/horizons"),
            getattr(args, "force_download", False),
        )
        pipeline.run(
            getattr(args, "start_year", 2006),
            getattr(args, "end_year", None),
            getattr(args, "include_future", False),
        )
    elif args.command == "solar-system":
        client = HorizonsClient(args.cache_dir)
        now = datetime.now(UTC).replace(microsecond=0)
        payload = {
            "timestamp_utc": now.isoformat(),
            "scale_note": "Positions are heliocentric ICRF vectors in astronomical units.",
            "bodies": client.solar_system_vectors(now),
        }
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(payload, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
