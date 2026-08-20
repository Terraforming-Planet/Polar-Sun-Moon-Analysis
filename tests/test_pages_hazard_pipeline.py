from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_global_safety_monitor_is_data_only_and_owns_global_hazards() -> None:
    workflow = read(".github/workflows/global-safety-monitor.yml")

    assert "python scripts/build_global_safety_feed.py" in workflow
    assert "actions/deploy-pages" not in workflow
    assert "actions/upload-pages-artifact" not in workflow
    assert "docs/data/hazards.json" in workflow
    assert "group: hazard-data-publication" in workflow


def test_auxiliary_refresh_cannot_overwrite_canonical_hazards() -> None:
    workflow = read(".github/workflows/refresh-hazard-data.yml")

    assert "git restore --source=HEAD -- web/public/data/hazards.json" in workflow
    assert "docs/data/earthquakes.geojson" in workflow
    assert "docs/data/eonet-events.json" in workflow
    assert "group: hazard-data-publication" in workflow

    committed_section = workflow.split("Commit changed auxiliary data to main", maxsplit=1)[1]
    assert "git add" in committed_section
    assert "web/public/data/hazards.json" not in committed_section


def test_pages_build_ignores_nrt_data_only_changes_and_checks_new_workspace() -> None:
    workflow = read(".github/workflows/force-pages-deploy.yml")

    assert "!web/public/data/**" in workflow
    assert "Research any place on Earth" in workflow
    assert "Search any area and investigate it immediately" in workflow
    assert "Research area" in workflow
    assert "Research archive" in workflow
    assert "Approved AI tests" in workflow
    assert "Advanced terrain research" in workflow
    assert "High-resolution reference basemap" in workflow
    assert "Private question sent" in workflow
    assert "Assistant answer archived on this device" in workflow
    assert "terra-research-manifest/v1" in workflow
    assert "Research account · Sign in with ChatGPT" in workflow
    assert "Continue with ChatGPT — not configured" in workflow
    assert "Zbadaj dowolne miejsce na Ziemi" not in workflow
    assert "Wpisz miejsce. Resztę zrobi AI." not in workflow
