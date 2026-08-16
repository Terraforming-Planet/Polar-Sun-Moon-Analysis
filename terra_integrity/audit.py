from __future__ import annotations

import argparse
import hashlib
import io
import json
import subprocess
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime
from pathlib import Path, PurePosixPath
from typing import Any, Literal

from PIL import Image

Severity = Literal["error", "warning", "info"]
Mode = Literal["manifest", "published_index"]
SEASONS = ("spring", "autumn")
EXPECTED_YEARS = tuple(range(1990, 2027))


@dataclass(frozen=True)
class SourceConfig:
    test: int
    branch: str
    mode: Mode
    experiment_dir: str | None = None
    index_path: str | None = None


@dataclass(frozen=True)
class AuditRecord:
    test: int
    branch: str
    season: str
    year: int | None
    status: str
    date: str | None
    platform: str | None
    item_id: str | None
    source_scene_key: str | None
    sha256: str | None
    average_hash_16: str | None
    native_file: str | None
    origin: str

    @property
    def slot(self) -> str:
        year = "?" if self.year is None else str(self.year)
        return f"T{self.test:03d}:{self.season}:{year}"


@dataclass(frozen=True)
class AuditFinding:
    severity: Severity
    code: str
    message: str
    slots: tuple[str, ...]


@dataclass(frozen=True)
class AuditReport:
    generated_at: str
    status: str
    record_count: int
    accepted_count: int
    tests: tuple[int, ...]
    exact_hash_coverage: int
    perceptual_hash_coverage: int
    findings: tuple[AuditFinding, ...]

    @property
    def error_count(self) -> int:
        return sum(finding.severity == "error" for finding in self.findings)

    @property
    def warning_count(self) -> int:
        return sum(finding.severity == "warning" for finding in self.findings)

    @property
    def info_count(self) -> int:
        return sum(finding.severity == "info" for finding in self.findings)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["summary"] = {
            "errors": self.error_count,
            "warnings": self.warning_count,
            "info": self.info_count,
        }
        return payload


