"""Command-line entry point for the polar equinox analysis project."""

from __future__ import annotations

import argparse
import logging

from .pipeline import PolarEquinoxPipeline


def main() -> None:
    """Parse command-line arguments and run the analysis pipeline."""
    parser = argparse.ArgumentParser(
        description="Analyze polar equinox ephemerides from NASA JPL Horizons."
    )
    parser.add_argument("--start-year", type=int, default=2006)
    parser.add_argument("--end-year", type=int, default=2024)
    parser.add_argument("--output-dir", default="outputs")
    parser.add_argument("--cache-dir", default=".cache/horizons")
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    pipeline = PolarEquinoxPipeline(output_dir=args.output_dir, cache_dir=args.cache_dir)
    pipeline.run(start_year=args.start_year, end_year=args.end_year)


if __name__ == "__main__":
    main()
