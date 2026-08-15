from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "web" / "index.html"
CONTROL_CENTER_CSS = ROOT / "web" / "src" / "control-center.css"


def test_app_shell_keeps_react_navigation_isolated_from_legacy_dom_observers() -> None:
    html = INDEX_HTML.read_text(encoding="utf-8")

    assert 'src="./src/main.tsx"' in html
    assert "place-fire-search.js" not in html
    assert "globe-stability-fix.js" not in html
    assert "globe-zoom-controls.js" not in html
    assert "place-fire-search.css" not in html


def test_source_navigation_contains_all_published_research_tabs() -> None:
    html = INDEX_HTML.read_text(encoding="utf-8")

    for number in range(1, 11):
        assert f"./experiment-{number:03d}/" in html
    assert "./arctic-90n/" in html
    assert "./sahara-station/" in html
    assert "./copernicus/" in html
    assert "./flood-map/" in html
    assert "./constellation/" in html
    assert "./multi-angle/" in html
    assert "./investigation/" in html
    assert "./forum/" in html


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
