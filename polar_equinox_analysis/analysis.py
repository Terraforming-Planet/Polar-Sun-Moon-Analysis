"""Statistical analysis utilities for computed Horizons observations."""

from __future__ import annotations

import numpy as np
import pandas as pd


def _polynomial_coefficients(years: np.ndarray, values: np.ndarray, degree: int) -> np.ndarray:
    """Return polynomial coefficients, or NaNs when too few observations exist."""
    if len(values) <= degree:
        return np.full(degree + 1, np.nan, dtype=float)
    return np.asarray(np.polyfit(years, values, deg=degree), dtype=float)


def _correlation(years: np.ndarray, values: np.ndarray) -> float:
    """Return correlation with year, or NaN when correlation is undefined."""
    if len(values) <= 1 or np.all(years == years[0]) or np.all(values == values[0]):
        return float(np.nan)
    return float(np.corrcoef(years, values)[0, 1])


def summarize_statistics(data: pd.DataFrame) -> pd.DataFrame:
    """Compute descriptive, trend, polynomial, and correlation statistics."""
    records: list[dict[str, object]] = []
    group_cols = ["pole", "season", "body", "quantity"]
    long = data.melt(
        id_vars=["year", "season", "pole", "body", "timestamp_utc"],
        value_vars=["apparent_altitude_deg", "declination_deg"],
        var_name="quantity",
        value_name="value",
    )
    for keys, group in long.groupby(group_cols, dropna=False):
        years = group["year"].to_numpy(dtype=float)
        values = group["value"].to_numpy(dtype=float)
        linear = _polynomial_coefficients(years, values, degree=1)
        poly2 = _polynomial_coefficients(years, values, degree=2)
        records.append(
            {
                "pole": keys[0],
                "season": keys[1],
                "body": keys[2],
                "quantity": keys[3],
                "mean": float(np.mean(values)),
                "standard_deviation": float(np.std(values, ddof=1))
                if len(values) > 1
                else float(np.nan),
                "minimum": float(np.min(values)),
                "maximum": float(np.max(values)),
                "linear_trend_slope_per_year": float(linear[0]),
                "linear_trend_intercept": float(linear[1]),
                "polynomial_trend_quadratic": float(poly2[0]),
                "polynomial_trend_linear": float(poly2[1]),
                "polynomial_trend_intercept": float(poly2[2]),
                "correlation_with_year": _correlation(years, values),
            }
        )
    return pd.DataFrame.from_records(records)


def scientific_summary(stats: pd.DataFrame) -> str:
    """Create a concise summary based only on computed statistics."""
    lines = [
        "Scientific summary based only on NASA JPL Horizons ephemerides:",
        "No lunar phase, image-processing, machine-learning, or non-Horizons data were used.",
    ]
    for _, row in stats.iterrows():
        lines.append(
            f"{row['season']} {row['body']} at {row['pole']} for {row['quantity']}: "
            f"mean={row['mean']:.6f} deg, std={row['standard_deviation']:.6f}, "
            f"min={row['minimum']:.6f}, max={row['maximum']:.6f}, "
            f"linear slope={row['linear_trend_slope_per_year']:.6e} deg/year, "
            f"correlation with year={row['correlation_with_year']:.6f}."
        )
    return "\n".join(lines)
