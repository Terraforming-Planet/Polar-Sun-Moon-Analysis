"""Object-oriented orchestration for the complete scientific workflow."""

from __future__ import annotations

import logging
from dataclasses import asdict
from pathlib import Path

from .analysis import scientific_summary, summarize_statistics
from .equinox import EquinoxFinder
from .horizons import HorizonsClient, observations_to_dataframe
from .models import Observatory
from .reporting import create_figures, export_pdf_report, export_tables

LOGGER = logging.getLogger(__name__)


class PolarEquinoxPipeline:
    """Download, validate, analyze, and export polar equinox ephemerides."""

    def __init__(
        self, output_dir: Path | str = "outputs", cache_dir: Path | str = ".cache/horizons"
    ) -> None:
        """Initialize the pipeline with output and cache locations."""
        self.output_dir = Path(output_dir)
        self.client = HorizonsClient(cache_dir=cache_dir)
        self.finder = EquinoxFinder(self.client)
        self.observers = [
            Observatory(name="North Pole", latitude=90.0),
            Observatory(name="South Pole", latitude=-90.0),
        ]

    def run(self, start_year: int = 2006, end_year: int = 2024) -> dict[str, Path]:
        """Execute the complete project workflow and return generated paths."""
        self.output_dir.mkdir(parents=True, exist_ok=True)
        events = self.finder.events(start_year=start_year, end_year=end_year)
        records: list[dict[str, object]] = []
        for event in events:
            for observer in self.observers:
                for body in ("Sun", "Moon"):
                    LOGGER.info("Fetching %s at %s for %s", body, observer.name, event)
                    values = self.client.observer_ephemeris(body, observer, event.timestamp_utc)
                    record = asdict(event) | {
                        "pole": observer.name,
                        "body": body,
                        **values,
                    }
                    records.append(record)
        observations = observations_to_dataframe(records)
        statistics = summarize_statistics(observations)
        summary = scientific_summary(statistics)
        (self.output_dir / "scientific_summary.txt").write_text(summary, encoding="utf-8")
        export_tables(observations, statistics, self.output_dir)
        figures = create_figures(observations, self.output_dir)
        pdf = export_pdf_report(observations, statistics, summary, figures, self.output_dir)
        return {"pdf_report": pdf, "output_dir": self.output_dir}
