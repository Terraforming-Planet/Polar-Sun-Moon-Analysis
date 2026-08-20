from terra_research_node.global_public_dataset import Region
from terra_research_node.streaming_gibs_training import candidate_window_count, task_from_index


def test_candidate_window_count() -> None:
    assert candidate_window_count(2, 2000, 2001, 2) == 64


def test_task_from_index_is_deterministic_and_bounded() -> None:
    regions = [
        Region(id="a", name="A", lat=0.0, lon=0.0, span_deg=2.0, tags=("water",)),
        Region(id="b", name="B", lat=10.0, lon=20.0, span_deg=4.0, tags=("desert",)),
    ]
    first = task_from_index(
        0,
        regions,
        start_year=2000,
        end_year=2001,
        grid=2,
        resolution=512,
    )
    last = task_from_index(
        63,
        regions,
        start_year=2000,
        end_year=2001,
        grid=2,
        resolution=512,
    )
    assert first.region_id == "a"
    assert first.date == "2000-03-15"
    assert first.cell == 0
    assert "gibs.earthdata.nasa.gov" in first.source_url
    assert last.region_id == "b"
    assert last.date == "2001-12-15"
    assert last.cell == 3
    assert first.source_url != last.source_url
