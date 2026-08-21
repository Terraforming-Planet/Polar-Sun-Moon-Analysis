from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "web" / "index.html"
AI_RESEARCH_PANEL = ROOT / "web" / "src" / "AIResearchPanel.tsx"
QUICK_ACCESS = ROOT / "web" / "src" / "SimpleContestQuickAccess.tsx"
CONTROL_CENTER_CSS = ROOT / "web" / "src" / "control-center.css"


def test_app_shell_keeps_react_navigation_isolated_from_legacy_dom_observers() -> None:
    html = INDEX_HTML.read_text(encoding="utf-8")

    assert 'src="./src/main.tsx"' in html
    assert '<div id="root"></div>' in html
    assert "result-nav" not in html
    assert "station-strip" not in html
    assert "place-fire-search.js" not in html
    assert "globe-stability-fix.js" not in html
    assert "globe-zoom-controls.js" not in html
    assert "place-fire-search.css" not in html


def test_react_research_navigation_contains_published_tests_and_station_links() -> None:
    panel = AI_RESEARCH_PANEL.read_text(encoding="utf-8")
    source = QUICK_ACCESS.read_text(encoding="utf-8")

    assert "SimpleContestQuickAccess" in panel
    assert "PUBLIC_RESEARCH_TESTS.map" in source
    assert "Tests 1–16" in source
    assert "L4 Training #1" in source
    assert "L4 Training #2" in source
    assert "L4 Training #3" in source
    assert "arctic-90n/" in source
    assert "sahara-station/" in source
    assert "ocean-station/" in source
    assert "earth-space-512/" in source


def test_responsive_app_header_has_no_fixed_height_overlap() -> None:
    css = CONTROL_CENTER_CSS.read_text(encoding="utf-8")

    assert ".app-header{position:sticky" in css
    assert "height:auto;min-height:76px" in css
    assert ".main-tabs{display:grid" in css
    assert "grid-auto-rows:minmax(44px,auto)" in css
    narrow_tabs = (
        "@media(max-width:480px){.main-tabs{"
        "grid-template-columns:repeat(2,minmax(0,1fr))}"
    )
    assert narrow_tabs in css
