import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "sahara-station"
DOCS = ROOT / "docs" / "sahara-station"
DATA = ROOT / "data" / "training" / "paleoriver_8"


def test_sar_runtime_is_published_identically() -> None:
    web = (WEB / "sahara-sar-preview.js").read_text(encoding="utf-8")
    docs = (DOCS / "sahara-sar-preview.js").read_text(encoding="utf-8")

    assert web == docs
    assert "OPERA_L2_RTC_S1_V1_VV" in web
    assert "Sentinel-1 RTC dB Stretch" in web
    assert "buildSarQueryUrl" in web
    assert "buildSarExportUrl" in web
    assert "paleoriver_sentinel1_sar_8.json" in web


def test_sar_source_manifest_uses_official_public_services() -> None:
    source = json.loads((DATA / "sar_source_manifest_v1.json").read_text(encoding="utf-8"))

    assert source["sensor"] == "Sentinel-1 C-SAR"
    assert source["vv_image_service"].startswith("https://gis.earthdata.nasa.gov/")
    assert source["vh_image_service"].startswith("https://gis.earthdata.nasa.gov/")
    assert source["gibs_layer_metadata"].startswith("https://gibs.earthdata.nasa.gov/")
    assert source["copernicus_catalogue"] == "https://stac.dataspace.copernicus.eu/v1/"
    assert source["rendering"]["preview_feature_kind"] == (
        "rendered-preview-intensity-not-calibrated-backscatter"
    )


def test_eight_reference_labels_do_not_invent_paleochannel_ground_truth() -> None:
    payload = json.loads((DATA / "sar_reference_labels_v1.json").read_text(encoding="utf-8"))

    assert payload["count"] == 8
    assert len(payload["labels"]) == 8
    assert len({row["id"] for row in payload["labels"]}) == 8
    assert all(row["paleochannel_ground_truth"] == "not-labelled" for row in payload["labels"])
    assert all(row["reference"].startswith("https://") for row in payload["labels"])
    assert all(
        any(host in row["reference"] for host in ("usgs.gov", "esa.int", "nasa.gov"))
        for row in payload["labels"]
    )


def test_reference_and_source_json_are_published_with_web_docs_parity() -> None:
    for filename in ("sar_reference_labels_v1.json", "sar_source_manifest_v1.json"):
        web = (WEB / "paleoriver-tests" / filename).read_text(encoding="utf-8")
        docs = (DOCS / "paleoriver-tests" / filename).read_text(encoding="utf-8")
        assert web == docs
        json.loads(web)


def test_unified_training_v2_contains_sar_without_changing_historical_v1() -> None:
    runtime = (WEB / "sahara-training-records.js").read_text(encoding="utf-8")
    schema_v1 = json.loads((DATA / "unified_schema_v1.json").read_text(encoding="utf-8"))
    schema_v2 = json.loads((DATA / "unified_schema_v2.json").read_text(encoding="utf-8"))

    assert "./sahara-sar-preview.js" in runtime
    assert "ensureSar8" in runtime
    assert "sar_preview_mean_luma" in runtime
    assert "hydrologic_context_label" in runtime
    assert "paleochannel_ground_truth" in runtime
    assert schema_v1["sensor_status"]["sar"] == "not-yet-included"
    assert "OPERA RTC-S1" in schema_v2["sensor_status"]["sar"]
    assert "sar_preview_mean_luma" in schema_v2["groups"]["sar"]
    assert "paleochannel_ground_truth" in schema_v2["groups"]["reference_labels"]


def test_iteration_11_note_keeps_observation_separate_from_inference() -> None:
    note = (DATA / "research_note_iteration_11.md").read_text(encoding="utf-8")

    assert "does **not** claim temporal coincidence" in note
    assert "calibrated sigma0/gamma0 backscatter" in note
    assert "They are **not** calibrated" in note
    assert "paleochannel_ground_truth = not-labelled" in note
    assert "does not establish that the structure is a paleoriver" in note