class GitAccessor:
    def __init__(self, cwd: Path) -> None:
        self.cwd = cwd
        self._fetched: set[str] = set()

    def _run_bytes(self, *args: str) -> bytes:
        process = subprocess.run(
            ["git", *args],
            cwd=self.cwd,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return process.stdout

    def fetch_branch(self, branch: str) -> None:
        if branch in self._fetched:
            return
        refspec = f"+refs/heads/{branch}:refs/remotes/origin/{branch}"
        subprocess.run(
            ["git", "fetch", "--no-tags", "--filter=blob:none", "origin", refspec],
            cwd=self.cwd,
            check=True,
        )
        self._fetched.add(branch)

    def show_bytes(self, branch: str, path: str) -> bytes:
        self.fetch_branch(branch)
        return self._run_bytes("show", f"refs/remotes/origin/{branch}:{path}")

    def show_text(self, branch: str, path: str) -> str:
        return self.show_bytes(branch, path).decode("utf-8")


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def _average_hash(image_bytes: bytes, size: int = 16) -> str:
    with Image.open(io.BytesIO(image_bytes)) as image:
        gray = image.convert("L").resize((size, size), Image.Resampling.LANCZOS)
        pixels = list(gray.getdata())
    threshold = sum(pixels) / len(pixels)
    bits = "".join("1" if value >= threshold else "0" for value in pixels)
    return f"{int(bits, 2):0{size * size // 4}x}"


def _source_scene_key(record: dict[str, Any]) -> str | None:
    item_id = _optional_str(record.get("item_id"))
    if item_id:
        return item_id
    fields = (
        _optional_str(record.get("platform")),
        _optional_str(record.get("date")),
        _optional_str(record.get("collection")),
        _optional_str(record.get("tile")),
        _optional_str(record.get("path")),
        _optional_str(record.get("row")),
    )
    if not any(fields):
        return None
    return "|".join(value or "" for value in fields)


def _resolve_image_path(manifest_path: str, file_name: str) -> str:
    candidate = PurePosixPath(file_name)
    manifest_parent = PurePosixPath(manifest_path).parent
    if file_name.startswith("experiments/"):
        return candidate.as_posix()
    if candidate.parts and candidate.parts[0] == "images":
        return (manifest_parent / candidate).as_posix()
    return (manifest_parent / "images" / candidate).as_posix()


def _manifest_records(source: SourceConfig, git: GitAccessor) -> list[AuditRecord]:
    if source.experiment_dir is None:
        raise ValueError(f"Test {source.test} manifest mode requires experiment_dir")
    records: list[AuditRecord] = []
    for season in SEASONS:
        manifest_path = f"{source.experiment_dir}/seasonal_evidence/{season}/manifest.json"
        raw = json.loads(git.show_text(source.branch, manifest_path))
        manifest_records = raw.get("records")
        if not isinstance(manifest_records, list):
            raise ValueError(f"Invalid records list in {source.branch}:{manifest_path}")
        for record_any in manifest_records:
            if not isinstance(record_any, dict):
                raise ValueError(f"Invalid record in {source.branch}:{manifest_path}")
            record: dict[str, Any] = record_any
            status = _optional_str(record.get("status")) or "unknown"
            sha256: str | None = _optional_str(record.get("sha256"))
            average_hash_16: str | None = _optional_str(record.get("average_hash_16"))
            native_file: str | None = None
            if status == "ok":
                files_any = record.get("files")
                if not isinstance(files_any, list) or not files_any:
                    raise ValueError(
                        f"Missing files for Test {source.test} {season} "
                        f"{record.get('year')}"
                    )
                files = [str(value) for value in files_any]
                native_file = _resolve_image_path(manifest_path, files[0])
                native_bytes = git.show_bytes(source.branch, native_file)
                sha256 = hashlib.sha256(native_bytes).hexdigest()
                preview_name = files[1] if len(files) > 1 else files[0]
                preview_path = _resolve_image_path(manifest_path, preview_name)
                preview_bytes = (
                    native_bytes
                    if preview_path == native_file
                    else git.show_bytes(source.branch, preview_path)
                )
                average_hash_16 = _average_hash(preview_bytes)
            records.append(
                AuditRecord(
                    test=source.test,
                    branch=source.branch,
                    season=season,
                    year=_optional_int(record.get("year")),
                    status=status,
                    date=_optional_str(record.get("date")),
                    platform=_optional_str(record.get("platform")),
                    item_id=_optional_str(record.get("item_id")),
                    source_scene_key=_source_scene_key(record),
                    sha256=sha256,
                    average_hash_16=average_hash_16,
                    native_file=native_file,
                    origin=f"{source.branch}:{manifest_path}",
                )
            )
    return records


def _published_index_records(source: SourceConfig, git: GitAccessor) -> list[AuditRecord]:
    if source.index_path is None:
        raise ValueError(f"Test {source.test} published_index mode requires index_path")
    raw = json.loads(git.show_text(source.branch, source.index_path))
    index_records = raw.get("records")
    if not isinstance(index_records, list):
        raise ValueError(f"Invalid records list in {source.branch}:{source.index_path}")
    records: list[AuditRecord] = []
    for record_any in index_records:
        if not isinstance(record_any, dict):
            raise ValueError(f"Invalid record in {source.branch}:{source.index_path}")
        record: dict[str, Any] = record_any
        records.append(
            AuditRecord(
                test=source.test,
                branch=source.branch,
                season=_optional_str(record.get("season")) or "unknown",
                year=_optional_int(record.get("year")),
                status=_optional_str(record.get("status")) or "unknown",
                date=_optional_str(record.get("date")),
                platform=_optional_str(record.get("platform")),
                item_id=_optional_str(record.get("item_id")),
                source_scene_key=_optional_str(record.get("source_scene_key")),
                sha256=_optional_str(record.get("sha256")),
                average_hash_16=_optional_str(record.get("average_hash_16")),
                native_file=_optional_str(record.get("native_file")),
                origin=f"{source.branch}:{source.index_path}",
            )
        )
    return records


def load_sources(path: Path) -> list[SourceConfig]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    tests = raw.get("tests")
    if not isinstance(tests, list):
        raise ValueError("Configuration must contain a tests list")
    sources: list[SourceConfig] = []
    for source_any in tests:
        if not isinstance(source_any, dict):
            raise ValueError("Each test source must be an object")
        mode_raw = str(source_any["mode"])
        if mode_raw not in {"manifest", "published_index"}:
            raise ValueError(f"Unsupported mode: {mode_raw}")
        mode: Mode = "manifest" if mode_raw == "manifest" else "published_index"
        sources.append(
            SourceConfig(
                test=int(source_any["test"]),
                branch=str(source_any["branch"]),
                mode=mode,
                experiment_dir=_optional_str(source_any.get("experiment_dir")),
                index_path=_optional_str(source_any.get("index_path")),
            )
        )
    return sources


def collect_records(sources: list[SourceConfig], git: GitAccessor) -> list[AuditRecord]:
    records: list[AuditRecord] = []
    for source in sources:
        if source.mode == "manifest":
            records.extend(_manifest_records(source, git))
        else:
            records.extend(_published_index_records(source, git))
    return records


def _hamming_hex(left: str, right: str) -> int | None:
    if len(left) != len(right):
        return None
    try:
        return (int(left, 16) ^ int(right, 16)).bit_count()
    except ValueError:
        return None


def _coverage_findings(records: list[AuditRecord], today: date) -> list[AuditFinding]:
    findings: list[AuditFinding] = []
    grouped: dict[tuple[int, str], list[AuditRecord]] = defaultdict(list)
    for record in records:
        grouped[(record.test, record.season)].append(record)

    tests = sorted({record.test for record in records})
    for test in tests:
        for season in SEASONS:
            season_records = grouped.get((test, season), [])
            years = [record.year for record in season_records if record.year is not None]
            duplicate_years = sorted({year for year in years if years.count(year) > 1})
            if duplicate_years:
                findings.append(
                    AuditFinding(
                        severity="error",
                        code="duplicate_year_slot",
                        message=(
                            f"Test {test:03d} {season}: duplicate year slots "
                            f"{duplicate_years}"
                        ),
                        slots=tuple(
                            f"T{test:03d}:{season}:{year}" for year in duplicate_years
                        ),
                    )
                )
            missing = [year for year in EXPECTED_YEARS if year not in years]
            if missing:
                findings.append(
                    AuditFinding(
                        severity="error",
                        code="missing_year_slots",
                        message=f"Test {test:03d} {season}: missing requested years {missing}",
                        slots=tuple(f"T{test:03d}:{season}:{year}" for year in missing),
                    )
                )
            accepted = [record for record in season_records if record.status == "ok"]
            if len(accepted) < 30:
                findings.append(
                    AuditFinding(
                        severity="error",
                        code="insufficient_accepted_observations",
                        message=(
                            f"Test {test:03d} {season}: only {len(accepted)} "
                            "accepted observations"
                        ),
                        slots=(f"T{test:03d}:{season}",),
                    )
                )
            for record in accepted:
                date_matches = (
                    record.year is not None
                    and record.date is not None
                    and record.date.startswith(f"{record.year}-")
                )
                if not date_matches:
                    findings.append(
                        AuditFinding(
                            severity="error",
                            code="date_year_mismatch",
                            message=(
                                f"{record.slot}: accepted date does not match "
                                f"assigned year ({record.date})"
                            ),
                            slots=(record.slot,),
                        )
                    )
            if season == "autumn" and today < date(2026, 9, 1):
                autumn_2026 = [record for record in season_records if record.year == 2026]
                if autumn_2026 and any(record.status == "ok" for record in autumn_2026):
                    findings.append(
                        AuditFinding(
                            severity="error",
                            code="future_autumn_2026_fabricated",
                            message=(
                                f"Test {test:03d}: autumn 2026 cannot be accepted "
                                "before September 2026"
                            ),
                            slots=(f"T{test:03d}:autumn:2026",),
                        )
                    )
    return findings


def _duplicate_findings(
    records: list[AuditRecord], near_threshold: int
) -> list[AuditFinding]:
    findings: list[AuditFinding] = []
    accepted = [record for record in records if record.status == "ok"]

    by_hash: dict[str, list[AuditRecord]] = defaultdict(list)
    by_item: dict[str, list[AuditRecord]] = defaultdict(list)
    for record in accepted:
        if record.sha256:
            by_hash[record.sha256].append(record)
        if record.item_id:
            by_item[record.item_id].append(record)

    for digest, group in by_hash.items():
        if len(group) < 2:
            continue
        slots = tuple(sorted(record.slot for record in group))
        tests = {record.test for record in group}
        years = {record.year for record in group}
        seasons = {record.season for record in group}
        if len(tests) == 1 and len(years) > 1:
            severity: Severity = "error"
            code = "exact_duplicate_cross_year"
        elif len(tests) == 1 and len(seasons) > 1:
            severity = "error"
            code = "exact_duplicate_cross_season"
        else:
            severity = "warning"
            code = "exact_duplicate_cross_test"
        findings.append(
            AuditFinding(
                severity=severity,
                code=code,
                message=(
                    f"Exact SHA-256 duplicate {digest[:16]}… across "
                    f"{', '.join(slots)}"
                ),
                slots=slots,
            )
        )

    for item_id, group in by_item.items():
        if len(group) < 2:
            continue
        slots = tuple(sorted(record.slot for record in group))
        tests = {record.test for record in group}
        years = {record.year for record in group}
        seasons = {record.season for record in group}
        if len(tests) == 1 and (len(years) > 1 or len(seasons) > 1):
            findings.append(
                AuditFinding(
                    severity="error",
                    code="source_product_reused_within_test",
                    message=(
                        f"Source product {item_id} reused within one test "
                        "across evidence slots"
                    ),
                    slots=slots,
                )
            )
        elif len(tests) > 1:
            findings.append(
                AuditFinding(
                    severity="info",
                    code="shared_source_scene_cross_test",
                    message=(
                        f"Source product {item_id} is shared by multiple tests; "
                        "review is informational"
                    ),
                    slots=slots,
                )
            )

    perceptual = [record for record in accepted if record.average_hash_16]
    for index, left in enumerate(perceptual):
        assert left.average_hash_16 is not None
        for right in perceptual[index + 1 :]:
            assert right.average_hash_16 is not None
            if left.sha256 and right.sha256 and left.sha256 == right.sha256:
                continue
            if left.item_id and right.item_id and left.item_id == right.item_id:
                continue
            same_slot = (
                left.test == right.test
                and left.season == right.season
                and left.year == right.year
            )
            if same_slot:
                continue
            distance = _hamming_hex(left.average_hash_16, right.average_hash_16)
            if distance is None or distance > near_threshold:
                continue
            if left.test == right.test:
                severity = "warning"
                code = "near_duplicate_within_test"
            else:
                severity = "warning"
                code = "near_duplicate_cross_test"
            findings.append(
                AuditFinding(
                    severity=severity,
                    code=code,
                    message=(
                        f"Perceptual hash distance {distance} between "
                        f"{left.slot} and {right.slot}"
                    ),
                    slots=tuple(sorted((left.slot, right.slot))),
                )
            )
    return findings


def analyze_records(
    records: list[AuditRecord],
    *,
    today: date | None = None,
    near_threshold: int = 2,
) -> AuditReport:
    audit_date = today or datetime.now(UTC).date()
    findings = _coverage_findings(records, audit_date)
    findings.extend(_duplicate_findings(records, near_threshold))
    severity_rank = {"error": 0, "warning": 1, "info": 2}
    findings.sort(
        key=lambda finding: (
            severity_rank[finding.severity],
            finding.code,
            finding.slots,
        )
    )
    errors = sum(finding.severity == "error" for finding in findings)
    accepted = [record for record in records if record.status == "ok"]
    return AuditReport(
        generated_at=datetime.now(UTC).isoformat(),
        status="PASS" if errors == 0 else "FAIL",
        record_count=len(records),
        accepted_count=len(accepted),
        tests=tuple(sorted({record.test for record in records})),
        exact_hash_coverage=sum(record.sha256 is not None for record in accepted),
        perceptual_hash_coverage=sum(
            record.average_hash_16 is not None for record in accepted
        ),
        findings=tuple(findings),
    )


def render_markdown(report: AuditReport) -> str:
    lines = [
        "# Global Satellite Data Integrity Report",
        "",
        f"- Status: **{report.status}**",
        f"- Generated: `{report.generated_at}`",
        f"- Tests: {', '.join(f'{test:03d}' for test in report.tests)}",
        f"- Records: {report.record_count}",
        f"- Accepted observations: {report.accepted_count}",
        f"- SHA-256 coverage: {report.exact_hash_coverage}/{report.accepted_count}",
        (
            "- Perceptual-hash coverage: "
            f"{report.perceptual_hash_coverage}/{report.accepted_count}"
        ),
        f"- Errors: {report.error_count}",
        f"- Warnings: {report.warning_count}",
        f"- Info: {report.info_count}",
        "",
        (
            "Archived/rejected evidence under error-review directories is intentionally "
            "excluded; only active seasonal evidence slots are audited."
        ),
        "",
        "## Findings",
        "",
    ]
    if not report.findings:
        lines.append("No duplicate, chronology, or coverage problems were detected.")
    else:
        for finding in report.findings:
            slots = ", ".join(finding.slots)
            lines.append(
                f"- **{finding.severity.upper()} · {finding.code}** — "
                f"{finding.message} [{slots}]"
            )
    lines.append("")
    return "\n".join(lines)


def write_report(report: AuditReport, json_path: Path, markdown_path: Path) -> None:
    json_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(
        json.dumps(report.to_dict(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    markdown_path.write_text(render_markdown(report), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audit satellite evidence across Tests 001-015"
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

    sources = load_sources(args.config)
    records = collect_records(sources, GitAccessor(args.repo))
    report = analyze_records(records, near_threshold=args.near_threshold)
    write_report(report, args.json_out, args.markdown_out)
    print(json.dumps(report.to_dict()["summary"], ensure_ascii=False))
    if report.status == "FAIL" and not args.no_fail:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
