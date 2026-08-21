from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AI_PANEL = ROOT / "web" / "src" / "AIResearchPanel.tsx"
QUICK_ACCESS = ROOT / "web" / "src" / "SimpleContestQuickAccess.tsx"
SIMPLE_ASSISTANT = ROOT / "web" / "src" / "SimpleResearchAssistant.tsx"
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


def test_simple_view_restores_four_specialist_station_links_without_legacy_shell() -> None:
    quick_access = QUICK_ACCESS.read_text(encoding="utf-8")
    panel = AI_PANEL.read_text(encoding="utf-8")

    for path in ("arctic-90n/", "sahara-station/", "ocean-station/", "earth-space-512/"):
        assert path in quick_access
    assert "<SimpleContestQuickAccess />" in panel
    assert panel.index("<SimpleContestQuickAccess />") < panel.index("<SimpleResearchAssistant")


def test_simple_flow_uses_private_question_before_globe_and_answer_summary_after() -> None:
    source = SIMPLE_ASSISTANT.read_text(encoding="utf-8")

    private_question = 'className="simple-question panel"'
    gallery = 'className="simple-context-gallery panel"'
    globe = "<RealisticEarthGlobe"
    answer = 'className="simple-question-answer"'
    advanced_chat = "effectiveMode === 'advanced' && <ResearchChatNotebook"

    assert source.index(private_question) < source.index(gallery) < source.index(globe)
    assert source.index(globe) < source.index(answer)
    assert source.index(globe) < source.index(advanced_chat)
    assert "user-prompt-not-stored" not in source
    assert "LEGACY_CHAT_KEYS" in source
    assert "saveAssistantAnswerLocally" in source


def test_simple_flow_builds_four_real_nasa_context_views() -> None:
    source = SIMPLE_ASSISTANT.read_text(encoding="utf-8")

    assert "gibs.earthdata.nasa.gov" in source
    assert "01 · Z bliska" in source
    assert "02 · Otoczenie lokalne" in source
    assert "03 · Widok regionalny" in source
    assert "04 · Bardzo wysoki widok" in source
    assert "WIDTH: '1600'" in source
    assert "HEIGHT: '1600'" in source
    assert "generative fill" in source


def test_simple_flow_exposes_1990_today_year_and_season_controls() -> None:
    source = SIMPLE_ASSISTANT.read_text(encoding="utf-8")

    assert "1990–dziś" in source
    assert "selectedYear" in source
    assert "wiosna" in source
    assert "lato" in source
    assert "jesień" in source
    assert "zima" in source
    assert "USGS Landsat" in source


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
