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
    assert "Zbadaj dowolne miejsce na Ziemi" in workflow
    assert "Wpisz miejsce. Resztę zrobi AI." in workflow
    assert "Zbadaj teren" in workflow
    assert "Archiwum" in workflow
    assert "Zatwierdzone testy AI" in workflow
    assert "Zaawansowane" in workflow
    assert "Pełny katalog satelitarny USGS" in workflow
    assert "terra-research-manifest/v1" in workflow
    assert "wszystkie zarejestrowane testy" not in workflow
