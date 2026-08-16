from __future__ import annotations

from dataclasses import replace
from datetime import date

from terra_integrity.audit import AuditRecord, analyze_records


def make_test_records(test: int) -> list[AuditRecord]:
    records: list[AuditRecord] = []
    for season in ("spring", "autumn"):
        for year in range(1990, 2027):
            is_future_autumn = season == "autumn" and year == 2026
            status = "missing" if is_future_autumn else "ok"
            month = 5 if season == "spring" else 9
            records.append(
                AuditRecord(
                    test=test,
                    branch=f"test-{test:03d}",
                    season=season,
                    year=year,
                    status=status,
                    date=None if is_future_autumn else f"{year}-{month:02d}-15",
                    platform="landsat",
                    item_id=None if is_future_autumn else f"T{test:03d}-{season}-{year}",
                    source_scene_key=None,
                    sha256=None,
                    average_hash_16=None,
                    native_file=None,
                    origin="fixture",
                )
            )
    return records


def test_clean_series_passes() -> None:
    report = analyze_records(make_test_records(1), today=date(2026, 8, 16))

    assert report.status == "PASS"
    assert report.error_count == 0


def test_exact_duplicate_across_years_fails() -> None:
    records = make_test_records(1)
    first = next(record for record in records if record.season == "spring" and record.year == 2002)
    second = next(record for record in records if record.season == "spring" and record.year == 2012)
    records[records.index(first)] = replace(first, sha256="deadbeef")
    records[records.index(second)] = replace(second, sha256="deadbeef")

    report = analyze_records(records, today=date(2026, 8, 16))

    assert report.status == "FAIL"
    assert any(finding.code == "exact_duplicate_cross_year" for finding in report.findings)


def test_shared_source_product_between_tests_is_informational() -> None:
    records = make_test_records(1) + make_test_records(2)
    left = next(record for record in records if record.test == 1 and record.year == 2005)
    right = next(record for record in records if record.test == 2 and record.year == 2005)
    records[records.index(left)] = replace(left, item_id="SHARED-SCENE")
    records[records.index(right)] = replace(right, item_id="SHARED-SCENE")

    report = analyze_records(records, today=date(2026, 8, 16))

    assert report.status == "PASS"
    assert any(finding.code == "shared_source_scene_cross_test" for finding in report.findings)


def test_future_autumn_2026_is_rejected() -> None:
    records = make_test_records(1)
    target = next(
        record for record in records if record.season == "autumn" and record.year == 2026
    )
    records[records.index(target)] = replace(
        target,
        status="ok",
        date="2026-08-15",
        item_id="FUTURE-AUTUMN",
    )

    report = analyze_records(records, today=date(2026, 8, 16))

    assert report.status == "FAIL"
    assert any(finding.code == "future_autumn_2026_fabricated" for finding in report.findings)


def test_near_duplicate_is_warning_not_failure() -> None:
    records = make_test_records(1)
    first = next(record for record in records if record.season == "spring" and record.year == 2001)
    second = next(record for record in records if record.season == "autumn" and record.year == 2001)
    records[records.index(first)] = replace(first, average_hash_16="0" * 64)
    records[records.index(second)] = replace(second, average_hash_16="0" * 63 + "1")

    report = analyze_records(records, today=date(2026, 8, 16), near_threshold=1)

    assert report.status == "PASS"
    assert any(finding.code == "near_duplicate_within_test" for finding in report.findings)
