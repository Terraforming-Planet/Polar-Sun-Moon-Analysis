"""Export tables, publication-quality Matplotlib figures, and PDF reports."""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.backends.backend_pdf import PdfPages


def export_tables(observations: pd.DataFrame, statistics: pd.DataFrame, out_dir: Path) -> None:
    """Export observations and statistics to CSV and Excel workbooks."""
    out_dir.mkdir(parents=True, exist_ok=True)
    observations.to_csv(out_dir / "observations.csv", index=False)
    statistics.to_csv(out_dir / "statistics.csv", index=False)
    with pd.ExcelWriter(out_dir / "polar_equinox_analysis.xlsx") as writer:
        observations.to_excel(writer, sheet_name="observations", index=False)
        statistics.to_excel(writer, sheet_name="statistics", index=False)


def create_figures(observations: pd.DataFrame, out_dir: Path) -> list[Path]:
    """Create publication-quality line figures for altitude and declination."""
    figures_dir = out_dir / "figures"
    figures_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for quantity, ylabel in {
        "apparent_altitude_deg": "Apparent altitude (degrees)",
        "declination_deg": "Declination (degrees)",
    }.items():
        fig, axes = plt.subplots(2, 1, figsize=(10, 8), sharex=True)
        for axis, pole in zip(axes, sorted(observations["pole"].unique()), strict=True):
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
        for title, frame in {"Observation preview": observations.head(20), "Statistics": statistics}.items():
            fig, axis = plt.subplots(figsize=(11, 8.5))
            axis.axis("off")
            axis.set_title(title)
            axis.table(cellText=frame.round(6).values, colLabels=frame.columns, loc="center")
            pdf.savefig(fig)
            plt.close(fig)
    return pdf_path
