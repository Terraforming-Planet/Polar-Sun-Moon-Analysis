from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "sahara-station"
DOCS = ROOT / "docs" / "sahara-station"


def test_path_concordance_modules_are_published_identically() -> None:
    for name in (
        "sahara-flow-path.js",
        "sahara-path-concordance.js",
        "sahara-drainage-path-overlay.js",
        "sahara-globe.js",
    ):
        assert (WEB / name).read_text(encoding="utf-8") == (
            DOCS / name
        ).read_text(encoding="utf-8")


def test_path_concordance_exports_training_features_and_3d_preview() -> None:
    module = (WEB / "sahara-path-concordance.js").read_text(encoding="utf-8")
    globe = (WEB / "sahara-globe.js").read_text(encoding="utf-8")
    overlay = (WEB / "sahara-drainage-path-overlay.js").read_text(encoding="utf-8")

    assert "tracePrincipalPath" in module
    assert "compareDrainagePaths" in module
    assert "concordantFraction" in module
    assert "outletDistanceKm" in module
    assert "paleoriver_path_concordance_8.json" in module
    assert "paleoriver_path_concordance_8.csv" in module
    assert "sahara:show-drainage-paths" in module
    assert "sahara:show-drainage-paths" in globe
    assert "principal-drainage-path-1deg" in overlay
    assert "principal-drainage-path-3deg" in overlay


def test_path_comparison_copy_keeps_scientific_caution() -> None:
    module = (WEB / "sahara-path-concordance.js").read_text(encoding="utf-8")
    assert "nie dowód paleorzeki" in module
    assert "Nie jest to kryterium geologiczne" in module
