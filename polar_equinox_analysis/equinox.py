"""Find equinoxes from apparent geocentric Sun declination returned by JPL."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from .horizons import HorizonsClient, HorizonsResponseError
from .models import EquinoxEvent


class EquinoxFinder:
    """Locate zero crossings efficiently using one Horizons series per event."""

    WINDOWS = {"vernal": (3, 18, 5), "autumnal": (9, 20, 5)}

    def __init__(self, client: HorizonsClient) -> None:
        self.client = client

    def events(
        self, start_year: int = 2006, end_year: int | None = None, include_future: bool = False
    ) -> list[EquinoxEvent]:
        now = datetime.now(UTC)
        final_year = end_year if end_year is not None else now.year
        events = [
            self.find_event(year, season)
            for year in range(start_year, final_year + 1)
            for season in ("vernal", "autumnal")
        ]
        if include_future:
            return events
        return [event for event in events if event.timestamp_utc <= now]

    def find_event(self, year: int, season: str) -> EquinoxEvent:
        if season not in self.WINDOWS:
            raise ValueError(f"Unknown season: {season}")
        month, day, duration_days = self.WINDOWS[season]
        start = datetime(year, month, day, tzinfo=UTC)
        series = self.client.sun_declination_series(
            start, start + timedelta(days=duration_days), step_minutes=30
        )
        for (left_time, left_dec), (right_time, right_dec) in zip(series, series[1:], strict=False):
            if left_dec == 0:
                timestamp = left_time
                break
            if left_dec * right_dec <= 0:
                fraction = abs(left_dec) / (abs(left_dec) + abs(right_dec))
                timestamp = left_time + (right_time - left_time) * fraction
                break
        else:
            raise HorizonsResponseError(f"No Sun declination crossing for {year} {season}")
        return EquinoxEvent(year=year, season=season, timestamp_utc=timestamp)
