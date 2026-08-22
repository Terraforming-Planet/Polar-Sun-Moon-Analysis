from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCALE_LOCK = ROOT / "web" / "src" / "scaleLockEnhancement.ts"
RUNTIME = ROOT / "web" / "public" / "contest-runtime.js"


def test_simple_gallery_keeps_source_scenes_visible_by_default() -> None:
    source = SCALE_LOCK.read_text(encoding="utf-8")

    assert "toggle.dataset.collapsed = 'false'" in source
    assert "section.hidden = collapsed" in source
    assert "Hide original scenes · native scale" in source
    assert "sections.forEach(section => { section.hidden = true })" not in source


def test_simple_and_advanced_source_gallery_limits_match_visible_cards() -> None:
    source = SCALE_LOCK.read_text(encoding="utf-8")

    assert "const limit = mode === 'advanced' ? 8 : 4" in source
    assert 'data-source-gallery-mode' in source
    assert "nth-child(-n+4)" in source
    assert "nth-child(n+5)" in source
    assert "nth-child(-n+8)" in source
    assert "nth-child(n+9)" in source
    assert "summaryCount.textContent = String(Math.min(total, limit))" in source


def test_scale_lock_overrides_legacy_runtime_hidden_flags_only_for_source_grids() -> None:
    scale_lock = SCALE_LOCK.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")

    assert "display:block!important" in scale_lock
    assert ".simple-selected-period-images .simple-image-grid" in scale_lock
    assert ".simple-history-body .simple-image-grid" in scale_lock
    assert "[hidden]{display:none!important}" in runtime
    assert "figure.hidden = index >= limit" in runtime
