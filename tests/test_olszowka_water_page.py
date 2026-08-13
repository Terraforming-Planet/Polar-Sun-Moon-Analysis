from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "web" / "public" / "water-local" / "index.html"


def test_page_exposes_real_night_radiance_and_water_sources() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance" in source
    assert "VIIRS_SNPP_DayNightBand_ENCC" in source
    assert "sentinel-1-grd" in source
    assert "sentinel-2-l2a" in source
    assert "Global Surface Water 1984–2021" in source
    assert "Copernicus Data Space" in source


def test_page_does_not_claim_individual_lamps_are_resolved() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "Pojedyncza latarnia może być mniejsza niż piksel sensora" in source
    assert "Jasny piksel nad obszarem jest pomiarem radiancji" in source
    assert "nie oznaczamy niewidocznej lampy jako „wyłączonej”" in source


def test_page_marks_local_water_report_as_verification_priority() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "Staw w lesie" in source
    assert "Jezioro Panieńskie" in source
    assert "Jezioro Kuchnia" in source
    assert "priorytet do weryfikacji" in source
    assert "nie automatycznie potwierdzona klęska żywiołowa" in source
    assert "tp-olszowka-pond-pin" in source


def test_page_uses_stac_time_or_explicit_lookback_for_copernicus() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "latestSentinel2Day" in source
    assert "30-dniowe okno awaryjne" in source
    assert "nie nazywamy jej bieżącą obserwacją" in source
    assert "time:w.time" in source


def test_page_validates_remote_urls_before_rendering_href_or_src() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "function safeRemoteUrl" in source
    assert "u.protocol==='https:'" in source
    assert "const previewUrl=safeRemoteUrl(item.preview_url)" in source
    assert "productUrl=safeRemoteUrl(item.product_url)" in source
