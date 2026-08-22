from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "web" / "index.html"
RUNTIME = ROOT / "web" / "public" / "contest-runtime.js"
AREA = ROOT / "cloudflare" / "evidence-worker" / "src" / "areaAnalysisV2.js"
IMAGE_PROXY = ROOT / "cloudflare" / "evidence-worker" / "src" / "imageProxy.js"


def test_public_app_declares_english_and_loads_contest_runtime() -> None:
    index = INDEX.read_text(encoding="utf-8")
    assert '<html lang="en">' in index
    assert 'name="terra-evidence-api"' in index
    assert '%VITE_EVIDENCE_API_URL%' in index
    assert './contest-runtime.js' in index


def test_simple_and_advanced_gallery_limits_are_explicit() -> None:
    runtime = RUNTIME.read_text(encoding="utf-8")
    assert "const limit = mode === 'advanced' ? 8 : 4" in runtime
    assert "up to ${limit} official satellite images" in runtime
    assert "Evidence Worker streaming" in runtime


def test_official_imagery_uses_streaming_proxy_and_black_frame_guard() -> None:
    runtime = RUNTIME.read_text(encoding="utf-8")
    proxy = IMAGE_PROXY.read_text(encoding="utf-8")
    assert "gibs.earthdata.nasa.gov" in runtime
    assert "sh.dataspace.copernicus.eu" in runtime
    assert "landsatlook.usgs.gov" in runtime
    assert "/research/image?url=" in runtime
    assert "isNearBlack" in runtime
    assert "safeGibsDate" in runtime
    assert "streamed-official-imagery" in proxy
    assert "official-public-source; no image generation" in proxy


def test_area_analysis_uses_english_and_bounded_4_8_ai_images() -> None:
    source = AREA.read_text(encoding="utf-8")
    assert "Respond in English." in source
    assert "const QUICK_OPENAI_IMAGE_LIMIT = 4" in source
    assert "const DEEP_OPENAI_IMAGE_LIMIT = 8" in source
    assert "const MAX_GALLERY_IMAGES = 8" in source
    assert "latestStableGibsDate" in source
    assert "simple_display_limit: 4" in source
    assert "advanced_display_limit: 8" in source


def test_runtime_translates_dynamic_app_and_same_origin_tabs() -> None:
    runtime = RUNTIME.read_text(encoding="utf-8")
    assert "documentElement.lang = 'en'" in runtime
    assert "MutationObserver" in runtime
    assert "contentDocument" in runtime
    assert "Cross-origin iframe" in runtime
    assert "['Prosty', 'Simple']" in runtime
    assert "['Zaawansowany', 'Advanced']" in runtime
    assert "['Rozwiń', 'Expand']" in runtime
