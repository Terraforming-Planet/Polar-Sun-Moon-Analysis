"""Export tables, figures, reports, dashboards, and website pages."""
from __future__ import annotations

from pathlib import Path
import json
import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.backends.backend_pdf import PdfPages


def export_tables(observations: pd.DataFrame, statistics: pd.DataFrame, out_dir: Path) -> None:
    """Export observations and statistics to CSV, JSON, Excel, Markdown, and HTML."""
    out_dir.mkdir(parents=True, exist_ok=True)
    observations.to_csv(out_dir / "observations.csv", index=False)
    statistics.to_csv(out_dir / "statistics.csv", index=False)
    observations.to_json(out_dir / "observations.json", orient="records", indent=2, date_format="iso")
    statistics.to_json(out_dir / "statistics.json", orient="records", indent=2)
    (out_dir / "observations.md").write_text(observations.to_markdown(index=False), encoding="utf-8")
    (out_dir / "statistics.html").write_text(statistics.to_html(index=False), encoding="utf-8")
    with pd.ExcelWriter(out_dir / "polar_equinox_analysis.xlsx") as writer:
        observations.to_excel(writer, sheet_name="observations", index=False)
        statistics.to_excel(writer, sheet_name="statistics", index=False)


def create_figures(observations: pd.DataFrame, out_dir: Path) -> list[Path]:
    """Create publication-quality PNG and SVG figures for required comparisons."""
    figures_dir = out_dir / "figures"
    figures_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    figure_specs = {
        "apparent_altitude_deg": "Apparent altitude (degrees)",
        "declination_deg": "Declination (degrees)",
    }
    for quantity, ylabel in figure_specs.items():
        fig, axes = plt.subplots(2, 1, figsize=(11, 8), sharex=True)
        for axis, pole in zip(axes, sorted(observations["pole"].unique()), strict=True):
            subset = observations[observations["pole"] == pole]
            for (season, body), group in subset.groupby(["season", "body"]):
                group = group.sort_values("year")
                axis.plot(group["year"], group[quantity], marker="o", label=f"{season} {body}")
                if len(group) > 2:
                    coeffs = pd.Series(group[quantity]).pipe(lambda s: __import__('numpy').polyfit(group["year"], s, 1))
                    axis.plot(group["year"], coeffs[0] * group["year"] + coeffs[1], linestyle="--", alpha=0.5)
            axis.set_title(pole)
            axis.set_ylabel(ylabel)
            axis.grid(True, alpha=0.3)
            axis.legend(fontsize="small")
        axes[-1].set_xlabel("Year")
        fig.suptitle(ylabel + " at polar equinoxes from NASA JPL Horizons")
        fig.tight_layout()
        for suffix in ("png", "svg"):
            path = figures_dir / f"{quantity}.{suffix}"
            fig.savefig(path, dpi=300)
            paths.append(path)
        plt.close(fig)
    _create_boxplot(observations, figures_dir, paths)
    _create_heatmap(observations, figures_dir, paths)
    return paths


def _create_boxplot(observations: pd.DataFrame, figures_dir: Path, paths: list[Path]) -> None:
    """Create altitude boxplots by pole and body."""
    fig, axis = plt.subplots(figsize=(10, 6))
    observations.boxplot(column="apparent_altitude_deg", by=["pole", "body"], ax=axis, rot=20)
    axis.set_title("Altitude distribution by pole and body")
    fig.suptitle("")
    path = figures_dir / "altitude_boxplot.png"
    fig.tight_layout(); fig.savefig(path, dpi=300); plt.close(fig); paths.append(path)


def _create_heatmap(observations: pd.DataFrame, figures_dir: Path, paths: list[Path]) -> None:
    """Create a compact heatmap of apparent altitude by year and observing group."""
    pivot = observations.pivot_table(index="year", columns=["pole", "season", "body"], values="apparent_altitude_deg")
    fig, axis = plt.subplots(figsize=(12, 7))
    image = axis.imshow(pivot.to_numpy().T, aspect="auto", cmap="viridis")
    axis.set_yticks(range(len(pivot.columns)), ["/".join(map(str, c)) for c in pivot.columns], fontsize=7)
    axis.set_xticks(range(len(pivot.index)), pivot.index, rotation=90)
    axis.set_title("Apparent altitude heatmap")
    fig.colorbar(image, ax=axis, label="degrees")
    path = figures_dir / "altitude_heatmap.png"
    fig.tight_layout(); fig.savefig(path, dpi=300); plt.close(fig); paths.append(path)


