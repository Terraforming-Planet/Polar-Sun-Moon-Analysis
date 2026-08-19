from pathlib import Path

from terra_research_node.adapter_preflight import PROBES
from terra_research_node.public_adapter_harvest import ADAPTERS, _safe_asset_url

ROOT = Path(__file__).resolve().parents[1]


def test_public_adapter_preflight_uses_only_fixed_https_endpoints() -> None:
    assert len(PROBES) >= 8
    assert all(probe.public for probe in PROBES)
    assert all(probe.url.startswith("https://") for probe in PROBES)
    ids = {probe.id for probe in PROBES}
    assert {"nasa-gibs", "copernicus-stac", "usgs-landsat", "dea-stac", "inpe-stac"} <= ids


def test_additional_dataset_adapters_cover_australia_and_south_america() -> None:
    by_id = {adapter.id: adapter for adapter in ADAPTERS}
    assert "digital-earth-australia" in by_id
    assert "inpe-brazil-data-cube" in by_id
    assert "murray-darling" in by_id["digital-earth-australia"].region_ids
    assert "amazon-manaus" in by_id["inpe-brazil-data-cube"].region_ids
    assert "ga_ls8c_ard_3" in by_id["digital-earth-australia"].collections
    assert "AMZ1-WFI-L4-SR-1" in by_id["inpe-brazil-data-cube"].collections


def test_adapter_asset_allowlist_rejects_unrelated_hosts() -> None:
    assert _safe_asset_url("https://data.inpe.br/bdc/example/thumbnail.png")
    assert _safe_asset_url("https://explorer.dea.ga.gov.au/example.jpg")
    assert _safe_asset_url("https://dea-public-data.s3.ap-southeast-2.amazonaws.com/example.jpg")
    assert not _safe_asset_url("http://data.inpe.br/example.jpg")
    assert not _safe_asset_url("https://example.com/example.jpg")


def test_constellation_interface_is_english_and_marks_adapter_states() -> None:
    html = (ROOT / "web" / "public" / "constellation" / "index.html").read_text(
        encoding="utf-8"
    )
    javascript = (
        ROOT / "web" / "public" / "constellation" / "constellation.js"
    ).read_text(encoding="utf-8")
    source_registry = (
        ROOT / "web" / "public" / "data" / "tp26-global-sources.json"
    ).read_text(encoding="utf-8")

    assert '<html lang="en">' in html
    assert "Active environmental hazards" in html
    assert "Active adapter" in javascript
    assert '"id":"nasa-gibs"' in source_registry
    assert '"id":"australia-dea"' in source_registry
    assert '"id":"brazil-inpe"' in source_registry
