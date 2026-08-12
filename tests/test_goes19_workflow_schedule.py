from pathlib import Path


WORKFLOW = (
    Path(__file__).resolve().parents[1]
    / ".github"
    / "workflows"
    / "capture-goes19-eclipse-2026.yml"
)


def test_goes19_capture_uses_independent_ten_minute_runs() -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "*/10 14-20 12 8 *" in workflow
    assert "timeout-minutes: 15" in workflow
    assert "sleep 600" not in workflow
    assert "seq 1 36" not in workflow
    assert "python scripts/capture_goes19_eclipse.py" in workflow


def test_goes19_capture_keeps_provenance_guards() -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "satellite_photography'] is True" in workflow
    assert "synthetic'] is False" in workflow
    assert "cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/" in workflow
    assert "2026-08-12" in workflow
