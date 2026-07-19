"""Export tables, publication-quality Matplotlib figures, and PDF reports."""

from __future__ import annotations

from datetime import datetime
from html import escape
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.backends.backend_pdf import PdfPages


def _serialize_value(value: Any) -> Any:
    """Convert values that external formats cannot represent safely."""
    if isinstance(value, datetime) and value.tzinfo is not None:
        return value.isoformat()
    return value


def _portable_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Return a copy with timezone-aware datetimes serialized for portable exports."""
    safe = frame.copy()
    for column in safe.columns:
        if isinstance(safe[column].dtype, pd.DatetimeTZDtype):
            safe[column] = safe[column].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        elif safe[column].dtype == "object":
            safe[column] = safe[column].map(_serialize_value)
    return safe


def _markdown_table(frame: pd.DataFrame) -> str:
    """Render a compact Markdown table without optional pandas dependencies."""
    headers = [str(column) for column in frame.columns.tolist()]
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
    for row in frame.astype(str).values.tolist():
        lines.append("| " + " | ".join(str(value) for value in row) + " |")
    return "\n".join(lines)


def export_tables(observations: pd.DataFrame, statistics: pd.DataFrame, out_dir: Path) -> None:
    """Export observations and statistics to CSV, JSON, Markdown, HTML, and Excel."""
    out_dir.mkdir(parents=True, exist_ok=True)
    portable_observations = _portable_frame(observations)
    portable_statistics = _portable_frame(statistics)

    portable_observations.to_csv(out_dir / "observations.csv", index=False)
    portable_statistics.to_csv(out_dir / "statistics.csv", index=False)
    portable_observations.to_json(out_dir / "observations.json", orient="records", indent=2)
    portable_statistics.to_json(out_dir / "statistics.json", orient="records", indent=2)
    (out_dir / "observations.md").write_text(
        _markdown_table(portable_observations), encoding="utf-8"
    )
    (out_dir / "statistics.md").write_text(_markdown_table(portable_statistics), encoding="utf-8")
    portable_observations.to_html(out_dir / "observations.html", index=False)
    portable_statistics.to_html(out_dir / "statistics.html", index=False)
    with pd.ExcelWriter(out_dir / "polar_equinox_analysis.xlsx") as writer:
        portable_observations.to_excel(writer, sheet_name="observations", index=False)
        portable_statistics.to_excel(writer, sheet_name="statistics", index=False)


def create_figures(observations: pd.DataFrame, out_dir: Path) -> list[Path]:
    """Create publication-quality line figures for altitude and declination."""
    if observations.empty:
        raise ValueError("Cannot create figures from an empty observations table.")
    figures_dir = out_dir / "figures"
    figures_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for quantity, ylabel in {
        "apparent_altitude_deg": "Apparent altitude (degrees)",
        "declination_deg": "Declination (degrees)",
    }.items():
        fig, axes = plt.subplots(2, 1, figsize=(10, 8), sharex=True)
        poles = [str(pole) for pole in sorted(observations["pole"].dropna().unique().tolist())]
        if len(poles) != len(axes):
            raise ValueError(f"Expected exactly {len(axes)} poles for plotting, got {poles}")
        for axis, pole in zip(axes, poles, strict=True):
            subset = observations[observations["pole"] == pole]
            for (season, body), group in subset.groupby(["season", "body"]):
                axis.plot(group["year"], group[quantity], marker="o", label=f"{season} {body}")
            axis.set_title(pole)
            axis.set_ylabel(ylabel)
            axis.grid(True, alpha=0.3)
            axis.legend(fontsize="small")
        axes[-1].set_xlabel("Year")
        fig.suptitle(ylabel + " at polar equinoxes from NASA JPL Horizons")
        fig.tight_layout()
        path = figures_dir / f"{quantity}.png"
        fig.savefig(path, dpi=300)
        plt.close(fig)
        paths.append(path)
    return paths


def _pdf_safe_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Return a display-safe frame for PDF table previews."""
    safe = _portable_frame(frame)
    numeric_columns = safe.select_dtypes(include="number").columns
    safe[numeric_columns] = safe[numeric_columns].round(6)
    return safe


def export_summary_documents(summary: str, out_dir: Path) -> dict[str, Path]:
    """Export the scientific summary as text, Markdown, and HTML."""
    out_dir.mkdir(parents=True, exist_ok=True)
    text_path = out_dir / "scientific_summary.txt"
    markdown_path = out_dir / "scientific_summary.md"
    html_path = out_dir / "scientific_summary.html"
    text_path.write_text(summary, encoding="utf-8")
    markdown_path.write_text(f"# Scientific Summary\n\n```text\n{summary}\n```\n", encoding="utf-8")
    html_path.write_text(
        "<!doctype html>\n"
        "<html lang='en'><head><meta charset='utf-8'><title>Scientific Summary</title></head>"
        f"<body><h1>Scientific Summary</h1><pre>{escape(summary)}</pre></body></html>\n",
        encoding="utf-8",
    )
    return {"text": text_path, "markdown": markdown_path, "html": html_path}


def export_pdf_report(
    observations: pd.DataFrame,
    statistics: pd.DataFrame,
    summary: str,
    figure_paths: list[Path],
    out_dir: Path,
) -> Path:
    """Write a PDF report containing summary text, figures, and table previews."""
    pdf_path = out_dir / "polar_equinox_report.pdf"
    with PdfPages(pdf_path) as pdf:
        fig = plt.figure(figsize=(8.27, 11.69))
        fig.text(0.05, 0.95, "Polar Equinox Sun/Moon Horizons Analysis", fontsize=16, weight="bold")
        fig.text(0.05, 0.90, summary[:3500], fontsize=8, va="top", family="monospace")
        pdf.savefig(fig)
        plt.close(fig)
        for path in figure_paths:
            image = plt.imread(path)
            fig, axis = plt.subplots(figsize=(11, 8.5))
            axis.imshow(image)
            axis.axis("off")
            pdf.savefig(fig)
            plt.close(fig)
        for title, frame in {
            "Observation preview": observations.head(20),
            "Statistics": statistics,
        }.items():
            fig, axis = plt.subplots(figsize=(11, 8.5))
            axis.axis("off")
            axis.set_title(title)
            safe_frame = _pdf_safe_frame(frame)
            axis.table(
                cellText=safe_frame.astype(str).values.tolist(),
                colLabels=frame.columns.tolist(),
                loc="center",
            )
            pdf.savefig(fig)
            plt.close(fig)
    return pdf_path
