from __future__ import annotations

from tools.aggregate_water_area_measurements import combined_change, season_change


def records() -> list[dict[str, object]]:
    output: list[dict[str, object]] = []
    for season in ("spring", "autumn"):
        for year in range(1990, 1995):
            output.append(
                {
                    "season": season,
                    "year": year,
                    "measurement_status": "ok",
                    "central_area_m2": 1_000_000.0,
                    "conservative_area_m2": 900_000.0,
                    "upper_area_m2": 1_100_000.0,
                }
            )
        for year in range(2022, 2027):
            output.append(
                {
                    "season": season,
                    "year": year,
                    "measurement_status": "ok",
                    "central_area_m2": 750_000.0,
                    "conservative_area_m2": 650_000.0,
                    "upper_area_m2": 850_000.0,
                }
            )
    return output


def test_season_change_uses_period_medians() -> None:
    result = season_change(
        records(),
        "spring",
        set(range(1990, 1995)),
        set(range(2022, 2027)),
    )
    assert result["comparison_valid"] is True
    assert result["delta_m2"] == -250_000.0
    assert result["loss_m2"] == 250_000.0
    assert result["percent_change"] == -25.0
    assert result["delta_interval_m2"] == [-450_000.0, -50_000.0]


def test_combined_change_keeps_seasons_separate_before_combining() -> None:
    seasonal = [
        season_change(records(), season, set(range(1990, 1995)), set(range(2022, 2027)))
        for season in ("spring", "autumn")
    ]
    result = combined_change(seasonal)
    assert result["comparison_valid"] is True
    assert result["seasonal_direction_consistent"] is True
    assert result["median_delta_m2"] == -250_000.0
    assert result["loss_km2"] == 0.25


def test_low_quality_measurements_do_not_enter_period_median() -> None:
    sample = records()
    sample[0]["measurement_status"] = "low_valid_fraction"
    result = season_change(sample, "spring", set(range(1990, 1995)), set(range(2022, 2027)))
    assert result["baseline_count"] == 4
    assert result["comparison_valid"] is True
