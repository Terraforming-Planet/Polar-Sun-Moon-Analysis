#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
from pathlib import Path
from typing import Any

SEASONS = ("spring", "autumn")


def median(values: list[float]) -> float | None:
    return float(statistics.median(values)) if values else None


def period_values(
    records: list[dict[str, Any]], season: str, years: set[int], key: str
) -> list[float]:
    values: list[float] = []
    for record in records:
        if record.get("measurement_status") != "ok" or record.get("season") != season:
            continue
        if int(record["year"]) not in years:
            continue
        value = record.get(key)
        if value is not None and math.isfinite(float(value)):
            values.append(float(value))
    return values


def season_change(
    records: list[dict[str, Any]],
    season: str,
    baseline_years: set[int],
    recent_years: set[int],
) -> dict[str, Any]:
    base = median(period_values(records, season, baseline_years, "central_area_m2"))
    recent = median(period_values(records, season, recent_years, "central_area_m2"))
    base_low = median(period_values(records, season, baseline_years, "conservative_area_m2"))
    base_high = median(period_values(records, season, baseline_years, "upper_area_m2"))
    recent_low = median(period_values(records, season, recent_years, "conservative_area_m2"))
    recent_high = median(period_values(records, season, recent_years, "upper_area_m2"))
    base_count = len(period_values(records, season, baseline_years, "central_area_m2"))
    recent_count = len(period_values(records, season, recent_years, "central_area_m2"))
    result: dict[str, Any] = {
        "season": season,
        "baseline_count": base_count,
        "recent_count": recent_count,
        "baseline_median_m2": base,
        "recent_median_m2": recent,
        "comparison_valid": base is not None and recent is not None and base_count >= 3 and recent_count >= 3,
    }
    if not result["comparison_valid"]:
        return result
    assert base is not None and recent is not None
    delta = recent - base
    result.update(
        {
            "delta_m2": delta,
            "delta_km2": delta / 1_000_000.0,
            "percent_change": (delta / base * 100.0) if base > 0 else None,
            "loss_m2": max(0.0, -delta),
            "loss_km2": max(0.0, -delta) / 1_000_000.0,
        }
    )
    if None not in (base_low, base_high, recent_low, recent_high):
        assert base_low is not None
        assert base_high is not None
        assert recent_low is not None
        assert recent_high is not None
        result["delta_interval_m2"] = [recent_low - base_high, recent_high - base_low]
    return result


def combined_change(seasonal: list[dict[str, Any]]) -> dict[str, Any]:
    valid = [row for row in seasonal if row.get("comparison_valid")]
    if not valid:
        return {"comparison_valid": False}
    deltas = [float(row["delta_m2"]) for row in valid]
    pct = [float(row["percent_change"]) for row in valid if row.get("percent_change") is not None]
    delta = float(statistics.median(deltas))
    signs = {0 if value == 0 else (1 if value > 0 else -1) for value in deltas}
    return {
        "comparison_valid": True,
        "seasons_used": [row["season"] for row in valid],
        "seasonal_direction_consistent": len(signs) <= 1,
        "median_delta_m2": delta,
        "median_delta_km2": delta / 1_000_000.0,
        "median_percent_change": float(statistics.median(pct)) if pct else None,
        "loss_m2": max(0.0, -delta),
        "loss_km2": max(0.0, -delta) / 1_000_000.0,
    }


