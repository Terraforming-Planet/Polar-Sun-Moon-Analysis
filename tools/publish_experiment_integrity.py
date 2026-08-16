#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image

SEASONS = ("spring", "autumn")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def average_hash(path: Path, size: int = 16) -> str:
    with Image.open(path) as image:
        gray = image.convert("L").resize((size, size))
        pixels = list(gray.getdata())
    threshold = sum(pixels) / len(pixels)
    bits = "".join("1" if value >= threshold else "0" for value in pixels)
    return f"{int(bits, 2):0{size * size // 4}x}"


def source_scene_key(record: dict[str, Any]) -> str:
    item_id = record.get("item_id")
    if item_id:
        return str(item_id)
    fields = (
        record.get("platform"),
        record.get("date"),
        record.get("collection"),
        record.get("tile"),
        record.get("path"),
        record.get("row"),
    )
    return "|".join("" if value is None else str(value) for value in fields)


def write_thumbnail(source: Path, destination: Path, max_px: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = image.convert("RGB")
        image.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)
        image.save(destination, "JPEG", quality=82, optimize=True, progressive=True)


def build_index(test: int, experiment_dir: Path, gallery: bool, max_px: int) -> Path:
    publish_root = Path("published") / f"experiment-{test:03d}"
    records: list[dict[str, Any]] = []

    for season in SEASONS:
        season_root = experiment_dir / "seasonal_evidence" / season
        manifest_path = season_root / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for record in manifest.get("records", []):
            entry: dict[str, Any] = {
                "test": test,
                "season": season,
                "year": record.get("year"),
                "status": record.get("status"),
                "date": record.get("date"),
                "platform": record.get("platform"),
                "item_id": record.get("item_id"),
                "collection": record.get("collection"),
                "tile": record.get("tile"),
                "path": record.get("path"),
                "row": record.get("row"),
                "source_scene_key": source_scene_key(record),
            }
            if record.get("status") == "ok":
                files = list(record.get("files") or [])
                if not files:
                    raise RuntimeError(f"Missing files list for {season} {record.get('year')}")
                native = season_root / "images" / files[0]
                if not native.exists():
                    raise FileNotFoundError(native)
                entry["sha256"] = sha256_file(native)
                entry["average_hash_16"] = average_hash(native)
                entry["native_file"] = files[0]
                if gallery:
                    preview = season_root / "images" / (files[1] if len(files) > 1 else files[0])
                    thumb = publish_root / "gallery" / season / f"{int(record['year'])}.jpg"
                    write_thumbnail(preview, thumb, max_px)
                    entry["gallery_path"] = thumb.as_posix()
            records.append(entry)

    payload = {
        "schema_version": 1,
        "test": test,
        "experiment_dir": experiment_dir.as_posix(),
        "seasons": list(SEASONS),
        "record_count": len(records),
        "accepted_count": sum(1 for record in records if record["status"] == "ok"),
        "records": records,
    }
    publish_root.mkdir(parents=True, exist_ok=True)
    output = publish_root / "integrity.json"
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish a lightweight integrity index for an experiment")
    parser.add_argument("--test", type=int, required=True)
    parser.add_argument("--experiment-dir", type=Path, required=True)
    parser.add_argument("--gallery", action="store_true")
    parser.add_argument("--max-px", type=int, default=900)
    args = parser.parse_args()
    output = build_index(args.test, args.experiment_dir, args.gallery, args.max_px)
    print(output)


if __name__ == "__main__":
    main()
