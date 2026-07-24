from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from PIL import Image
from rasterio.warp import transform_bounds

LAYERS = {
    "before": "before_median.tif",
    "after": "after_median.tif",
    "change": "backscatter_change.tif",
}


def normalize_grayscale(array: np.ndarray, mask: np.ndarray) -> np.ndarray:
    valid = array[mask]
    if valid.size == 0:
        return np.zeros(array.shape, dtype=np.uint8)
    low, high = np.nanpercentile(valid, [2, 98])
    if not np.isfinite(low) or not np.isfinite(high) or high <= low:
        return np.zeros(array.shape, dtype=np.uint8)
    scaled = np.clip((array - low) / (high - low), 0, 1)
    return (scaled * 255).astype(np.uint8)


def render_change(array: np.ndarray, mask: np.ndarray) -> np.ndarray:
    valid = np.abs(array[mask])
    scale = float(np.nanpercentile(valid, 98)) if valid.size else 1.0
    if not np.isfinite(scale) or scale <= 0:
        scale = 1.0
    normalized = np.clip(array / scale, -1, 1)
    rgba = np.zeros((*array.shape, 4), dtype=np.uint8)
    negative = normalized < 0
    positive = normalized > 0
    rgba[..., 2][negative] = (np.abs(normalized[negative]) * 255).astype(np.uint8)
    rgba[..., 0][positive] = (normalized[positive] * 255).astype(np.uint8)
    rgba[..., 1] = (40 + (1 - np.abs(normalized)) * 80).astype(np.uint8)
    rgba[..., 3][mask] = np.clip(np.abs(normalized[mask]) * 220 + 35, 35, 255).astype(
        np.uint8
    )
    return rgba


def raster_to_png(source: Path, destination: Path, change: bool) -> dict[str, Any]:
    with rasterio.open(source) as dataset:
        array = dataset.read(1).astype(np.float32)
        nodata = dataset.nodata
        mask = np.isfinite(array)
        if nodata is not None:
            mask &= array != nodata
        bounds = transform_bounds(dataset.crs, "EPSG:4326", *dataset.bounds)
        if change:
            image = Image.fromarray(render_change(array, mask), mode="RGBA")
        else:
            gray = normalize_grayscale(array, mask)
            rgba = np.dstack([gray, gray, gray, np.where(mask, 235, 0).astype(np.uint8)])
            image = Image.fromarray(rgba, mode="RGBA")
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, optimize=True)
        valid = array[mask]
        return {
            "source": source.name,
            "image": destination.name,
            "bounds": [[bounds[1], bounds[0]], [bounds[3], bounds[2]]],
            "width": dataset.width,
            "height": dataset.height,
            "minimum": float(np.nanmin(valid)) if valid.size else None,
            "maximum": float(np.nanmax(valid)) if valid.size else None,
            "mean": float(np.nanmean(valid)) if valid.size else None,
        }


def publish(input_dir: Path, output_dir: Path) -> dict[str, Any]:
    layers: dict[str, Any] = {}
    for layer_id, filename in LAYERS.items():
        source = input_dir / filename
        if not source.exists():
            raise FileNotFoundError(f"Missing flood raster: {source}")
        destination = output_dir / f"{layer_id}.png"
        layers[layer_id] = raster_to_png(source, destination, change=layer_id == "change")

    metadata_path = input_dir / "run_metadata.json"
    run_metadata: dict[str, Any] = {}
    if metadata_path.exists():
        loaded = json.loads(metadata_path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            run_metadata = loaded

    payload = {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "evidence_class": "candidate radar-change visualization",
        "warning": (
            "The red and blue overlay shows radar backscatter change. It is not a "
            "validated emergency alert or confirmed flood extent."
        ),
        "run_metadata": run_metadata,
        "layers": layers,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "map-data.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate web previews from flood GeoTIFFs")
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=Path("docs/data/copernicus/flood_detection"),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("docs/flood-map/assets"),
    )
    args = parser.parse_args()
    payload = publish(args.input_dir, args.output_dir)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
