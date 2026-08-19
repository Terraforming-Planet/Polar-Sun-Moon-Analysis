from pathlib import Path

from terra_research_node.global_public_dataset import (
    Region,
    _cell_bbox,
    _gibs_layer,
    _gibs_url,
    _load_regions,
)
from terra_research_node.global_public_training import _split_bucket


def test_global_region_manifest_is_geographically_diverse() -> None:
    regions = _load_regions(Path("config/global_training_regions.json"))
    ids = {region.id for region in regions}
    assert len(regions) >= 60
    assert {
        "kuchnia-pond-pl",
        "vistula-grudziadz-gniew-pl",
        "great-salt-lake-us",
        "grays-harbor-us",
        "himalaya-nepal",
        "tibetan-plateau",
        "sahara-tanezrouft",
        "aral-sea",
        "amazon-manaus",
        "antarctica-thwaites",
    } <= ids
    assert any(region.lat < -60 for region in regions)
    assert any(region.lat > 60 for region in regions)
    assert any(region.lon < -100 for region in regions)
    assert any(region.lon > 100 for region in regions)


def test_cell_bbox_partitions_region_without_exceeding_bounds() -> None:
    region = Region(
        id="test",
        name="test",
        lat=0.0,
        lon=0.0,
        span_deg=4.0,
        tags=(),
    )
    first = _cell_bbox(region, 2, 0)
    last = _cell_bbox(region, 2, 3)
    assert first == (-2.0, -2.0, 0.0, 0.0)
    assert last == (0.0, 0.0, 2.0, 2.0)


def test_gibs_uses_historically_valid_true_color_families() -> None:
    assert _gibs_layer(2005) == "MODIS_Terra_CorrectedReflectance_TrueColor"
    assert _gibs_layer(2018) == "VIIRS_SNPP_CorrectedReflectance_TrueColor"


def test_gibs_url_is_date_and_bbox_specific() -> None:
    url = _gibs_url("2020-06-15", (10.0, 20.0, 11.0, 21.0), 512)
    assert url.startswith("https://gibs.earthdata.nasa.gov/")
    assert "time=2020-06-15" in url
    assert "width=512" in url
    assert "height=512" in url


def test_training_split_is_deterministic() -> None:
    path = Path("research_cache/global_public_dataset/nasa_gibs/a/2020/cell-00.jpg")
    assert _split_bucket(path) == _split_bucket(path)
    assert 0 <= _split_bucket(path) <= 99
