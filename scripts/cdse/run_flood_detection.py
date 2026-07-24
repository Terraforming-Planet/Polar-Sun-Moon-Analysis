from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import openeo
import yaml


def load_config(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Configuration must be a YAML mapping")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a Sentinel-1 before/after flood-change product with CDSE openEO"
    )
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    config = load_config(args.config)

    output_dir = Path(config["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    connection = openeo.connect(config["backend_url"])
    connection.authenticate_oidc()

    spatial_extent = dict(config["spatial_extent"])
    band = str(config.get("polarization", "VV"))
    properties = {
        "sat:orbit_state": lambda value: value == str(config["orbit_state"])
    }

    def load_period(period: list[str]):
        cube = connection.load_collection(
            config["collection"],
            spatial_extent=spatial_extent,
            temporal_extent=period,
            bands=[band],
            properties=properties,
        )
        cube = cube.sar_backscatter(coefficient=config["coefficient"])
        return cube.reduce_dimension(dimension="t", reducer="median")

    before = load_period(config["before_period"])
    after = load_period(config["after_period"])
    change = after - before

    before_path = output_dir / "before_median.tif"
    after_path = output_dir / "after_median.tif"
    change_path = output_dir / "backscatter_change.tif"

    before.execute_batch(str(before_path), out_format="GTiff", title="Flood baseline")
    after.execute_batch(str(after_path), out_format="GTiff", title="Flood after period")
    change.execute_batch(str(change_path), out_format="GTiff", title="Flood backscatter change")

    metadata = {
        "run_at_utc": datetime.now(UTC).isoformat(),
        "source": "Copernicus Data Space Ecosystem openEO",
        "collection": config["collection"],
        "band": band,
        "coefficient": config["coefficient"],
        "spatial_extent": spatial_extent,
        "before_period": config["before_period"],
        "after_period": config["after_period"],
        "outputs": [str(before_path), str(after_path), str(change_path)],
        "interpretation": (
            "The change raster is a before/after radar-backscatter difference. "
            "It is a candidate flood-change layer, not a validated emergency alert."
        ),
    }
    (output_dir / "run_metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
