"""Command-line entry point for the polar equinox analysis project."""
from __future__ import annotations

import argparse
import logging
from pathlib import Path

import pandas as pd

from .config import PipelineConfig
from .pipeline import PolarEquinoxPipeline
from .validation import validate_observations


def main() -> None:
    """Parse command-line arguments and run the requested pipeline command."""
    parser = argparse.ArgumentParser(description="Analyze polar equinox ephemerides from NASA JPL Horizons.")
    parser.add_argument(
        "command",
        nargs="?",
        default="all",
        choices=["all", "download", "analyze", "report", "plots", "website", "validate"],
    )
    parser.add_argument("--start-year", type=int, default=2006)
    parser.add_argument("--end-year", type=int, default=2024)
    parser.add_argument("--output-dir", default="results")
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--cache-dir", default="cache/horizons")
    parser.add_argument("--website-dir", default="website")
    parser.add_argument("--force-download", action="store_true")
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    config = PipelineConfig(
        start_year=args.start_year,
        end_year=args.end_year,
        output_dir=Path(args.output_dir),
        data_dir=Path(args.data_dir),
        cache_dir=Path(args.cache_dir),
        website_dir=Path(args.website_dir),
        force_download=args.force_download,
    )
    pipeline = PolarEquinoxPipeline(config=config)
    if args.command == "all":
        pipeline.run(args.start_year, args.end_year)
    elif args.command == "download":
        pipeline.download(args.start_year, args.end_year)
    elif args.command in {"analyze", "plots", "report", "validate"}:
        observations = pd.read_csv(config.data_dir / "observations_raw.csv")
        if args.command == "validate":
            validate_observations(observations, config.output_dir / "quality_control_report.md")
        else:
            observations, stats, summary = pipeline.analyze(observations)
            figures = pipeline.plots(observations) if args.command in {"plots", "report"} else []
            if args.command == "report":
                pipeline.report(observations, stats, summary, figures)
    elif args.command == "website":
        pipeline.website()


if __name__ == "__main__":
    main()
