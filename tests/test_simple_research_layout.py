from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AI_PANEL = ROOT / "web" / "src" / "AIResearchPanel.tsx"
SIMPLE_ASSISTANT = ROOT / "web" / "src" / "SimpleResearchAssistant.tsx"
RIVER_MAP = ROOT / "web" / "public" / "river-helper-map" / "index.html"


def test_simple_view_exposes_one_test_set_and_three_training_tabs() -> None:
    source = AI_PANEL.read_text(encoding="utf-8")

    assert "Tests 1–16" in source
    assert "Training 1" in source
    assert "Training 2" in source
    assert "Training 3" in source
    assert "PUBLIC_RESEARCH_TESTS.map" in source


def test_simple_view_keeps_four_specialist_stations_at_bottom() -> None:
    source = AI_PANEL.read_text(encoding="utf-8")

    for path in ("arctic-90n/", "sahara-station/", "ocean-station/", "earth-space-512/"):
        assert path in source
    assert source.index("<SimpleResearchAssistant") < source.index("<SimpleStationLinks />")


def test_simple_assistant_is_before_globe_but_advanced_order_is_preserved() -> None:
    source = SIMPLE_ASSISTANT.read_text(encoding="utf-8")

    simple_chat = "effectiveMode === 'simple' && <ResearchChatNotebook"
    globe = "<RealisticEarthGlobe"
    advanced_chat = "effectiveMode === 'advanced' && <ResearchChatNotebook"
    assert source.index(simple_chat) < source.index(globe) < source.index(advanced_chat)
    assert "gridTemplateColumns: '1fr'" in source


def test_advanced_context_uses_dedicated_river_helper_map() -> None:
    source = SIMPLE_ASSISTANT.read_text(encoding="utf-8")

    assert "river-helper-map/index.html" in source
    assert "RIVER HELPER MAP · COUNTRIES + HYDROGRAPHY" in source
    assert "Province/admin-1 borders" in source


def test_river_helper_map_has_country_and_river_layers_without_admin1() -> None:
    html = RIVER_MAP.read_text(encoding="utf-8")

    assert "light_nolabels" in html
    assert "ne_50m_admin_0_countries.geojson" in html
    assert "ne_50m_rivers_lake_centerlines.geojson" in html
    assert "ne_50m_lakes.geojson" in html
    assert "admin_1" not in html.lower()
    assert "Province and district borders are intentionally hidden" in html
