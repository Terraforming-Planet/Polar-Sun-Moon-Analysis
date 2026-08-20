import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "published" / "l4-training-2026-08-19"


def test_run1_report_publishes_findings_without_environmental_overclaim() -> None:
    html = (REPORT_DIR / "index.html").read_text(encoding="utf-8")
    analysis = json.loads((REPORT_DIR / "analysis.json").read_text(encoding="utf-8"))

    assert "L4 Training #1 — Findings and Evidence" in html
    assert "FINDING-01" in html
    assert "FINDING-04" in html
    assert "10,670" in html
    assert "4.39×" in html
    assert "NO ENVIRONMENTAL GROUND-TRUTH CLAIM" in html
    assert "Do not compare Run #1 and #2 loss values as a model-quality ranking" in html

    assert analysis["scientific_status"]["environmental_findings_promoted"] is False
    assert analysis["scientific_status"]["ground_truth_claim"] is False
    assert analysis["scientific_status"]["causal_environmental_claim"] is False
    assert analysis["derived_metrics"]["source_images"] == 66
    assert analysis["derived_metrics"]["samples_seen"] == 704232
    assert len(analysis["findings"]) == 4
    assert {item["classification"] for item in analysis["findings"]} == {
        "DERIVED_VALUE",
        "MODEL_ESTIMATE",
        "UNKNOWN",
    }
