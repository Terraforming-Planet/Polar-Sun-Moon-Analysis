from __future__ import annotations

import contextlib
import os
import time
from pathlib import PurePosixPath
from typing import Any, cast
from urllib.parse import urlparse
from uuid import uuid4

import requests

M2M_BASE = "https://m2m.cr.usgs.gov/api/api/json/stable/"
DATASET_BY_PREFIX = {
    "LT04": "landsat_tm_c2_l2",
    "LT05": "landsat_tm_c2_l2",
    "LE07": "landsat_etm_c2_l2",
    "LC08": "landsat_ot_c2_l2",
    "LC09": "landsat_ot_c2_l2",
}


class UsgsM2MError(RuntimeError):
    pass


def parse_landsat_asset(href: str) -> tuple[str, str, str]:
    path = PurePosixPath(urlparse(href).path)
    display_id = path.parent.name
    filename = path.name.upper()
    dataset = DATASET_BY_PREFIX.get(display_id[:4].upper())
    if dataset is None:
        raise UsgsM2MError(f"Unsupported Landsat display id: {display_id}")
    if filename.endswith("_QA_PIXEL.TIF"):
        band = "QA_PIXEL"
    else:
        marker = "_SR_B"
        index = filename.rfind(marker)
        if index < 0 or not filename.endswith(".TIF"):
            raise UsgsM2MError(f"Unsupported Landsat asset filename: {path.name}")
        band = filename[index + 1 : -4]
    return dataset, display_id, band


def _matches_band(option: dict[str, Any], band: str) -> bool:
    text = " ".join(
        str(option.get(key, ""))
        for key in ("productName", "displayId", "entityId", "id")
    ).lower()
    if band == "QA_PIXEL":
        return any(
            phrase in text
            for phrase in ("qa_pixel", "qa pixel", "pixel quality", "quality assessment")
        )
    if band.startswith("SR_B"):
        number = band.removeprefix("SR_B")
        return (
            band.lower() in text
            or ("surface reflectance" in text and f"band {number}" in text)
        )
    return False


class UsgsM2MClient:
    def __init__(self, username: str, application_token: str, *, timeout_s: float = 60.0) -> None:
        if not username or not application_token:
            raise ValueError("USGS username and M2M application token are required")
        self.username = username
        self.application_token = application_token
        self.timeout_s = timeout_s
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Content-Type": "application/json",
                "User-Agent": "TerraObservationSystem-Training004/1.0 (+public-research)",
            }
        )
        self._api_key: str | None = None
        self._url_cache: dict[tuple[str, str], str] = {}

    @classmethod
    def from_env(cls) -> UsgsM2MClient | None:
        username = os.getenv("USGS_USERNAME", "").strip()
        token = os.getenv("USGS_M2M_TOKEN", "").strip()
        if not username or not token:
            return None
        return cls(username, token)

    def _call(
        self,
        endpoint: str,
        payload: dict[str, Any] | None,
        *,
        authenticated: bool = True,
    ) -> Any:
        headers: dict[str, str] = {}
        if authenticated:
            headers["X-Auth-Token"] = self.api_key
        response = self.session.post(
            f"{M2M_BASE}{endpoint}",
            json=payload,
            headers=headers,
            timeout=self.timeout_s,
        )
        response.raise_for_status()
        body = cast(dict[str, Any], response.json())
        if body.get("errorCode") is not None:
            raise UsgsM2MError(
                f"USGS M2M {endpoint} failed: {body.get('errorCode')} "
                f"{body.get('errorMessage')}"
            )
        return body.get("data")

    @property
    def api_key(self) -> str:
        if self._api_key is None:
            data = self._call(
                "login-token",
                {"username": self.username, "token": self.application_token},
                authenticated=False,
            )
            if not isinstance(data, str) or not data:
                raise UsgsM2MError("USGS M2M login-token returned no API key")
            self._api_key = data
        return self._api_key

    def signed_band_url(self, href: str) -> str:
        dataset, display_id, band = parse_landsat_asset(href)
        cache_key = (display_id, band)
        cached = self._url_cache.get(cache_key)
        if cached is not None:
            return cached

        list_id = f"terra-t004-{uuid4().hex}"
        self._call(
            "scene-list-add",
            {
                "listId": list_id,
                "idField": "displayId",
                "entityIds": [display_id],
                "datasetName": dataset,
            },
        )
        try:
            products = self._call(
                "download-options",
                {"listId": list_id, "datasetName": dataset},
            )
        finally:
            with contextlib.suppress(requests.RequestException, UsgsM2MError):
                self._call("scene-list-remove", {"listId": list_id})

        if not isinstance(products, list):
            raise UsgsM2MError("USGS M2M download-options returned no product list")
        selected: dict[str, Any] | None = None
        for raw_product in products:
            if not isinstance(raw_product, dict):
                continue
            secondary = raw_product.get("secondaryDownloads")
            if not isinstance(secondary, list):
                continue
            for raw_option in secondary:
                if not isinstance(raw_option, dict):
                    continue
                option = cast(dict[str, Any], raw_option)
                if option.get("available", True) and _matches_band(option, band):
                    selected = option
                    break
            if selected is not None:
                break
        if selected is None:
            raise UsgsM2MError(
                f"USGS M2M did not expose individual band {band} for {display_id}"
            )

        entity_id = selected.get("entityId")
        product_id = selected.get("id")
        if not isinstance(entity_id, str) or not isinstance(product_id, str):
            raise UsgsM2MError("USGS M2M band option is missing entityId/product id")

        label = f"terra-t004-{uuid4().hex}"
        result = self._call(
            "download-request",
            {
                "downloads": [{"entityId": entity_id, "productId": product_id}],
                "label": label,
                "returnAvailable": True,
            },
        )
        url = self._extract_url(result)
        for _ in range(12):
            if url is not None:
                self._url_cache[cache_key] = url
                return url
            time.sleep(5)
            result = self._call("download-retrieve", {"label": label})
            url = self._extract_url(result)
        raise UsgsM2MError(f"USGS M2M band download not ready for {display_id}/{band}")

    @staticmethod
    def _extract_url(result: Any) -> str | None:
        if not isinstance(result, dict):
            return None
        for key in ("availableDownloads", "available", "requested"):
            items = result.get(key)
            if not isinstance(items, list):
                continue
            for item in items:
                if isinstance(item, dict) and isinstance(item.get("url"), str):
                    return cast(str, item["url"])
        return None