def load_test(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_summary(root: Path, config_path: Path) -> dict[str, Any]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    baseline = {int(year) for year in config["baseline_years"]}
    recent = {int(year) for year in config["recent_years"]}
    tests: list[dict[str, Any]] = []
    for target in config["targets"]:
        test = int(target["test"])
        path = root / f"test_{test:03d}" / "measurements.json"
        if not path.exists():
            tests.append({"test": test, "target": target, "status": "missing_measurements"})
            continue
        payload = load_test(path)
        records = payload["records"]
        seasonal = [season_change(records, season, baseline, recent) for season in SEASONS]
        tests.append(
            {
                "test": test,
                "target": target,
                "status": "ok",
                "usable_measurements": sum(
                    row.get("measurement_status") == "ok" for row in records
                ),
                "measurement_errors": sum(
                    row.get("measurement_status") == "error" for row in records
                ),
                "seasonal": seasonal,
                "combined": combined_change(seasonal),
            }
        )

    rankings: dict[str, list[dict[str, Any]]] = {}
    groups = sorted({str(target["group"]) for target in config["targets"]})
    for group in groups:
        eligible = [
            row
            for row in tests
            if row.get("status") == "ok"
            and row["target"]["group"] == group
            and row.get("combined", {}).get("comparison_valid")
        ]
        eligible.sort(key=lambda row: float(row["combined"]["loss_m2"]), reverse=True)
        rankings[group] = [
            {
                "rank": index + 1,
                "test": row["test"],
                "name": row["target"]["name"],
                "loss_km2": row["combined"]["loss_km2"],
                "median_percent_change": row["combined"]["median_percent_change"],
                "seasonal_direction_consistent": row["combined"][
                    "seasonal_direction_consistent"
                ],
            }
            for index, row in enumerate(eligible)
        ]
    return {
        "schema_version": 1,
        "method": config["method"],
        "scope_note": config["notes"],
        "baseline_years": sorted(baseline),
        "recent_years": sorted(recent),
        "tests": tests,
        "rankings_by_hydrological_group": rankings,
        "important_limitations": [
            "Ranking is by change in open-water area inside each fixed AOI, not by a legal shoreline polygon.",
            "Tidal estuary, river and regional wetland AOIs are not directly comparable with local inland lakes.",
            "MNDWI threshold sensitivity is reported, but sensor, atmosphere and shoreline-mixing uncertainty remains.",
            "Only spring-to-spring and autumn-to-autumn comparisons are combined.",
        ],
    }


def render_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Global Water Area Change Report",
        "",
        "Quantitative MNDWI surface-water analysis from Level-2 reflectance with QA/SCL masking.",
        "",
        f"Baseline: {summary['baseline_years']}; recent: {summary['recent_years']}.",
        "",
    ]
    for group, rows in summary["rankings_by_hydrological_group"].items():
        lines.extend([f"## {group}", "", "| Rank | Test | Target | Loss km² | Median % | Seasonal direction |", "|---:|---:|---|---:|---:|---|"])
        if not rows:
            lines.append("| – | – | No valid comparison | – | – | – |")
        for row in rows:
            pct = row["median_percent_change"]
            pct_text = "–" if pct is None else f"{pct:.2f}%"
            direction = "consistent" if row["seasonal_direction_consistent"] else "mixed"
            lines.append(
                f"| {row['rank']} | {row['test']:03d} | {row['name']} | "
                f"{row['loss_km2']:.4f} | {pct_text} | {direction} |"
            )
        lines.append("")
    lines.extend(["## Limitations", ""])
    lines.extend(f"- {item}" for item in summary["important_limitations"])
    lines.append("")
    return "\n".join(lines)


def write_csv(summary: dict[str, Any], output: Path) -> None:
    rows: list[dict[str, Any]] = []
    for test in summary["tests"]:
        if test.get("status") != "ok":
            continue
        for season in test["seasonal"]:
            rows.append(
                {
                    "test": test["test"],
                    "name": test["target"]["name"],
                    "group": test["target"]["group"],
                    **season,
                }
            )
    fieldnames = sorted({key for row in rows for key in row}) if rows else ["test"]
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Aggregate water-area measurements")
    parser.add_argument("--root", type=Path, default=Path("water_measurements"))
    parser.add_argument(
        "--config", type=Path, default=Path("config/water_measurement_targets.json")
    )
    parser.add_argument("--out", type=Path, default=Path("water_measurements/global"))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    summary = build_summary(args.root, args.config)
    (args.out / "GLOBAL_WATER_AREA_CHANGE_REPORT.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (args.out / "GLOBAL_WATER_AREA_CHANGE_REPORT.md").write_text(
        render_markdown(summary), encoding="utf-8"
    )
    write_csv(summary, args.out / "seasonal_changes.csv")
    print(json.dumps(summary["rankings_by_hydrological_group"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
