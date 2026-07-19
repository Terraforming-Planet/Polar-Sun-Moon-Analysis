"""Client and validators for the official NASA JPL Horizons API.

This module intentionally talks directly to the official machine-to-machine
Horizons endpoint at https://ssd.jpl.nasa.gov/api/horizons.api with the query
parameters required by the official API documentation. It never computes or
substitutes astronomical quantities locally. If Horizons omits a required field,
the raw response or parsed row is included in the error message and processing
stops.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import requests

from .models import Observatory

LOGGER = logging.getLogger(__name__)


class HorizonsResponseError(RuntimeError):
    """Raised when NASA JPL Horizons output is missing required data."""


class HorizonsClient:
    """Small cached, retrying client for official NASA JPL Horizons ephemerides."""

    API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
    BODY_COMMANDS = {"Sun": "10", "Moon": "301"}

    def __init__(
        self,
        cache_dir: Path | str = ".cache/horizons",
        retries: int = 4,
        backoff_seconds: float = 2.0,
        timeout_seconds: int = 60,
    ) -> None:
        """Create a client with file-based caching and exponential retry."""
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.retries = retries
        self.backoff_seconds = backoff_seconds
        self.timeout_seconds = timeout_seconds

    def fetch_text(self, params: dict[str, Any]) -> str:
        """Return raw Horizons response text, using cache before network."""
        normalized = json.dumps(params, sort_keys=True, default=str)
        cache_key = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        cache_path = self.cache_dir / f"{cache_key}.txt"
        if cache_path.exists():
            LOGGER.debug("Using cached Horizons response %s", cache_path)
            return cache_path.read_text(encoding="utf-8")

        last_error: Exception | None = None
        for attempt in range(1, self.retries + 1):
            try:
                LOGGER.info("Requesting Horizons API, attempt %s", attempt)
                response = requests.get(
                    self.API_URL,
                    params=params,
                    timeout=self.timeout_seconds,
                )
                response.raise_for_status()
                text = response.text
                self._validate_raw_response(text)
                cache_path.write_text(text, encoding="utf-8")
                return text
            except (requests.RequestException, HorizonsResponseError) as exc:
                last_error = exc
                if attempt == self.retries:
                    break
                sleep_for = self.backoff_seconds * (2 ** (attempt - 1))
                LOGGER.warning("Horizons request failed: %s; retrying in %.1fs", exc, sleep_for)
                time.sleep(sleep_for)
        raise HorizonsResponseError(f"Horizons API failed after retries: {last_error}")

    def observer_ephemeris(
        self,
        body: str,
        observer: Observatory,
        timestamp: datetime,
    ) -> dict[str, float]:
        """Fetch one apparent altitude and declination observation for a body."""
        self._validate_timestamp(timestamp)
        start = self._format_time(timestamp - timedelta(minutes=1))
        stop = self._format_time(timestamp + timedelta(minutes=1))
        params = self._base_params(body, start, stop)
        params.update(
            {
                "CENTER": "coord@399",
                "COORD_TYPE": "GEODETIC",
                "SITE_COORD": observer.horizons_site_coord,
                "STEP_SIZE": "2m",
                "QUANTITIES": "4,20",
            }
        )
        text = self.fetch_text(params)
        rows = self._parse_csv_rows(text)
        if not rows:
            raise HorizonsResponseError(f"No ephemeris rows returned by Horizons:\n{text}")
        unique_rows = self._deduplicate_rows(rows)
        row = unique_rows[len(unique_rows) // 2]
        return {
            "declination_deg": self._required_float(row, ["DEC", "DEC_(ICRF)", "DEC_(a-app)"]),
            "apparent_altitude_deg": self._required_float(
                row,
                ["EL", "Elev", "Elevation", "Elev_(a-app)", "Elevation_(a-app)"],
            ),
        }

    def sun_declination(self, timestamp: datetime) -> float:
        """Fetch apparent geocentric Sun declination at one instant."""
        self._validate_timestamp(timestamp)
        start = self._format_time(timestamp)
        stop = self._format_time(timestamp + timedelta(minutes=1))
        params = self._base_params("Sun", start, stop)
        params.update({"CENTER": "500@399", "STEP_SIZE": "1m", "QUANTITIES": "4"})
        text = self.fetch_text(params)
        rows = self._parse_csv_rows(text)
        if not rows:
            raise HorizonsResponseError(f"No Sun declination rows returned from Horizons:\n{text}")
        return self._required_float(rows[0], ["DEC", "DEC_(ICRF)", "DEC_(a-app)"])

    def _base_params(self, body: str, start: str, stop: str) -> dict[str, str]:
        if body not in self.BODY_COMMANDS:
            raise ValueError(f"Unsupported body: {body}")
        return {
            "format": "text",
            "COMMAND": self.BODY_COMMANDS[body],
            "EPHEM_TYPE": "OBSERVER",
            "START_TIME": start,
            "STOP_TIME": stop,
            "CSV_FORMAT": "YES",
            "MAKE_EPHEM": "YES",
            "OBJ_DATA": "NO",
            "TIME_TYPE": "UT",
            "ANG_FORMAT": "DEG",
            "APPARENT": "AIRLESS",
        }

    @staticmethod
    def _validate_timestamp(value: datetime) -> None:
        if not isinstance(value, datetime):
            raise TypeError(f"timestamp must be a datetime, got {type(value).__name__}")

    @staticmethod
    def _format_time(value: datetime) -> str:
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).strftime("%Y-%b-%d %H:%M")

    @staticmethod
    def _validate_raw_response(text: str) -> None:
        if "$$SOE" not in text or "$$EOE" not in text:
            raise HorizonsResponseError(f"Invalid Horizons response, missing $$SOE/$$EOE:\n{text}")
        if "No ephemeris" in text or "Cannot" in text or "ERROR" in text.upper():
            raise HorizonsResponseError(f"Horizons reported an error:\n{text}")

    @staticmethod
    def _parse_csv_rows(text: str) -> list[dict[str, str]]:
        lines = text.splitlines()
        try:
            soe = lines.index("$$SOE")
            eoe = lines.index("$$EOE")
        except ValueError as exc:
            raise HorizonsResponseError(
                f"Missing data block in Horizons response:\n{text}"
            ) from exc
        header_line = next((line for line in reversed(lines[:soe]) if "," in line), None)
        if header_line is None:
            raise HorizonsResponseError(f"Missing CSV header in Horizons response:\n{text}")
        columns = [column.strip() for column in header_line.split(",")]
        rows: list[dict[str, str]] = []
        for line in lines[soe + 1 : eoe]:
            if not line.strip():
                continue
            values = [value.strip() for value in line.split(",")]
            if len(values) < len(columns):
                raise HorizonsResponseError(f"Malformed CSV row in Horizons response:\n{text}")
            rows.append(dict(zip(columns, values, strict=False)))
        return rows

    @staticmethod
    def _deduplicate_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
        unique_rows: list[dict[str, str]] = []
        seen: set[tuple[tuple[str, str], ...]] = set()
        for row in rows:
            key = tuple(sorted(row.items()))
            if key not in seen:
                unique_rows.append(row)
                seen.add(key)
        return unique_rows

    @staticmethod
    def _normalize_column_name(name: str) -> str:
        return re.sub(r"[^a-z0-9]", "", name.lower())

    @classmethod
    def _required_float(cls, row: dict[str, str], candidates: list[str]) -> float:
        normalized = {cls._normalize_column_name(key): value for key, value in row.items()}
        for name in candidates:
            key = cls._normalize_column_name(name)
            if key in normalized and normalized[key] not in {"", "n.a."}:
                try:
                    return float(normalized[key])
                except ValueError as exc:
                    raise HorizonsResponseError(
                        "Required quantity was present but not a decimal degree value. "
                        "Confirm ANG_FORMAT=DEG is being honored by NASA Horizons. "
                        f"Candidate={name}; value={normalized[key]!r}; row={row}"
                    ) from exc
        raise HorizonsResponseError(
            "Required quantity unavailable in NASA Horizons row. "
            f"Candidates={candidates}; row={row}"
        )


def observations_to_dataframe(records: list[dict[str, object]]) -> pd.DataFrame:
    """Create a typed Pandas DataFrame from observation dictionaries."""
    return pd.DataFrame.from_records(records)
