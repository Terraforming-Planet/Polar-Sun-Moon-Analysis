"""Typed domain models for the polar equinox ephemeris analysis."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Observatory:
    """Geodetic observer location used by NASA JPL Horizons."""

    name: str
    latitude: float
    longitude: float = 0.0
    elevation_km: float = 0.0

    @property
    def horizons_site_coord(self) -> str:
        """Return Horizons geodetic coordinate string: longitude,latitude,elevation."""
        return f"{self.longitude},{self.latitude},{self.elevation_km}"


@dataclass(frozen=True)
class EquinoxEvent:
    """A computed equinox instant where apparent geocentric Sun declination crosses zero."""

    year: int
    season: str
    timestamp_utc: datetime


@dataclass(frozen=True)
class BodyObservation:
    """Validated apparent topocentric observation for one body at one equinox."""

    year: int
    season: str
    timestamp_utc: datetime
    pole: str
    body: str
    apparent_altitude_deg: float
    declination_deg: float
    source_url: str = "https://ssd.jpl.nasa.gov/api/horizons.api"
    record_kind: str = "ephemeris"
