"""Statistical analysis utilities for computed Horizons observations."""
from __future__ import annotations

import numpy as np
import pandas as pd


def summarize_statistics(data: pd.DataFrame, rolling_window: int = 3) -> pd.DataFrame:
    """Compute descriptive, regression, rolling, correlation, and confidence statistics."""
    records: list[dict[str, object]] = []
    long = data.melt(
        id_vars=["year", "season", "pole", "body", "timestamp_utc"],
        value_vars=["apparent_altitude_deg", "declination_deg"],
        var_name="quantity",
        value_name="value",
    ).sort_values(["pole", "season", "body", "quantity", "year"])
    for keys, group in long.groupby(["pole", "season", "body", "quantity"], dropna=False):
        years = group["year"].to_numpy(dtype=float)
        values = group["value"].to_numpy(dtype=float)
        std = float(np.std(values, ddof=1)) if len(values) > 1 else 0.0
        stderr = std / float(np.sqrt(len(values))) if len(values) else np.nan
        linear = np.polyfit(years, values, deg=1) if len(values) > 1 else [np.nan, np.nan]
        poly2 = np.polyfit(years, values, deg=2) if len(values) > 2 else [np.nan, np.nan, np.nan]
        records.append({
            "pole": keys[0], "season": keys[1], "body": keys[2], "quantity": keys[3],
            "count": int(len(values)), "mean": float(np.mean(values)), "median": float(np.median(values)),
            "standard_deviation": std, "variance": float(np.var(values, ddof=1)) if len(values) > 1 else 0.0,
            "minimum": float(np.min(values)), "maximum": float(np.max(values)),
            "seasonal_amplitude": float(np.max(values) - np.min(values)),
            "linear_trend_slope_per_year": float(linear[0]), "linear_trend_intercept": float(linear[1]),
            "polynomial_trend_quadratic": float(poly2[0]), "polynomial_trend_linear": float(poly2[1]),
            "polynomial_trend_intercept": float(poly2[2]),
            "pearson_correlation_with_year": float(np.corrcoef(years, values)[0, 1]) if len(values) > 1 else np.nan,
            "spearman_correlation_with_year": float(pd.Series(years).corr(pd.Series(values), method="spearman")) if len(values) > 1 else np.nan,
            "confidence_interval_95_low": float(np.mean(values) - 1.96 * stderr),
            "confidence_interval_95_high": float(np.mean(values) + 1.96 * stderr),
            "rolling_mean_latest": float(pd.Series(values).rolling(rolling_window, min_periods=1).mean().iloc[-1]),
            "moving_std_latest": float(pd.Series(values).rolling(rolling_window, min_periods=2).std().iloc[-1]) if len(values) > 1 else 0.0,
        })
    return pd.DataFrame.from_records(records)


def scientific_summary(stats: pd.DataFrame) -> str:
    """Create a summary based only on computed NASA JPL Horizons statistics."""
    lines = [
        "Scientific summary based only on NASA JPL Horizons ephemerides.",
        "This software performs observations only and does not prove hypotheses.",
        "Conclusions are limited to the analyzed 2006-2024 equinox ephemerides.",
    ]
    for _, row in stats.iterrows():
        lines.append(
            f"{row['season']} {row['body']} at {row['pole']} for {row['quantity']}: "
            f"mean={row['mean']:.6f} deg, median={row['median']:.6f}, std={row['standard_deviation']:.6f}, "
            f"min={row['minimum']:.6f}, max={row['maximum']:.6f}, trend={row['linear_trend_slope_per_year']:.6e} deg/year."
        )
    return "\n".join(lines)
