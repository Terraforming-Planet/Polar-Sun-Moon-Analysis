"""Quality-control validators for Horizons-derived observation tables."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import pandas as pd


class ValidationError(RuntimeError):
    """Raised when quality-control checks detect invalid observations."""


@dataclass(frozen=True)
class ValidationIssue:
    """A single quality-control issue found in an observation table."""

    severity: str
    column: str
    message: str


REQUIRED_COLUMNS = {
    "year", "season", "timestamp_utc", "pole", "body", "apparent_altitude_deg", "declination_deg"
}


def validate_observations(data: pd.DataFrame, report_path: Path | None = None) -> list[ValidationIssue]:
    """Validate missing columns, nulls, duplicates, timestamps, and physical ranges."""
    issues: list[ValidationIssue] = []
    missing = sorted(REQUIRED_COLUMNS - set(data.columns))
    for column in missing:
        issues.append(ValidationIssue("error", column, "Required column is missing."))
    if missing:
        _write_report(issues, report_path)
        raise ValidationError(f"Missing required columns: {missing}")

    for column in sorted(REQUIRED_COLUMNS):
        if data[column].isna().any():
            issues.append(ValidationIssue("error", column, "Column contains missing values."))
    if data.duplicated(["year", "season", "timestamp_utc", "pole", "body"]).any():
        issues.append(ValidationIssue("error", "duplicates", "Duplicate body/pole/equinox observations found."))
    timestamps = pd.to_datetime(data["timestamp_utc"], utc=True, errors="coerce")
    if timestamps.isna().any():
        issues.append(ValidationIssue("error", "timestamp_utc", "One or more timestamps cannot be parsed as UTC."))
    if (~data["declination_deg"].between(-90, 90)).any():
        issues.append(ValidationIssue("error", "declination_deg", "Declination outside [-90, 90] degrees."))
    if (~data["apparent_altitude_deg"].between(-90, 90)).any():
        issues.append(ValidationIssue("error", "apparent_altitude_deg", "Altitude outside [-90, 90] degrees."))
    _write_report(issues, report_path)
    if any(issue.severity == "error" for issue in issues):
        raise ValidationError(f"Quality control failed with {len(issues)} issue(s).")
    return issues


def _write_report(issues: list[ValidationIssue], report_path: Path | None) -> None:
    """Write a Markdown quality-control report."""
    if report_path is None:
        return
    report_path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["# Quality Control Report", "", "All values must originate from NASA JPL Horizons.", ""]
    if not issues:
        lines.append("No quality-control issues detected.")
    else:
        lines.extend(f"- **{i.severity.upper()}** `{i.column}`: {i.message}" for i in issues)
    report_path.write_text("\n".join(lines), encoding="utf-8")
