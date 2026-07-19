"""Configuration objects for the polar equinox research pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class PipelineConfig:
    """Runtime configuration for reproducible Horizons processing."""

    start_year: int = 2006
    end_year: int = 2024
    output_dir: Path = Path("results")
    data_dir: Path = Path("data")
    cache_dir: Path = Path("cache/horizons")
    website_dir: Path = Path("website")
    raw_archive_dir: Path = Path("data/raw/horizons")
    force_download: bool = False
    rolling_window: int = 3
    confidence_level: float = 0.95
    bodies: tuple[str, ...] = ("Sun", "Moon")
    quantities: tuple[str, ...] = ("apparent_altitude_deg", "declination_deg")

    def ensure_directories(self) -> None:
        """Create all configured output directories if they do not exist."""
        for directory in (self.output_dir, self.data_dir, self.cache_dir, self.website_dir, self.raw_archive_dir):
            directory.mkdir(parents=True, exist_ok=True)
