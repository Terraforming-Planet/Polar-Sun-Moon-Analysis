"""Reliable NASA JPL Horizons clients for polar and Solar System data."""

from __future__ import annotations

import csv
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
    """Raised when NASA JPL Horizons output is missing or invalid."""


def _quoted(value: object) -> str:
    """Quote a Horizons batch parameter exactly once."""
    text = str(value)
    if text.startswith("'") and text.endswith("'"):
        return text
    return f"'{text}'"


class HorizonsClient:
    """Cached, retrying client for official NASA JPL Horizons ephemerides."""

    API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
    BODY_COMMANDS = {"Sun": "10", "Moon": "301"}
    SOLAR_SYSTEM_COMMANDS = {
        "Mercury": "199",
        "Venus": "299",
        "Earth": "399",
        "Moon": "301",
        "Mars": "499",
        "Jupiter": "599",
        "Saturn": "699",
        "Uranus": "799",
        "Neptune": "899",
    }

    def __init__(
        self,
        cache_dir: Path | str = ".cache/horizons",
        retries: int = 4,
        backoff_seconds: float = 1.0,
        timeout_seconds: int = 60,
        force_download: bool = False,
    ) -> None:
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.retries = retries
        self.backoff_seconds = backoff_seconds
        self.timeout_seconds = timeout_seconds
        self.force_download = force_download
        self.last_metadata: dict[str, object] = {}

    def fetch_text(self, params: dict[str, Any]) -> str:
        """Return a validated response and record complete request provenance."""
        normalized = json.dumps(params, sort_keys=True, default=str)
        cache_key = hashlib.sha256(normalized.encode()).hexdigest()
        response_path = self.cache_dir / f"{cache_key}.txt"
        metadata_path = self.cache_dir / f"{cache_key}.json"
        if response_path.exists() and not self.force_download:
            text = response_path.read_text(encoding="utf-8")
            self.last_metadata = self._metadata(text, params, cache_key, True, None)
            return text

        last_error: Exception | None = None
        for attempt in range(1, self.retries + 1):
            started = time.perf_counter()
            try:
                response = requests.get(self.API_URL, params=params, timeout=self.timeout_seconds)
                response.raise_for_status()
                text = response.text
                self._validate_raw_response(text)
                elapsed = time.perf_counter() - started
                response_path.write_text(text, encoding="utf-8")
                self.last_metadata = self._metadata(
                    text, params, cache_key, False, elapsed, response.url
                )
                metadata_path.write_text(
                    json.dumps(self.last_metadata, indent=2, sort_keys=True), encoding="utf-8"
                )
                return text
            except (requests.RequestException, HorizonsResponseError) as exc:
                last_error = exc
                if attempt < self.retries:
                    time.sleep(self.backoff_seconds * 2 ** (attempt - 1))
        raise HorizonsResponseError(f"Horizons API failed after retries: {last_error}")

    def _metadata(
        self,
        text: str,
        params: dict[str, Any],
        cache_key: str,
        cached: bool,
        elapsed: float | None,
        response_url: str | None = None,
    ) -> dict[str, object]:
        match = re.search(r"API VERSION:\s*([^\s]+)", text)
        return {
            "source_url": response_url or self.API_URL,
            "request_parameters": params,
            "retrieved_at_utc": datetime.now(UTC).isoformat(),
            "response_sha256": hashlib.sha256(text.encode()).hexdigest(),
            "cache_key": cache_key,
            "cached": cached,
            "execution_time_seconds": elapsed,
            "api_version": match.group(1) if match else "unknown",
        }

    def sun_declination_series(
        self, start: datetime, stop: datetime, step_minutes: int = 30
    ) -> list[tuple[datetime, float]]:
        """Fetch apparent geocentric Sun declination over a time window."""
        params = self._base_params("Sun") | {
            "CENTER": _quoted("500@399"),
            "START_TIME": _quoted(self._format_time(start)),
            "STOP_TIME": _quoted(self._format_time(stop)),
            "STEP_SIZE": _quoted(f"{step_minutes}m"),
            "QUANTITIES": _quoted("2"),
        }
        rows = self._parse_csv_rows(self.fetch_text(params))
        return [
            (self._row_time(row), self._required_float(row, ["DEC_(a-app)", "DEC"]))
            for row in rows
        ]

    def sun_declination(self, timestamp: datetime) -> float:
        """Fetch apparent geocentric Sun declination at one UTC instant."""
        if not isinstance(timestamp, datetime):
            raise TypeError(f"timestamp must be a datetime, got {type(timestamp).__name__}")
        return self.sun_declination_series(timestamp, timestamp + timedelta(minutes=1), 1)[0][1]

    def observer_ephemerides(
        self, body: str, observer: Observatory, timestamps: list[datetime]
    ) -> list[dict[str, float]]:
        """Fetch topocentric apparent declination and elevation at exact times."""
        if not timestamps:
            return []
        tlist = " ".join(_quoted(self._format_time(value, seconds=True)) for value in timestamps)
        params = self._base_params(body) | {
            "CENTER": _quoted("coord@399"),
            "COORD_TYPE": _quoted("GEODETIC"),
            "SITE_COORD": _quoted(observer.horizons_site_coord),
            "TLIST": tlist,
            "TLIST_TYPE": _quoted("CAL"),
            "TIME_DIGITS": _quoted("SECONDS"),
            "QUANTITIES": _quoted("2,4"),
        }
        rows = self._parse_csv_rows(self.fetch_text(params))
        if len(rows) != len(timestamps):
            raise HorizonsResponseError(
                f"Expected {len(timestamps)} observer rows, received {len(rows)}"
            )
        return [
            {
                "declination_deg": self._required_float(row, ["DEC_(a-app)", "DEC"]),
                "apparent_altitude_deg": self._required_float(
                    row, ["Elev_(a-app)", "Elev", "Elevation", "EL"]
                ),
            }
            for row in rows
        ]

    def observer_ephemeris(
        self, body: str, observer: Observatory, timestamp: datetime
    ) -> dict[str, float]:
        """Compatibility wrapper for one observation."""
        return self.observer_ephemerides(body, observer, [timestamp])[0]

    def solar_system_vectors(self, timestamp: datetime) -> list[dict[str, object]]:
        """Fetch heliocentric ICRF positions for the planets and Moon in AU."""
        records: list[dict[str, object]] = [
            {"body": "Sun", "position_au": [0.0, 0.0, 0.0], "source": self.API_URL}
        ]
        for body, command in self.SOLAR_SYSTEM_COMMANDS.items():
            params = {
                "format": "text",
                "COMMAND": _quoted(command),
                "EPHEM_TYPE": _quoted("VECTORS"),
                "CENTER": _quoted("500@10"),
                "TLIST": _quoted(self._format_time(timestamp, seconds=True)),
                "TLIST_TYPE": _quoted("CAL"),
                "TIME_TYPE": _quoted("TDB"),
                "OUT_UNITS": _quoted("AU-D"),
                "VEC_TABLE": _quoted("2"),
                "CSV_FORMAT": _quoted("YES"),
                "MAKE_EPHEM": _quoted("YES"),
                "OBJ_DATA": _quoted("NO"),
            }
            rows = self._data_lines(self.fetch_text(params))
            values = next(csv.reader([rows[0]]))
            if len(values) < 5:
                raise HorizonsResponseError(f"Malformed vector row for {body}: {rows[0]}")
            records.append(
                {
                    "body": body,
                    "position_au": [float(values[2]), float(values[3]), float(values[4])],
                    "source": self.API_URL,
                    "response_sha256": self.last_metadata.get("response_sha256"),
                }
            )
        return records

    def _base_params(self, body: str) -> dict[str, str]:
        if body not in self.BODY_COMMANDS:
            raise ValueError(f"Unsupported body: {body}")
        return {
            "format": "text",
            "COMMAND": _quoted(self.BODY_COMMANDS[body]),
            "EPHEM_TYPE": _quoted("OBSERVER"),
            "CSV_FORMAT": _quoted("YES"),
            "MAKE_EPHEM": _quoted("YES"),
            "OBJ_DATA": _quoted("NO"),
            "TIME_TYPE": _quoted("UT"),
            "ANG_FORMAT": _quoted("DEG"),
            "APPARENT": _quoted("AIRLESS"),
        }

    @staticmethod
    def _format_time(value: datetime, seconds: bool = False) -> str:
        if not isinstance(value, datetime):
            raise TypeError(f"timestamp must be a datetime, got {type(value).__name__}")
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        pattern = "%Y-%b-%d %H:%M:%S" if seconds else "%Y-%b-%d %H:%M"
        return value.astimezone(UTC).strftime(pattern)

    @staticmethod
    def _validate_raw_response(text: str) -> None:
        upper = text.upper()
        if "$$SOE" not in text or "$$EOE" not in text:
            raise HorizonsResponseError(f"Invalid Horizons response, missing data block:\n{text}")
        if "INPUT ERROR" in upper or "NO EPHEMERIS" in upper or re.search(r"\bERROR\b", upper):
            raise HorizonsResponseError(f"Horizons reported an error:\n{text}")

    @staticmethod
    def _data_lines(text: str) -> list[str]:
        lines = text.splitlines()
        try:
            start, stop = lines.index("$$SOE"), lines.index("$$EOE")
        except ValueError as exc:
            raise HorizonsResponseError("Missing Horizons data block") from exc
        return [line for line in lines[start + 1 : stop] if line.strip()]

    @classmethod
    def _parse_csv_rows(cls, text: str) -> list[dict[str, str]]:
        lines = text.splitlines()
        start = lines.index("$$SOE")
        header = next((line for line in reversed(lines[:start]) if "," in line), None)
        if header is None:
            raise HorizonsResponseError("Missing Horizons CSV header")
        raw_columns = next(csv.reader([header]))
        columns = [value.strip() or f"_marker_{index}" for index, value in enumerate(raw_columns)]
        result: list[dict[str, str]] = []
        for line in cls._data_lines(text):
            values = [value.strip() for value in next(csv.reader([line]))]
            if len(values) < len(columns):
                raise HorizonsResponseError(f"Malformed Horizons CSV row: {line}")
            result.append(dict(zip(columns, values, strict=False)))
        return result

    @staticmethod
    def _normalize(name: str) -> str:
        return re.sub(r"[^a-z0-9]", "", name.lower())

    @classmethod
    def _required_float(cls, row: dict[str, str], candidates: list[str]) -> float:
        normalized = {cls._normalize(key): value for key, value in row.items()}
        for candidate in candidates:
            wanted = cls._normalize(candidate)
            matches = [key for key in normalized if key == wanted or key.startswith(wanted)]
            for key in matches:
                value = normalized[key]
                if value not in {"", "n.a."}:
                    try:
                        return float(value)
                    except ValueError as exc:
                        raise HorizonsResponseError(f"Non-numeric {candidate}: {value}") from exc
        raise HorizonsResponseError(f"Required quantity unavailable: {candidates}; row={row}")

    @classmethod
    def _row_time(cls, row: dict[str, str]) -> datetime:
        value = next(
            (value for key, value in row.items() if cls._normalize(key).startswith("dateut")),
            None,
        )
        if value is None:
            raise HorizonsResponseError(f"Timestamp unavailable in row: {row}")
        value = value.strip()
        for pattern in ("%Y-%b-%d %H:%M:%S.%f", "%Y-%b-%d %H:%M"):
            try:
                return datetime.strptime(value, pattern).replace(tzinfo=UTC)
            except ValueError:
                continue
        raise HorizonsResponseError(f"Unrecognized Horizons timestamp: {value}")


def observations_to_dataframe(records: list[dict[str, object]]) -> pd.DataFrame:
    """Create a typed Pandas DataFrame from observation dictionaries."""
    return pd.DataFrame.from_records(records)
