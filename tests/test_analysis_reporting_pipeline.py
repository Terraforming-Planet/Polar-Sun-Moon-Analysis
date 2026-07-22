from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
from _pytest.monkeypatch import MonkeyPatch

from polar_equinox_analysis.analysis import scientific_summary, summarize_statistics
from polar_equinox_analysis.models import EquinoxEvent
from polar_equinox_analysis.pipeline import PolarEquinoxPipeline
from polar_equinox_analysis.reporting import create_figures, export_summary_documents, export_tables


def sample_observations() -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for year in range(2020, 2023):
        for season in ("vernal", "autumnal"):
            for pole in ("North Pole", "South Pole"):
                for body in ("Sun", "Moon"):
                    rows.append(
                        {
                            "year": year,
                            "season": season,
                            "pole": pole,
                            "body": body,
                            "timestamp_utc": datetime(year, 3, 20, tzinfo=UTC),
                            "apparent_altitude_deg": float(year - 2020),
                            "declination_deg": float(year - 2021),
                        }
                    )
    return pd.DataFrame(rows)


def test_statistics_and_summary_are_generated() -> None:
    stats = summarize_statistics(sample_observations())
    summary = scientific_summary(stats)

    assert not stats.empty
    assert "linear_trend_slope_per_year" in stats.columns
    assert "NASA JPL Horizons" in summary


def test_table_and_figure_exports(tmp_path: Path) -> None:
    observations = sample_observations()
    stats = summarize_statistics(observations)

    export_tables(observations, stats, tmp_path)
    figures = create_figures(observations, tmp_path)

    assert (tmp_path / "observations.csv").exists()
    assert (tmp_path / "statistics.csv").exists()
    assert (tmp_path / "polar_equinox_analysis.xlsx").exists()
    assert (tmp_path / "observations.json").exists()
    assert (tmp_path / "statistics.json").exists()
    assert (tmp_path / "observations.md").exists()
    assert (tmp_path / "statistics.md").exists()
    assert (tmp_path / "observations.html").exists()
    assert (tmp_path / "statistics.html").exists()
    summary_paths = export_summary_documents("summary", tmp_path)
    assert all(path.exists() for path in summary_paths.values())
    assert len(figures) == 2
    assert all(path.exists() for path in figures)


def test_pipeline_with_mocked_horizons(tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
    pipeline = PolarEquinoxPipeline(output_dir=tmp_path / "out", cache_dir=tmp_path / "cache")
    event_time = datetime(2024, 3, 20, 3, 6, tzinfo=UTC)
    monkeypatch.setattr(
        pipeline.finder,
        "events",
        lambda start_year, end_year, include_future: [
            EquinoxEvent(year=2024, season="vernal", timestamp_utc=event_time)
        ],
    )
    monkeypatch.setattr(
        pipeline.client,
        "observer_ephemerides",
        lambda body, observer, timestamps: [
            {
                "declination_deg": 0.0 if body == "Sun" else 1.0,
                "apparent_altitude_deg": 10.0 if observer.name == "North Pole" else -10.0,
            }
            for _ in timestamps
        ],
    )

    outputs = pipeline.run(start_year=2024, end_year=2024)

    assert outputs["pdf_report"].exists()
    assert (tmp_path / "out" / "scientific_summary.txt").exists()
    assert (tmp_path / "out" / "scientific_summary.md").exists()
    assert (tmp_path / "out" / "scientific_summary.html").exists()
