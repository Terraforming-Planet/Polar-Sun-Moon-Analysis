from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "web" / "public"


def test_frontend_public_data_contract() -> None:
    required_files = [
        PUBLIC / "data" / "solar-system.json",
        PUBLIC / "data" / "hazards.json",
        PUBLIC / "data" / "sources.json",
        PUBLIC / "data" / "observations.json",
        PUBLIC / "data" / "copernicus" / "latest.json",
        PUBLIC / "data" / "hydrology" / "glofas-catalog.json",
        PUBLIC / "flood-map" / "assets" / "map-data.json",
        PUBLIC / "flood-map" / "index.html",
        PUBLIC / "copernicus" / "index.html",
        PUBLIC / "research" / "index.html",
        PUBLIC / "research" / "research-model.js",
    ]

    missing = [
        str(path.relative_to(ROOT))
        for path in required_files
        if not path.is_file()
    ]
    assert not missing, f"Missing public files required by the web application: {missing}"


def test_main_tabs_reference_existing_public_paths() -> None:
    main = (ROOT / "web" / "src" / "main.tsx").read_text(encoding="utf-8")

    for tab_label in [
        "Centrum sterowania",
        "Ziemia 3D",
        "Powodzie",
        "Pożary",
        "Woda i susza",
        "Biegun północny",
        "Biegun południowy",
        "Słońce i Księżyc",
        "Dane i źródła",
    ]:
        assert tab_label in main

    for public_path in [
        "data/solar-system.json",
        "data/hazards.json",
        "data/sources.json",
        "data/observations.json",
        "data/copernicus/latest.json",
        "flood-map/assets/map-data.json",
        "flood-map/",
        "copernicus/",
    ]:
        assert public_path in main


def test_research_grid_is_exactly_8_by_8_by_8_with_cube_spacing() -> None:
    model = (PUBLIC / "research" / "research-model.js").read_text(encoding="utf-8")
    research_html = (PUBLIC / "research" / "index.html").read_text(encoding="utf-8")

    assert "for (let z = 0; z < 8; z += 1)" in model
    assert "for (let y = 0; y < 8; y += 1)" in model
    assert "for (let x = 0; x < 8; x += 1)" in model
    assert "if (cells.length !== 512)" in model
    assert "(z - 3.5) * 72" in model
    assert "index = Z×64 + Y×8 + X" in research_html
