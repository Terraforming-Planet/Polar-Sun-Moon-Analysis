from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from terra_research_node.training004_sources.landsat import (
    SR_OFFSET,
    SR_SCALE,
    RasterioCogBackend,
    decode_qa_pixel,
    official_cloud_href,
    read_scientific_window,
    semantic_assets,
)
from terra_research_node.water_cycle_pipeline import (
    AcquisitionPlan,
    build_evidence_package,
    build_split_manifest,
    provider_health_records,
)


def _item(platform: str = "landsat-8") -> dict[str, Any]:
    bands = {"SR_B3": "Green", "SR_B4": "Red", "SR_B5": "NIR", "SR_B6": "SWIR1", "QA_PIXEL": "QA"}
    return {
        "id": "LC08_FIXTURE_T1_L2",
        "properties": {"platform": platform, "datetime": "2020-04-15T00:00:00Z"},
        "assets": {
            key: {"href": f"https://landsatlook.usgs.gov/data/{key}.TIF", "title": title}
            for key, title in bands.items()
        },
    }


class FakeRaster:
    def read(self, href: str, bbox: tuple[float, float, float, float], size: int) -> np.ndarray:
        del bbox
        if "QA_PIXEL" in href:
            return np.zeros((size, size), dtype=np.uint16)
        return np.full((size, size), 10_000, dtype=np.uint16)


def _record(pack: str = "T004-W30-0000001", region: str = "safe-region") -> dict[str, Any]:
    return {
        "pack_id": pack,
        "category": "green_water_rich",
        "region_id": region,
        "sample_center": {"lat": 50.0, "lon": 10.0},
        "temporal": {
            "mode": "same_season_cross_year",
            "reference_year": 2000,
            "comparison_year": 2020,
        },
        "season": {"primary_window": ["03-01", "05-31"], "secondary_window": ["09-01", "11-30"]},
    }


def test_mission_aware_assets_and_scientific_scale() -> None:
    mapped = semantic_assets(_item())
    assert mapped["green"].key == "SR_B3"
    result = read_scientific_window(_item(), (9.9, 49.9, 10.1, 50.1), FakeRaster(), size=4)
    assert result["state"] == "READY"
    assert np.isclose(result["bands"]["green"][0, 0], 10_000 * SR_SCALE + SR_OFFSET)
    assert result["native_resolution_m"] == 30


def test_usgs_landsatlook_data_href_rewrites_to_official_requester_pays_s3() -> None:
    href = (
        "https://landsatlook.usgs.gov/data/collection02/level-2/standard/oli-tirs/"
        "2020/001/001/LC08_TEST/LC08_TEST_SR_B3.TIF"
    )
    assert official_cloud_href(href) == (
        "s3://usgs-landsat/collection02/level-2/standard/oli-tirs/"
        "2020/001/001/LC08_TEST/LC08_TEST_SR_B3.TIF"
    )


def test_non_usgs_asset_href_is_not_rewritten() -> None:
    href = "https://example.test/data/scene.tif"
    assert official_cloud_href(href) == href


def test_usgs_underscore_platform_schema_is_supported() -> None:
    landsat5 = _item("landsat_5")
    landsat5["assets"] = {
        key: {**value, "title": key}
        for key, value in landsat5["assets"].items()
        if key in {"SR_B3", "SR_B4", "SR_B5", "QA_PIXEL"}
    }
    landsat5["assets"]["SR_B2"] = {
        "href": "https://landsatlook.usgs.gov/data/SR_B2.TIF",
        "title": "Green",
    }
    mapped = semantic_assets(landsat5)
    assert mapped["green"].key == "SR_B2"


def test_landsat7_slc_off_fill_is_invalid_not_change() -> None:
    qa = np.array([[0, 1]], dtype=np.uint16)
    masks = decode_qa_pixel(qa, landsat7_slc_off=True)
    assert masks["valid"].tolist() == [[True, False]]
    assert masks["sensor_artifact"].tolist() == [[False, True]]


def test_acquisition_deduplicates_and_counts_reuse() -> None:
    first = _record()
    second = {**first, "pack_id": "T004-W30-0000002"}
    plan = AcquisitionPlan.build([first, second])
    assert len(plan.unique) == 1
    assert next(iter(plan.unique.values()))["asset_reuse_count"] == 2


def test_evidence_hash_is_deterministic_and_compact() -> None:
    package_a = build_evidence_package(_record())
    package_b = build_evidence_package(_record())
    assert package_a["provenance_hash"] == package_b["provenance_hash"]
    assert package_a["evidence_classes"] == ["UNKNOWN"]
    assert "bands" not in package_a


def test_geographic_split_keeps_region_together_and_rejects_test001(tmp_path: Path) -> None:
    records = [_record(), _record("T004-W30-0000002")]
    payload = build_split_manifest(records, tmp_path / "split.json")
    assert len({row["split"] for row in payload["records"]}) == 1
    try:
        build_split_manifest([_record(region="kuchnia-pond-pl")], tmp_path / "bad.json")
    except ValueError as exc:
        assert "leakage" in str(exc).lower()
    else:
        raise AssertionError("TEST 001 leakage was accepted")


def test_provider_health_attempts_put_unresolved_tropical_records_last() -> None:
    tropical = _record("T004-W30-0000002")
    tropical["season"] = {"zone": "tropical"}
    temperate = _record("T004-W30-0000003")
    temperate["season"]["zone"] = "mid_latitude"
    ordered = provider_health_records([tropical, temperate])
    assert [row["pack_id"] for row in ordered] == [
        "T004-W30-0000003",
        "T004-W30-0000002",
    ]

def test_planetary_computer_blob_is_signed_lazily() -> None:
    unsigned = (
        "https://landsateuwest.blob.core.windows.net/landsat-c2/"
        "level-2/example_SR_B3.TIF"
    )
    backend = RasterioCogBackend(
        azure_signer=lambda href: f"{href}?sig=temporary-not-persisted"
    )
    signed, requester_pays = backend._access_href(unsigned)
    assert signed.endswith("?sig=temporary-not-persisted")
    assert requester_pays is False
    assert official_cloud_href(unsigned) == unsigned

