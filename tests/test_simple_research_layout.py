from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AI_PANEL = ROOT / "web" / "src" / "AIResearchPanel.tsx"
QUICK_ACCESS = ROOT / "web" / "src" / "SimpleContestQuickAccess.tsx"
SIMPLE_ASSISTANT = ROOT / "web" / "src" / "SimpleResearchAssistant.tsx"
FLOW_CSS = ROOT / "web" / "src" / "contest-research-flow.css"
RIVER_MAP = ROOT / "web" / "public" / "river-helper-map" / "index.html"
WEB_INDEX = ROOT / "web" / "index.html"


def test_simple_view_exposes_all_tests_tools_and_three_training_links() -> None:
    source = QUICK_ACCESS.read_text(encoding="utf-8")

    assert "Tests 1–16" in source
    assert "PUBLIC_RESEARCH_TESTS.map" in source
    assert "Results Dashboard" in source
    assert "Sentinel-1 Map" in source
    assert "Analysis Report" in source
    assert "Observation Timeline" in source
    assert "JSON Data" in source
    assert "TP-26 Constellation" in source
    assert "Multi-angle Observation" in source
    assert "Investigation Support" in source
    assert "Forum" in source
    assert "L4 Training #1" in source
    assert "L4 Training #2 · Site Corpus" in source
    assert "L4 Training #3 · Streaming NASA GIBS" in source
    assert "contest-research-flow.css" in source


def test_simple_view_restores_four_specialist_station_links_without_legacy_shell() -> None:
    quick_access = QUICK_ACCESS.read_text(encoding="utf-8")
    panel = AI_PANEL.read_text(encoding="utf-8")

    for path in ("arctic-90n/", "sahara-station/", "ocean-station/", "earth-space-512/"):
        assert path in quick_access
    assert "<SimpleContestQuickAccess />" in panel
    assert panel.index("<SimpleContestQuickAccess />") < panel.index("<SimpleResearchAssistant")


def test_contest_view_keeps_simple_and_restores_old_advanced_laboratory() -> None:
    panel = AI_PANEL.read_text(encoding="utf-8")
    assistant = SIMPLE_ASSISTANT.read_text(encoding="utf-8")

    assert 'modePolicy="simple"' not in panel
    assert "SIMPLE + ADVANCED" in panel
    assert "Otwórz pełny stary widok zaawansowany" in assistant
    assert "ResearchTerrainLab" in assistant
    assert "flag" in assistant.lower()
    assert "DEM" in assistant
    assert "profile" in assistant.lower()
    assert "advancedControls" in assistant


def test_simple_flow_places_answer_directly_under_question_and_summary_before_imagery() -> None:
    source = SIMPLE_ASSISTANT.read_text(encoding="utf-8")
    css = FLOW_CSS.read_text(encoding="utf-8")

    private_question = 'className="simple-question panel"'
    inline_answer = 'ODPOWIEDŹ ASYSTENTA'
    gallery = 'className="simple-context-gallery panel"'
    summary = 'className="simple-basic-result panel"'

    assert source.index(private_question) < source.index(inline_answer) < source.index(gallery)
    assert "TWOJE PYTANIE" in source
    assert ".simple-research>.simple-question{order:20}" in css
    assert ".simple-research>.simple-basic-result{order:21}" in css
    assert ".simple-research>.simple-context-gallery{order:30}" in css
    assert summary in source
    assert "saveAssistantAnswerLocally" in source


def test_simple_flow_defaults_to_four_clear_images_and_exposes_cloudy_opt_in() -> None:
    source = SIMPLE_ASSISTANT.read_text(encoding="utf-8")

    assert "Czyste do badania rzek" in source
    assert "Pochmurne / wszystkie" in source
    assert "imageMode" in source
    assert "maxCloudCover: selectedImageMode === 'clear' ? 10 : 100" in source
    assert "previewLimit: 4" in source
    assert "analysis?.preview_images.slice(0, 4)" in source
    assert "Nie podstawiamy pochmurnego obrazu jako „czystego”" in source
    assert "Pełny katalog Landsat 1972–dziś" in source


def test_simple_flow_exposes_radius_slider_and_manual_radius_up_to_100_km() -> None:
    source = SIMPLE_ASSISTANT.read_text(encoding="utf-8")

    assert 'type="range"' in source
    assert 'max="100"' in source
    assert 'type="number"' in source
    assert "Promień badanego obszaru" in source
    assert "Zastosuj {radiusKm} km" in source
    assert "radiusKm: selectedRadius" in source
    assert "Zakres prostego widoku: 1–100 km" in source


def test_simple_flow_exposes_1990_today_year_and_season_controls_with_auto_refresh() -> None:
    source = SIMPLE_ASSISTANT.read_text(encoding="utf-8")

    assert "1990–dziś" in source
    assert "selectedYear" in source
    assert "wiosna" in source
    assert "lato" in source
    assert "jesień" in source
    assert "zima" in source
    assert "USGS Landsat" in source
    assert "applySelectedYear" in source
    assert "applySelectedSeason" in source
    assert "runAnalysis(place, 'quick', periodForPreset('year'" in source


def test_simple_context_uses_dedicated_river_helper_map() -> None:
    source = SIMPLE_ASSISTANT.read_text(encoding="utf-8")

    assert "river-helper-map/index.html" in source
    assert "MAPA POMOCNICZA · PAŃSTWA + RZEKI" in source
    assert "admin-1" in source


def test_river_helper_map_has_country_and_river_layers_without_admin1() -> None:
    html = RIVER_MAP.read_text(encoding="utf-8")

    assert "light_nolabels" in html
    assert "ne_50m_admin_0_countries.geojson" in html
    assert "ne_50m_rivers_lake_centerlines.geojson" in html
    assert "ne_50m_lakes.geojson" in html
    assert "admin_1" not in html.lower()
    assert "Province and district borders are intentionally hidden" in html


def test_vite_entry_has_no_legacy_test_or_station_navigation_before_react() -> None:
    html = WEB_INDEX.read_text(encoding="utf-8")

    assert '<div id="root"></div>' in html
    assert "result-nav" not in html
    assert "station-strip" not in html
    assert "TEST 001" not in html
    assert "ARCTIC 90°N RESEARCH STATION" not in html
