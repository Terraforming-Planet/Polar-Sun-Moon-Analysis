"""Object-oriented orchestration for the complete scientific workflow."""
from __future__ import annotations

import logging
import shutil
import time
from dataclasses import asdict
from pathlib import Path

from .analysis import scientific_summary, summarize_statistics
from .config import PipelineConfig
from .equinox import EquinoxFinder
from .horizons import HorizonsClient, observations_to_dataframe
from .models import Observatory
from .reporting import build_website, create_figures, export_markdown_report, export_pdf_report, export_tables
from .validation import validate_observations

LOGGER = logging.getLogger(__name__)


class PolarEquinoxPipeline:
    """Download, validate, analyze, report, and publish polar equinox ephemerides."""

    def __init__(self, config: PipelineConfig | None = None, output_dir: Path | str | None = None, cache_dir: Path | str | None = None) -> None:
        """Initialize the pipeline while preserving the legacy constructor arguments."""
        self.config = config or PipelineConfig()
        if output_dir is not None:
            self.config = PipelineConfig(output_dir=Path(output_dir), cache_dir=self.config.cache_dir)
        if cache_dir is not None:
            self.config = PipelineConfig(output_dir=self.config.output_dir, cache_dir=Path(cache_dir))
        self.config.ensure_directories()
        self.client = HorizonsClient(cache_dir=self.config.cache_dir)
        self.client.force_download = self.config.force_download
        self.finder = EquinoxFinder(self.client)
        self.observers = [Observatory(name="North Pole", latitude=90.0), Observatory(name="South Pole", latitude=-90.0)]

    def download(self, start_year: int | None = None, end_year: int | None = None):
        """Download and cache NASA Horizons observations, returning an observation DataFrame."""
        started = time.perf_counter()
        events = self.finder.events(start_year or self.config.start_year, end_year or self.config.end_year)
        records: list[dict[str, object]] = []
        for event in events:
            for observer in self.observers:
                for body in self.config.bodies:
                    LOGGER.info("Fetching %s at %s for %s", body, observer.name, event)
                    values = self.client.observer_ephemeris(body, observer, event.timestamp_utc)
                    records.append(asdict(event) | {"pole": observer.name, "body": body, **values})
        observations = observations_to_dataframe(records)
        observations.to_csv(self.config.data_dir / "observations_raw.csv", index=False)
        for cache_file in self.config.cache_dir.glob("*.txt"):
            shutil.copy2(cache_file, self.config.raw_archive_dir / cache_file.name)
        LOGGER.info("Downloaded %s observations in %.2fs", len(observations), time.perf_counter() - started)
        return observations

    def analyze(self, observations=None):
        """Run quality control and statistical analysis."""
        if observations is None:
            observations = observations_to_dataframe([])
            raw_path = self.config.data_dir / "observations_raw.csv"
            if raw_path.exists():
                import pandas as pd
                observations = pd.read_csv(raw_path)
        validate_observations(observations, self.config.output_dir / "quality_control_report.md")
        statistics = summarize_statistics(observations, self.config.rolling_window)
        summary = scientific_summary(statistics)
        (self.config.output_dir / "scientific_summary.txt").write_text(summary, encoding="utf-8")
        export_tables(observations, statistics, self.config.output_dir)
        return observations, statistics, summary

    def plots(self, observations):
        """Generate static publication figures."""
        return create_figures(observations, self.config.output_dir)

    def report(self, observations, statistics, summary, figures):
        """Generate Markdown, HTML table, and PDF scientific reports."""
        md = export_markdown_report(observations, statistics, summary, self.config.output_dir)
        pdf = export_pdf_report(observations, statistics, summary, figures, self.config.output_dir)
        return {"markdown_report": md, "pdf_report": pdf}

    def website(self) -> None:
        """Generate the GitHub Pages research website."""
        build_website(self.config.output_dir, self.config.website_dir)

    def run(self, start_year: int = 2006, end_year: int = 2024) -> dict[str, Path]:
        """Execute the complete project workflow and return generated paths."""
        observations = self.download(start_year, end_year)
        observations, statistics, summary = self.analyze(observations)
        figures = self.plots(observations)
        reports = self.report(observations, statistics, summary, figures)
        self.website()
        return reports | {"output_dir": self.config.output_dir, "website_dir": self.config.website_dir}
