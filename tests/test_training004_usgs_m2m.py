from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import pytest

from terra_research_node.training004_sources.usgs_m2m import (
    UsgsM2MClient,
    UsgsM2MError,
    UsgsM2MProviderError,
    _downloadable,
    _matches_band,
    parse_landsat_asset,
)


class FakeResponse:
    def __init__(
        self,
        status: int,
        body: dict[str, Any] | None = None,
        *,
        reason: str = "",
    ) -> None:
        self.status_code = status
        self._body = body
        self.reason = reason

    def json(self) -> dict[str, Any]:
        if self._body is None:
            raise ValueError("HTML response")
        return self._body


def test_login_token_response_is_cached_without_exposing_credential() -> None:
    client = UsgsM2MClient("ExactUser", "application-secret")
    calls: list[tuple[str, dict[str, Any], dict[str, str]]] = []

    def post(url: str, **kwargs: Any) -> FakeResponse:
        calls.append((url, kwargs["json"], kwargs["headers"]))
        return FakeResponse(200, {"data": "ephemeral-api-key", "errorCode": None})

    client.session.post = post  # type: ignore[method-assign]
    assert client.api_key == "ephemeral-api-key"
    assert client.api_key == "ephemeral-api-key"
    assert len(calls) == 1
    assert calls[0][1] == {"username": "ExactUser", "token": "application-secret"}
    assert "X-Auth-Token" not in calls[0][2]


def test_login_token_is_single_flight_across_workers() -> None:
    client = UsgsM2MClient("ExactUser", "application-secret")
    calls = 0
    calls_lock = threading.Lock()

    def post(url: str, **kwargs: Any) -> FakeResponse:
        nonlocal calls
        time.sleep(0.02)
        with calls_lock:
            calls += 1
        return FakeResponse(200, {"data": "one-api-key", "errorCode": None})

    client.session.post = post  # type: ignore[method-assign]
    with ThreadPoolExecutor(max_workers=16) as pool:
        keys = list(pool.map(lambda _: client.api_key, range(64)))
    assert keys == ["one-api-key"] * 64
    assert calls == 1


def test_asset_parser_resolves_display_id_and_exact_scientific_bands() -> None:
    root = (
        "https://landsatlook.usgs.gov/data/collection02/level-2/standard/oli-tirs/"
        "2025/189/023/LC08_L2SP_189023_20250308_20250312_02_T1/"
    )
    assert parse_landsat_asset(root + "LC08_L2SP_189023_20250308_20250312_02_T1_SR_B3.TIF") == (
        "landsat_ot_c2_l2",
        "LC08_L2SP_189023_20250308_20250312_02_T1",
        "SR_B3",
    )
    assert parse_landsat_asset(root + "LC08_L2SP_189023_20250308_20250312_02_T1_QA_PIXEL.TIF")[
        2
    ] == "QA_PIXEL"
    with pytest.raises(UsgsM2MError, match="Unsupported Landsat asset filename"):
        parse_landsat_asset(root + "preview.jpg")


@pytest.mark.parametrize(
    ("option", "expected"),
    [
        ({"available": True, "bulkAvailable": False}, True),
        ({"available": False, "bulkAvailable": True}, True),
        ({"available": False, "bulkAvailable": False}, False),
        ({}, True),
    ],
)
def test_available_and_bulk_available_are_both_honored(
    option: dict[str, Any], expected: bool
) -> None:
    assert _downloadable(option) is expected


def test_exact_qa_and_surface_reflectance_matching_rejects_preview() -> None:
    assert _matches_band({"productName": "Pixel Quality Assessment QA_PIXEL"}, "QA_PIXEL")
    assert _matches_band({"productName": "Surface Reflectance Band 3"}, "SR_B3")
    assert not _matches_band({"productName": "Reduced Resolution Browse"}, "SR_B3")
    assert not _matches_band({"productName": "Thumbnail QA preview"}, "QA_PIXEL")


def test_response_buckets_immediate_and_preparing_flow() -> None:
    immediate = {"availableDownloads": [{"url": "https://download.example/science.tif"}]}
    assert UsgsM2MClient._extract_url(immediate) == "https://download.example/science.tif"
    assert not UsgsM2MClient._pending(immediate)
    assert UsgsM2MClient._pending({"preparingDownloads": [{"downloadId": 123}]})
    assert UsgsM2MClient._pending({"requestedDownloads": [{"downloadId": "123"}]})
    assert UsgsM2MClient._extract_url({"requestedDownloads": [{"url": "preview"}]}) is None


def test_scene_download_options_are_reused_across_band_requests() -> None:
    client = UsgsM2MClient("user", "application-token")
    client._api_key = "ephemeral-key"
    calls: list[str] = []

    def call(endpoint: str, payload: dict[str, Any] | None, **kwargs: Any) -> Any:
        calls.append(endpoint)
        if endpoint == "scene-list-add":
            return 1
        if endpoint == "download-options":
            return [
                {
                    "secondaryDownloads": [
                        {
                            "productName": "Pixel Quality Assessment QA_PIXEL",
                            "entityId": "entity-qa",
                            "id": "product-qa",
                            "available": True,
                        },
                        {
                            "productName": "Surface Reflectance Band 3",
                            "entityId": "entity-b3",
                            "id": "product-b3",
                            "available": True,
                        },
                    ]
                }
            ]
        if endpoint == "scene-list-remove":
            return 1
        if endpoint == "download-request":
            assert payload is not None
            product_id = payload["downloads"][0]["productId"]
            return {"availableDownloads": [{"url": f"https://download.example/{product_id}"}]}
        raise AssertionError(endpoint)

    client._call = call  # type: ignore[method-assign]
    root = (
        "https://landsatlook.usgs.gov/data/collection02/level-2/standard/oli-tirs/"
        "2025/189/023/LC08_L2SP_189023_20250308_20250312_02_T1/"
    )
    qa_url = client.signed_band_url(
        root + "LC08_L2SP_189023_20250308_20250312_02_T1_QA_PIXEL.TIF"
    )
    band_url = client.signed_band_url(
        root + "LC08_L2SP_189023_20250308_20250312_02_T1_SR_B3.TIF"
    )
    assert qa_url.endswith("product-qa")
    assert band_url.endswith("product-b3")
    assert calls.count("scene-list-add") == 1
    assert calls.count("download-options") == 1
    assert calls.count("scene-list-remove") == 1
    assert calls.count("download-request") == 2


def test_provider_http_error_preserves_endpoint_and_status_without_secrets() -> None:
    client = UsgsM2MClient("user", "do-not-log-this")
    client._api_key = "also-secret"
    client.session.post = lambda *args, **kwargs: FakeResponse(  # type: ignore[method-assign]
        403, None, reason="Forbidden"
    )
    with pytest.raises(UsgsM2MProviderError) as caught:
        client._call("download-options", {"listId": "safe-id"})
    message = str(caught.value)
    assert "download-options" in message
    assert "403 Forbidden" in message
    assert "do-not-log-this" not in message
    assert "also-secret" not in message
