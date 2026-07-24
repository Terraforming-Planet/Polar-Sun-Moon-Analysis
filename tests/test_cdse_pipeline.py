from pathlib import Path

import pytest

from scripts.cdse.run_pipeline import load_config, validate_bbox, write_json


def test_validate_bbox_accepts_valid_extent() -> None:
    validate_bbox([14.0, 77.0, 25.0, 80.5])


@pytest.mark.parametrize(
    "bbox",
    [[], [1, 2, 3], [10, 20, 5, 30], [-181, 0, 1, 2], [0, -91, 1, 2]],
)
def test_validate_bbox_rejects_invalid_extent(bbox: list[float]) -> None:
    with pytest.raises(ValueError):
        validate_bbox(bbox)


def test_load_config_requires_mapping(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text("- invalid\n- config\n", encoding="utf-8")
    with pytest.raises(ValueError):
        load_config(path)


def test_write_json_round_trip(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "result.json"
    write_json(path, {"scene_count": 0, "status": "no-data"})
    assert '"scene_count": 0' in path.read_text(encoding="utf-8")
