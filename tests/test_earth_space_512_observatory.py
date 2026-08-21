import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs" / "earth-space-512"
PUBLIC = ROOT / "web" / "public" / "earth-space-512"
SOLAR_DATA = ROOT / "docs" / "data" / "solar-system.json"
AU_KM = 149_597_870.7


def test_earth_space_512_observatory_is_mirrored() -> None:
    for filename in (
        "index.html",
        "earth-space-512.css",
        "earth-space-512.js",
        "comet-ai-client.js",
    ):
        docs_source = (DOCS / filename).read_text(encoding="utf-8")
        public_source = (PUBLIC / filename).read_text(encoding="utf-8")
        assert docs_source == public_source


def test_observatory_uses_official_space_sources_and_mobile_safe_modules() -> None:
    html = (DOCS / "index.html").read_text(encoding="utf-8")
    javascript = (DOCS / "earth-space-512.js").read_text(encoding="utf-8")
    comet_client = (DOCS / "comet-ai-client.js").read_text(encoding="utf-8")

    assert "SOHO / LASCO C2" in html
    assert "SOHO / LASCO C3" in html
    assert "https://soho.nascom.nasa.gov/data/realtime/c2/1024/latest.jpg" in html
    assert "https://soho.nascom.nasa.gov/data/realtime/c3/1024/latest.jpg" in html
    assert "https://ssd.jpl.nasa.gov/horizons/" in html
    assert "../data/solar-system.json" in javascript
    assert "https://esm.sh/three@0.180.0" in javascript
    assert "deps=three@0.180.0" in javascript
    assert "cdn.jsdelivr.net/npm/three" not in javascript
    assert "/space/comet-candidates" in comet_client
    assert "No verified candidate asserted" in comet_client
    assert "confirmed discovery" in html


def test_512_grid_is_exact_and_is_the_final_research_section() -> None:
    html = (DOCS / "index.html").read_text(encoding="utf-8")
    javascript = (DOCS / "earth-space-512.js").read_text(encoding="utf-8")
    comet_section = html.index("Experimental Sun + AI comet observation lab")
    planet_section = html.index("Experimental Moon and planet observations")
    grid_section = html.index("8 × 8 × 8 = 512 addressable cells")

    assert comet_section < planet_section < grid_section
    assert "const index = z * 64 + y * 8 + x" in javascript
    assert "cells.length !== 512" in javascript
    assert "CELL-${String(index + 1).padStart(3, '0')}" in javascript


def test_moon_distance_experiment_is_derived_from_jpl_vectors() -> None:
    data = json.loads(SOLAR_DATA.read_text(encoding="utf-8"))
    bodies = {item["body"]: item for item in data["bodies"]}
    earth = bodies["Earth"]["position_au"]
    moon = bodies["Moon"]["position_au"]
    distance_au = math.dist(earth, moon)
    distance_km = distance_au * AU_KM

    jpl_api = "https://ssd.jpl.nasa.gov/api/horizons.api"
    assert bodies["Earth"]["source"] == jpl_api
    assert bodies["Moon"]["source"] == jpl_api
    assert 350_000 < distance_km < 420_000
