from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .audit import (
    SEASONS,
    AuditRecord,
    GitAccessor,
    SourceConfig,
    analyze_records,
    load_sources,
    write_report,
)


def _text(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def _integer(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def _recorded_sha(record: dict[str, Any]) -> str | None:
    direct = _text(record.get("sha256"))
    if direct:
        return direct
    integrity = record.get("image_integrity")
    if isinstance(integrity, dict):
        return _text(integrity.get("sha256"))
    return None


def _scene_key(record: dict[str, Any]) -> str | None:
    item_id = _text(record.get("item_id"))
    if item_id:
        return item_id
    fields = (
        _text(record.get("platform")),
        _text(record.get("date")),
        _text(record.get("collection")),
        _text(record.get("tile")),
        _text(record.get("path")),
        _text(record.get("row")),
    )
    if not any(fields):
        return None
    return "|".join(value or "" for value in fields)


def _manifest_records(source: SourceConfig, git: GitAccessor) -> list[AuditRecord]:
    if source.experiment_dir is None:
        raise ValueError(f"Test {source.test} requires experiment_dir")
    output: list[AuditRecord] = []
    for season in SEASONS:
        manifest_path = f"{source.experiment_dir}/seasonal_evidence/{season}/manifest.json"
        manifest = json.loads(git.show_text(source.branch, manifest_path))
        records = manifest.get("records")
        if not isinstance(records, list):
            raise ValueError(f"Invalid records list in {source.branch}:{manifest_path}")
        for raw in records:
            if not isinstance(raw, dict):
                raise ValueError(f"Invalid record in {source.branch}:{manifest_path}")
            files = raw.get("files")
            native_file = None
            if isinstance(files, list) and files:
                native_file = str(files[0])
            output.append(
                AuditRecord(
                    test=source.test,
                    branch=source.branch,
                    season=season,
                    year=_integer(raw.get("year")),
                    status=_text(raw.get("status")) or "unknown",
                    date=_text(raw.get("date")),
                    platform=_text(raw.get("platform")),
                    item_id=_text(raw.get("item_id")),
                    source_scene_key=_scene_key(raw),
                    sha256=_recorded_sha(raw),
                    average_hash_16=_text(raw.get("average_hash_16")),
                    native_file=native_file,
                    origin=f"{source.branch}:{manifest_path}",
                )
            )
    return output


def _index_records(source: SourceConfig, git: GitAccessor) -> list[AuditRecord]:
    if source.index_path is None:
        raise ValueError(f"Test {source.test} requires index_path")
    index = json.loads(git.show_text(source.branch, source.index_path))
    records = index.get("records")
    if not isinstance(records, list):
        raise ValueError(f"Invalid index records in {source.branch}:{source.index_path}")
    output: list[AuditRecord] = []
    for raw in records:
        if not isinstance(raw, dict):
            raise ValueError(f"Invalid index record in {source.branch}:{source.index_path}")
        output.append(
            AuditRecord(
                test=source.test,
                branch=source.branch,
                season=_text(raw.get("season")) or "unknown",
                year=_integer(raw.get("year")),
                status=_text(raw.get("status")) or "unknown",
                date=_text(raw.get("date")),
                platform=_text(raw.get("platform")),
                item_id=_text(raw.get("item_id")),
                source_scene_key=_text(raw.get("source_scene_key")),
                sha256=_text(raw.get("sha256")),
                average_hash_16=_text(raw.get("average_hash_16")),
                native_file=_text(raw.get("native_file")),
                origin=f"{source.branch}:{source.index_path}",
            )
        )
    return output


def collect_fast_records(sources: list[SourceConfig], git: GitAccessor) -> list[AuditRecord]:
    output: list[AuditRecord] = []
    for source in sources:
        if source.mode == "manifest":
            output.extend(_manifest_records(source, git))
        else:
            output.extend(_index_records(source, git))
    return output


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fast global evidence audit using builder-recorded SHA-256 hashes"
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config/satellite_integrity_sources.json"),
    )
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument(
        "--json-out",
        type=Path,
        default=Path("docs/data/integrity/GLOBAL_DATA_INTEGRITY_REPORT.json"),
    )
    parser.add_argument(
        "--markdown-out",
        type=Path,
        default=Path("docs/data/integrity/GLOBAL_DATA_INTEGRITY_REPORT.md"),
    )
    parser.add_argument("--near-threshold", type=int, default=2)
    parser.add_argument("--no-fail", action="store_true")
    args = parser.parse_args()

    records = collect_fast_records(load_sources(args.config), GitAccessor(args.repo))
    accepted = [record for record in records if record.status == "ok"]
    missing_hashes = [record.slot for record in accepted if not record.sha256]
    if missing_hashes:
        preview = ", ".join(missing_hashes[:12])
        raise RuntimeError(
            f"Accepted observations without recorded SHA-256: {len(missing_hashes)}; {preview}"
        )

    report = analyze_records(records, near_threshold=args.near_threshold)
    write_report(report, args.json_out, args.markdown_out)
    print(json.dumps(report.to_dict()["summary"], ensure_ascii=False))
    print(
        "hash coverage",
        report.exact_hash_coverage,
        "/",
        report.accepted_count,
        "perceptual coverage",
        report.perceptual_hash_coverage,
    )
    if report.status == "FAIL" and not args.no_fail:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
