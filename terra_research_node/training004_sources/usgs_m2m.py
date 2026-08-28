from __future__ import annotations

import contextlib
import os
import threading
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


class UsgsM2MProviderError(UsgsM2MError):
    """Provider transport/policy failure, distinct from a JSON contract error."""


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


def _downloadable(option: dict[str, Any]) -> bool:
    """Accept either advertised immediate or bulk download availability."""
    if "available" not in option and "bulkAvailable" not in option:
        return True
    return bool(option.get("available") or option.get("bulkAvailable"))


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
        self._options_cache: dict[tuple[str, str], list[dict[str, Any]]] = {}
        # requests.Session and the M2M scene-list control plane are not thread-safe.
        # One re-entrant lock also provides single-flight token creation.
        self._control_lock = threading.RLock()

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
        with self._control_lock:
            return self._call_locked(endpoint, payload, authenticated=authenticated)

    def _call_locked(
        self,
        endpoint: str,
        payload: dict[str, Any] | None,
        *,
        authenticated: bool = True,
    ) -> Any:
        headers: dict[str, str] = {}
        if authenticated:
            headers["X-Auth-Token"] = self.api_key

        last_error: Exception | None = None
        for attempt in range(4):
            try:
                response = self.session.post(
                    f"{M2M_BASE}{endpoint}",
                    json=payload,
                    headers=headers,
                    timeout=self.timeout_s,
                )
                if response.status_code == 429 or response.status_code >= 500:
                    last_error = UsgsM2MProviderError(
                        f"USGS M2M {endpoint} provider HTTP {response.status_code}"
                    )
                    if attempt < 3:
                        time.sleep(2**attempt)
                        continue
                    break
                if response.status_code >= 400:
                    raise UsgsM2MProviderError(
                        f"USGS M2M {endpoint} provider HTTP {response.status_code} "
                        f"{response.reason}"
                    )
                body = cast(dict[str, Any], response.json())
                error_code = body.get("errorCode")
                if error_code is not None:
                    message = str(body.get("errorMessage") or "")
                    if error_code in {"AUTH_INVALID", "AUTH_UNAUTHORIZED"}:
                        raise UsgsM2MError(
                            f"USGS M2M {endpoint} failed: {error_code} {message}"
                        )
                    last_error = UsgsM2MError(
                        f"USGS M2M {endpoint} failed: {error_code} {message}"
                    )
                else:
                    return body.get("data")
            except UsgsM2MProviderError:
                raise
            except (requests.RequestException, ValueError) as exc:
                last_error = exc

            if attempt < 3:
                time.sleep(2**attempt)

        if isinstance(last_error, UsgsM2MError):
            raise last_error
        if isinstance(last_error, UsgsM2MProviderError):
            raise last_error
        detail = f": {last_error}" if last_error is not None else ""
        raise UsgsM2MProviderError(
            f"USGS M2M {endpoint} request failed after retries{detail}"
        ) from last_error

    @property
    def api_key(self) -> str:
        if self._api_key is not None:
            return self._api_key
        with self._control_lock:
            if self._api_key is None:
                data = self._call_locked(
                    "login-token",
                    {"username": self.username, "token": self.application_token},
                    authenticated=False,
                )
                if not isinstance(data, str) or not data:
                    raise UsgsM2MError("USGS M2M login-token returned no API key")
                self._api_key = data
            return self._api_key

    def signed_band_url(self, href: str) -> str:
        with self._control_lock:
            return self._signed_band_url_locked(href)

    def _signed_band_url_locked(self, href: str) -> str:
        dataset, display_id, band = parse_landsat_asset(href)
        cache_key = (display_id, band)
        cached = self._url_cache.get(cache_key)
        if cached is not None:
            return cached

        options = self._scene_options_locked(dataset, display_id)
        selected: dict[str, Any] | None = None
        seen_names: list[str] = []
        for option in options:
            name = str(option.get("productName") or option.get("displayId") or "")
            if name:
                seen_names.append(name)
            if _downloadable(option) and _matches_band(option, band):
                selected = option
                break

        if selected is None:
            sample = "; ".join(seen_names[:12]) or "no secondary download names returned"
            raise UsgsM2MError(
                f"USGS M2M did not expose downloadable individual band {band} for "
                f"{display_id}. Options: {sample}"
            )

        entity_id = selected.get("entityId")
        product_id = selected.get("id")
        if entity_id is None or product_id is None:
            raise UsgsM2MError("USGS M2M band option is missing entityId/product id")

        label = f"terra-t004-{uuid4().hex}"
        result = self._call(
            "download-request",
            {
                "downloads": [
                    {
                        "datasetName": dataset,
                        "entityId": str(entity_id),
                        "productId": str(product_id),
                    }
                ],
                "label": label,
            },
        )
        url = self._extract_url(result)
        if url is None and not self._pending(result):
            raise UsgsM2MError(
                "USGS M2M download-request returned neither an available nor pending download"
            )
        for attempt in range(18):
            if url is not None:
                self._url_cache[cache_key] = url
                return url
            time.sleep(min(5 + attempt * 2, 20))
            result = self._call("download-retrieve", {"label": label})
            url = self._extract_url(result)
            if url is None and not self._pending(result):
                raise UsgsM2MError(
                    "USGS M2M download-retrieve returned neither an available nor "
                    "pending download"
                )

        raise UsgsM2MError(
            f"USGS M2M band download not ready after polling for {display_id}/{band}"
        )

    def _scene_options_locked(self, dataset: str, display_id: str) -> list[dict[str, Any]]:
        cache_key = (dataset, display_id)
        cached = self._options_cache.get(cache_key)
        if cached is not None:
            return cached

        list_id = f"terra-t004-{uuid4().hex}"
        added = self._call(
            "scene-list-add",
            {
                "listId": list_id,
                "idField": "displayId",
                "entityIds": [display_id],
                "datasetName": dataset,
            },
        )
        if not isinstance(added, int) or added < 1:
            raise UsgsM2MError(
                f"USGS M2M could not resolve Landsat scene {display_id} in {dataset}"
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

        options: list[dict[str, Any]] = []
        for raw_product in products:
            if not isinstance(raw_product, dict):
                continue
            raw_options: list[Any] = [raw_product]
            secondary = raw_product.get("secondaryDownloads")
            if isinstance(secondary, list):
                raw_options.extend(secondary)
            for raw_option in raw_options:
                if not isinstance(raw_option, dict):
                    continue
                options.append(cast(dict[str, Any], raw_option))
        self._options_cache[cache_key] = options
        return options

    @staticmethod
    def _extract_url(result: Any) -> str | None:
        if not isinstance(result, dict):
            return None
        for key in ("availableDownloads", "available"):
            items = result.get(key)
            if not isinstance(items, list):
                continue
            for item in items:
                if isinstance(item, dict) and isinstance(item.get("url"), str):
                    return cast(str, item["url"])
        return None

    @staticmethod
    def _pending(result: Any) -> bool:
        if not isinstance(result, dict):
            return False
        return any(
            isinstance(result.get(key), list) and bool(result[key])
            for key in (
                "preparingDownloads",
                "requestedDownloads",
                "preparing",
                "requested",
            )
        )
