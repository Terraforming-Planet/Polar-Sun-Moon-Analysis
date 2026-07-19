"""Statistical analysis utilities for computed Horizons observations."""

from __future__ import annotations

import numpy as np
import pandas as pd


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
        linear = np.polyfit(years, values, deg=1)
        poly2 = np.polyfit(years, values, deg=2)
        correlation = float(np.corrcoef(years, values)[0, 1]) if len(values) > 1 else np.nan
        records.append(
            {
                "pole": keys[0],
                "season": keys[1],
                "body": keys[2],
                "quantity": keys[3],
                "mean": float(np.mean(values)),
                "standard_deviation": float(np.std(values, ddof=1)),
                "minimum": float(np.min(values)),
                "maximum": float(np.max(values)),
                "linear_trend_slope_per_year": float(linear[0]),
                "linear_trend_intercept": float(linear[1]),
                "polynomial_trend_quadratic": float(poly2[0]),
                "polynomial_trend_linear": float(poly2[1]),
                "polynomial_trend_intercept": float(poly2[2]),
                "correlation_with_year": correlation,
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
