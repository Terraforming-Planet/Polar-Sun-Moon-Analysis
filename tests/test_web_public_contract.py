from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "web" / "public"


def test_frontend_public_data_contract() -> None:
    assert (PUBLIC / "data" / "solar-system.json").is_file()
    assert (PUBLIC / "data" / "hazards.json").is_file()
    assert (PUBLIC / "data" / "sources.json").is_file()
    assert (PUBLIC / "data" / "observations.json").is_file()
    assert (PUBLIC / "data" / "copernicus" / "latest.json").is_file()
    assert (PUBLIC / "data" / "hydrology" / "glofas-catalog.json").is_file()
    assert (PUBLIC / "flood-map" / "assets" / "map-data.json").is_file()
    assert (PUBLIC / "flood-map" / "index.html").is_file()
    assert (PUBLIC / "copernicus" / "index.html").is_file()
    assert (PUBLIC / "research" / "index.html").is_file()
    assert (PUBLIC / "research" / "research-model.js").is_file()


def test_main_tabs_reference_existing_public_paths() -> None:
    main = (ROOT / "web" / "src" / "main.tsx").read_text(encoding="utf-8")

    assert "Centrum sterowania" in main
    assert "Ziemia 3D" in main
    assert "Powodzie" in main
    assert "Pożary" in main
    assert "Woda i susza" in main
    assert "Biegun północny" in main
    assert "Biegun południowy" in main
    assert "Słońce i Księżyc" in main
    assert "Dane i źródła" in main

    assert "data/solar-system.json" in main
    assert "data/hazards.json" in main
    assert "data/sources.json" in main
    assert "data/observations.json" in main
    assert "data/copernicus/latest.json" in main
    assert "flood-map/assets/map-data.json" in main
    assert "flood-map/" in main
    assert "copernicus/" in main


def test_research_grid_is_exactly_8_by_8_by_8_with_cube_spacing() -> None:
    model = (PUBLIC / "research" / "research-model.js").read_text(encoding="utf-8")
    research_html = (PUBLIC / "research" / "index.html").read_text(encoding="utf-8")

    assert "for (let z = 0; z < 8; z += 1)" in model
    assert "for (let y = 0; y < 8; y += 1)" in model
    assert "for (let x = 0; x < 8; x += 1)" in model
    assert "if (cells.length !== 512)" in model
    assert "(z - 3.5) * 72" in model
    assert "index = Z×64 + Y×8 + X" in research_html
