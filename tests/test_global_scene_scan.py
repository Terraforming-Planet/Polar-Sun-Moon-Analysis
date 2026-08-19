from terra_research_node.global_scene_scan import _compact_feature, _next_request, _year_windows


def test_year_windows_are_inclusive() -> None:
    windows = _year_windows(1990, 1992)
    assert [year for year, _ in windows] == [1990, 1991, 1992]
    assert windows[0][1].startswith("1990-01-01T00:00:00Z/")


def test_compact_feature_keeps_provenance_fields() -> None:
    feature = {
        "id": "LC08_TEST",
        "collection": "landsat-c2l2-sr",
        "bbox": [1, 2, 3, 4],
        "properties": {
            "datetime": "2020-01-01T00:00:00Z",
            "platform": "LANDSAT_8",
            "eo:cloud_cover": 12.5,
            "landsat:wrs_path": "190",
            "landsat:wrs_row": "024",
        },
        "assets": {"red": {"href": "x"}, "green": {"href": "y"}},
    }
    compact = _compact_feature(feature)
    assert compact["id"] == "LC08_TEST"
    assert compact["platform"] == "LANDSAT_8"
    assert compact["cloud_cover"] == 12.5
    assert compact["asset_keys"] == ["green", "red"]


def test_next_request_preserves_stac_method_and_body() -> None:
    payload = {
        "links": [
            {
                "rel": "next",
                "href": "https://example.test/search",
                "method": "POST",
                "body": {"token": "abc"},
            }
        ]
    }
    assert _next_request(payload) == (
        "https://example.test/search",
        "POST",
        {"token": "abc"},
    )
