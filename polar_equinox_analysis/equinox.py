"""Generation of vernal and autumnal equinox instants using Horizons data."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from .horizons import HorizonsClient, HorizonsResponseError
from .models import EquinoxEvent

LOGGER = logging.getLogger(__name__)


class EquinoxFinder:
    """Find Sun declination zero crossings from official Horizons ephemerides."""

    WINDOWS = {"vernal": (3, 18, 3, 22), "autumnal": (9, 20, 9, 24)}

    def __init__(self, client: HorizonsClient, tolerance_seconds: int = 60) -> None:
        """Create an equinox finder using a Horizons client."""
        self.client = client
        self.tolerance = timedelta(seconds=tolerance_seconds)

    def events(self, start_year: int = 2006, end_year: int = 2024) -> list[EquinoxEvent]:
        """Generate vernal and autumnal equinoxes for inclusive year bounds."""
        return [
            self.find_event(year, season)
            for year in range(start_year, end_year + 1)
            for season in ("vernal", "autumnal")
        ]

    def find_event(self, year: int, season: str) -> EquinoxEvent:
        """Find a single apparent geocentric Sun declination crossing."""
        if season not in self.WINDOWS:
            raise ValueError(f"Unknown season: {season}")
        start_month, start_day, stop_month, stop_day = self.WINDOWS[season]
        left = datetime(year, start_month, start_day, tzinfo=UTC)
        right = datetime(year, stop_month, stop_day, 23, 59, tzinfo=UTC)
        left_dec = self.client.sun_declination(left)
        right_dec = self.client.sun_declination(right)
        if left_dec * right_dec > 0:
            raise HorizonsResponseError(
                f"Sun declination did not bracket zero for {year} {season}: "
                f"{left.isoformat()}={left_dec}, {right.isoformat()}={right_dec}"
            )
        while right - left > self.tolerance:
            middle = left + (right - left) / 2
            middle_dec = self.client.sun_declination(middle)
            if left_dec * middle_dec <= 0:
                right = middle
                right_dec = middle_dec
            else:
                left = middle
                left_dec = middle_dec
        timestamp = left + (right - left) / 2
        LOGGER.info("Found %s %s equinox at %s", year, season, timestamp.isoformat())
        return EquinoxEvent(year=year, season=season, timestamp_utc=timestamp)
