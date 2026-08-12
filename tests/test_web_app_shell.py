from pathlib import Path

INDEX_HTML = Path(__file__).resolve().parents[1] / "web" / "index.html"


def test_app_shell_keeps_react_navigation_isolated_from_legacy_dom_observers() -> None:
    html = INDEX_HTML.read_text(encoding="utf-8")

    assert 'src="./src/main.tsx"' in html
    assert "place-fire-search.js" not in html
    assert "globe-stability-fix.js" not in html
    assert "globe-zoom-controls.js" not in html
    assert "place-fire-search.css" not in html
