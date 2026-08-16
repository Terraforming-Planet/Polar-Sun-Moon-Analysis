from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "sahara-station"
DOCS = ROOT / "docs" / "sahara-station"


def test_drainage_stability_module_is_published_identically() -> None:
    web = (WEB / "sahara-drainage-stability.js").read_text(encoding="utf-8")
    docs = (DOCS / "sahara-drainage-stability.js").read_text(encoding="utf-8")

    assert web == docs
    assert "classifyDrainageStability" in web
    assert "angularDifferenceDeg" in web
    assert "loadCopernicusDemMosaic" in web
    assert "buildMosaicFlowProducts" in web
    assert "buildFlowProducts" in web
    assert "Porównaj 1° i 3° dla 8 testów" in web
    assert "paleoriver_drainage_stability_8.json" in web
    assert "paleoriver_drainage_stability_8.csv" in web


def test_drainage_stability_is_mounted_from_mosaic_suite() -> None:
    for root in (WEB, DOCS):
        suite = (root / "sahara-dem-mosaic-suite.js").read_text(encoding="utf-8")
        assert "import './sahara-drainage-stability.js';" in suite


def test_stability_thresholds_are_explicit_screening_rules() -> None:
    js = (WEB / "sahara-drainage-stability.js").read_text(encoding="utf-8")

    assert "angleDeltaDeg <= 45 && watershedDelta <= 0.15" in js
    assert "angleDeltaDeg <= 90 && watershedDelta <= 0.30" in js
    assert "Progi są roboczym screeningiem jakości modelu" in js
    assert "nie dowodem paleorzeki" in js