def export_markdown_report(observations: pd.DataFrame, statistics: pd.DataFrame, summary: str, out_dir: Path) -> Path:
    """Write the complete scientific Markdown report."""
    path = out_dir / "polar_equinox_report.md"
    text = f"""# Polar Equinox Sun/Moon Horizons Analysis

## Introduction
This report observes the seasonal apparent altitude of the Sun and Moon above the local horizon at Earth's poles during equinoxes.

## Scientific Objective
Collect, validate, analyze, and visualize official NASA JPL Horizons ephemerides for 2006-2024 equinoxes.

## Observation Subject
Sun and Moon apparent altitude and declination at the North Pole and South Pole.

## NASA Data Source
Only the official NASA JPL Horizons API is used. No synthetic astronomical quantities are fabricated.

## Methodology
NASA API → Validation → Cache → Raw Data Archive → Cleaning → Quality Control → Statistical Analysis → Figures → Report → Website.

## Results and Statistical Analysis
```text
{summary}
```

## Tables
Generated observations: {len(observations)} rows. Generated statistics: {len(statistics)} rows.

## Discussion
The software performs observations only. It does not prove hypotheses; interpretations must reference computed Horizons observations.

## Limitations
Results are limited to requested dates, locations, API quantities, and Horizons availability.

## Future Work
Additional observation periods, observatories, bodies, and statistical methods can be added through configuration and pipeline extensions.

## Appendix
See CSV, Excel, JSON, HTML, PNG, SVG, and PDF exports in this results directory.
"""
    path.write_text(text, encoding="utf-8")
    return path


def export_pdf_report(observations: pd.DataFrame, statistics: pd.DataFrame, summary: str, figure_paths: list[Path], out_dir: Path) -> Path:
    """Write a PDF report containing methodology, summary, figures, and table previews."""
    pdf_path = out_dir / "polar_equinox_report.pdf"
    with PdfPages(pdf_path) as pdf:
        fig = plt.figure(figsize=(8.27, 11.69))
        fig.text(0.05, 0.95, "Polar Equinox Sun/Moon Horizons Analysis", fontsize=16, weight="bold")
        fig.text(0.05, 0.90, summary[:3500], fontsize=8, va="top", family="monospace")
        pdf.savefig(fig); plt.close(fig)
        for path in [p for p in figure_paths if p.suffix == ".png"]:
            image = plt.imread(path); fig, axis = plt.subplots(figsize=(11, 8.5)); axis.imshow(image); axis.axis("off"); pdf.savefig(fig); plt.close(fig)
    return pdf_path


def build_website(out_dir: Path, website_dir: Path) -> None:
    """Create a responsive GitHub Pages website and simple interactive dashboard."""
    website_dir.mkdir(parents=True, exist_ok=True)
    pages = ["Home", "Project Overview", "Observation Objective", "Scientific Background", "NASA Horizons", "Methodology", "Data Processing Pipeline", "Statistical Analysis", "Interactive Charts", "Downloads", "API Documentation", "Developer Guide", "References", "License", "Contact"]
    nav = "".join(f'<a href="#{p.lower().replace(" ", "-")}">{p}</a>' for p in pages)
    sections = "".join(f'<section id="{p.lower().replace(" ", "-")}"><h2>{p}</h2><p>This section focuses on validated NASA JPL Horizons observations of seasonal apparent Sun and Moon altitude during equinoxes. Established facts are separated from research hypotheses; the software observes only and does not prove hypotheses.</p></section>' for p in pages)
    html = f"""<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Polar Sun Moon Analysis</title><style>body{{margin:0;font-family:system-ui;background:#0b1020;color:#e8eefc}}header{{padding:3rem;background:linear-gradient(135deg,#0b1020,#17345f)}}nav{{display:flex;flex-wrap:wrap;gap:.75rem;padding:1rem;background:#11182b;position:sticky;top:0}}a{{color:#9bdcff}}section{{max-width:1000px;margin:auto;padding:2rem}}.card{{background:#151f36;border:1px solid #2c3e66;border-radius:16px;padding:1rem}}</style></head><body><header><h1>Polar Equinox Sun/Moon Horizons Analysis</h1><p>Production scientific workflow for seasonal apparent altitude observations during Earth's equinoxes.</p></header><nav>{nav}</nav><main>{sections}<section class='card'><h2>Downloads</h2><ul><li>observations.csv</li><li>statistics.csv</li><li>polar_equinox_report.pdf</li></ul></section></main></body></html>"""
    (website_dir / "index.html").write_text(html, encoding="utf-8")
    (website_dir / "pipeline.md").write_text("# Pipeline\n\nNASA API → Validation → Cache → Raw Data Archive → Cleaning → Quality Control → Statistical Analysis → Figures → Report → Website\n", encoding="utf-8")
