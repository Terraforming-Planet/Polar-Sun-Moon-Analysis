"""End-to-end polar observation pipeline."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .analysis import scientific_summary, summarize_statistics
from .equinox import EquinoxFinder
from .horizons import HorizonsClient, observations_to_dataframe
from .models import Observatory
from .reporting import create_figures, export_pdf_report, export_summary_documents, export_tables

LOGGER = logging.getLogger(__name__)


class PolarEquinoxPipeline:
    """Download, validate, archive, analyze, and export JPL-derived observations."""

    def __init__(
        self,
        output_dir: Path | str = "outputs",
        cache_dir: Path | str = ".cache/horizons",
        force_download: bool = False,
    ) -> None:
        self.output_dir = Path(output_dir)
        self.client = HorizonsClient(cache_dir=cache_dir, force_download=force_download)
        self.finder = EquinoxFinder(self.client)
        self.observers = [
            Observatory(name="North Pole", latitude=90.0),
            Observatory(name="South Pole", latitude=-90.0),
        ]

    def run(
        self,
        start_year: int = 2006,
        end_year: int | None = None,
        include_future: bool = False,
    ) -> dict[str, Path]:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        archive_dir = self.output_dir / "archive"
        events = self.finder.events(start_year, end_year, include_future)
        records: list[dict[str, object]] = []
        timestamps = [event.timestamp_utc for event in events]
        for observer in self.observers:
            for body in ("Sun", "Moon"):
                values = self.client.observer_ephemerides(body, observer, timestamps)
                provenance = dict(self.client.last_metadata)
                self._archive_raw_response(archive_dir, observer, body, provenance)
                for event, observation in zip(events, values, strict=True):
                    record = (
                        asdict(event)
                        | {
                            "pole": observer.name,
                            "requested_latitude": observer.latitude,
                            "effective_latitude": observer.latitude,
                            "longitude_deg": observer.longitude,
                            "elevation_km": observer.elevation_km,
                            "reference_frame": "ICRF / true equator and equinox of date",
                            "apparent_correction": "AIRLESS",
                            "body": body,
                            **observation,
                            "source_url": self.client.API_URL,
                            "manual_verification_url": self.client.APP_URL,
                            "response_sha256": provenance.get("response_sha256"),
                            "api_version": provenance.get("api_version"),
                            "retrieved_at_utc": provenance.get("retrieved_at_utc"),
                            "cache_key": provenance.get("cache_key"),
                            "record_kind": "ephemeris",
                            "future_event": event.timestamp_utc > datetime.now(UTC),
                            "quality_flags": [
                                "validated_horizons_response",
                                "official_nasa_jpl_horizons",
                                "airless_topocentric_coordinates",
                            ],
                        }
                    )
                    records.append(record)
                    self._archive_processed_record(archive_dir, record)
        observations = observations_to_dataframe(records).sort_values(
            ["timestamp_utc", "pole", "body"]
        )
        statistics = summarize_statistics(observations)
        summary = scientific_summary(statistics)
        export_summary_documents(summary, self.output_dir)
        export_tables(observations, statistics, self.output_dir)
        figures = create_figures(observations, self.output_dir)
        pdf = export_pdf_report(observations, statistics, summary, figures, self.output_dir)
        manifest = {
            "generated_at_utc": datetime.now(UTC).isoformat(),
            "start_year": start_year,
            "end_year": end_year or datetime.now(UTC).year,
            "include_future": include_future,
            "records": len(observations),
            "source": self.client.API_URL,
            "manual_verification": self.client.APP_URL,
            "observer_quantities": self.client.OBSERVER_QUANTITIES,
            "archive_layout": {
                "raw": "archive/raw/<pole>/<body>.txt and .metadata.json",
                "processed": "archive/processed/<year>/<season>/<pole>/<body>.json",
            },
        }
        (self.output_dir / "manifest.json").write_text(
            json.dumps(manifest, indent=2), encoding="utf-8"
        )
        return {"pdf_report": pdf, "output_dir": self.output_dir, "archive_dir": archive_dir}

    def _archive_raw_response(
        self,
        archive_dir: Path,
        observer: Observatory,
        body: str,
        provenance: dict[str, object],
    ) -> None:
        slug = observer.name.lower().replace(" ", "-")
        target = archive_dir / "raw" / slug
        target.mkdir(parents=True, exist_ok=True)
        (target / f"{body.lower()}.txt").write_text(self.client.last_text, encoding="utf-8")
        (target / f"{body.lower()}.metadata.json").write_text(
            json.dumps(provenance, indent=2, sort_keys=True, default=self._json_default),
            encoding="utf-8",
        )

    def _archive_processed_record(self, archive_dir: Path, record: dict[str, object]) -> None:
        pole = str(record["pole"]).lower().replace(" ", "-")
        body = str(record["body"]).lower()
        target = (
            archive_dir
            / "processed"
            / str(record["year"])
            / str(record["season"])
            / pole
        )
        target.mkdir(parents=True, exist_ok=True)
        (target / f"{body}.json").write_text(
            json.dumps(record, indent=2, sort_keys=True, default=self._json_default),
            encoding="utf-8",
        )

    @staticmethod
    def _json_default(value: Any) -> str:
        if isinstance(value, datetime):
            return value.astimezone(UTC).isoformat()
        return str(value)
