from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from importlib import import_module
from typing import Any, Protocol, cast
from urllib.parse import urlparse

import numpy as np
import requests

from .common import AssetRef, EvidenceClass, GateState
from .usgs_m2m import UsgsM2MClient, UsgsM2MError

SR_SCALE = 0.0000275
SR_OFFSET = -0.2
REQUIRED_SEMANTICS = ("green", "red", "nir", "swir1", "qa_pixel")
USGS_LANDSATLOOK_HOST = "landsatlook.usgs.gov"
USGS_LANDSATLOOK_DATA_PREFIX = "/data/"
USGS_LANDSAT_S3_PREFIX = "s3://usgs-landsat/"

MISSION_BANDS: dict[str, dict[str, tuple[str, ...]]] = {
    "landsat-4": {
        "green": ("green", "SR_B2"),
        "red": ("red", "SR_B3"),
        "nir": ("nir08", "SR_B4"),
        "swir1": ("swir16", "SR_B5"),
    },
    "landsat-5": {
        "green": ("green", "SR_B2"),
        "red": ("red", "SR_B3"),
        "nir": ("nir08", "SR_B4"),
        "swir1": ("swir16", "SR_B5"),
    },
    "landsat-7": {
        "green": ("green", "SR_B2"),
        "red": ("red", "SR_B3"),
        "nir": ("nir08", "SR_B4"),
        "swir1": ("swir16", "SR_B5"),
    },
    "landsat-8": {
        "green": ("green", "SR_B3"),
        "red": ("red", "SR_B4"),
        "nir": ("nir08", "SR_B5"),
        "swir1": ("swir16", "SR_B6"),
    },
    "landsat-9": {
        "green": ("green", "SR_B3"),
        "red": ("red", "SR_B4"),
        "nir": ("nir08", "SR_B5"),
        "swir1": ("swir16", "SR_B6"),
    },
}


class RasterBackend(Protocol):
    def read(self, href: str, bbox: tuple[float, float, float, float], size: int) -> np.ndarray: ...


def official_cloud_href(href: str) -> str:
    """Map the USGS STAC HTTPS data facade to the official requester-pays S3 object."""
    parsed = urlparse(href)
    if (
        parsed.scheme in {"http", "https"}
        and parsed.hostname == USGS_LANDSATLOOK_HOST
        and parsed.path.startswith(USGS_LANDSATLOOK_DATA_PREFIX)
    ):
        key = parsed.path.removeprefix(USGS_LANDSATLOOK_DATA_PREFIX).lstrip("/")
        return f"{USGS_LANDSAT_S3_PREFIX}{key}"
    return href


def _asset_aliases(key: str, raw: Mapping[str, Any]) -> set[str]:
    aliases = {key.lower()}
    title = raw.get("title")
    if isinstance(title, str):
        aliases.add(title.lower())
    bands = raw.get("eo:bands") or raw.get("raster:bands")
    if isinstance(bands, list):
        for band in bands:
            if isinstance(band, dict):
                for field in ("name", "common_name"):
                    value = band.get(field)
                    if isinstance(value, str):
                        aliases.add(value.lower())
    return aliases


def semantic_assets(item: Mapping[str, Any]) -> dict[str, AssetRef]:
    properties = item.get("properties")
    platform = (
        str(properties.get("platform", "")).lower().replace("_", "-")
        if isinstance(properties, dict)
        else ""
    )
    mission = next((name for name in MISSION_BANDS if name in platform), "")
    if not mission:
        raise ValueError(f"Unsupported or missing Landsat platform: {platform or 'UNKNOWN'}")
    raw_assets = item.get("assets")
    if not isinstance(raw_assets, dict):
        raise ValueError("STAC item has no assets object")
    mapped: dict[str, AssetRef] = {}
    candidates = dict(MISSION_BANDS[mission])
    candidates["qa_pixel"] = ("qa_pixel", "QA_PIXEL")
    for semantic, wanted in candidates.items():
        wanted_lower = {value.lower() for value in wanted}
        for key, value in raw_assets.items():
            if not isinstance(value, dict) or not (_asset_aliases(str(key), value) & wanted_lower):
                continue
            href = value.get("href")
            if not isinstance(href, str) or urlparse(href).scheme not in {"https", "http", "s3"}:
                continue
            mapped[semantic] = AssetRef(
                str(key),
                href,
                cast(str | None, value.get("title")),
                cast(str | None, value.get("type")),
            )
            break
    missing = set(REQUIRED_SEMANTICS) - mapped.keys()
    if missing:
        raise ValueError(
            f"Required Landsat assets absent after schema inspection: {sorted(missing)}"
        )
    return mapped


def decode_qa_pixel(qa: np.ndarray, *, landsat7_slc_off: bool = False) -> dict[str, np.ndarray]:
    qa_u = qa.astype(np.uint16, copy=False)
    fill = (qa_u & 1) != 0
    dilated_cloud = (qa_u & (1 << 1)) != 0
    cloud = (qa_u & (1 << 3)) != 0
    shadow = (qa_u & (1 << 4)) != 0
    snow = (qa_u & (1 << 5)) != 0
    invalid = fill | dilated_cloud | cloud | shadow
    sensor_artifact = fill.copy() if landsat7_slc_off else np.zeros_like(fill)
    invalid |= sensor_artifact
    return {
        "valid": ~invalid,
        "fill": fill,
        "cloud": cloud | dilated_cloud,
        "shadow": shadow,
        "snow": snow,
        "sensor_artifact": sensor_artifact,
    }


@dataclass(frozen=True)
class QualityResult:
    state: GateState
    valid_pixel_ratio: float
    statistics: dict[str, float]
    reason: str | None


def quality_gate(
    qa: np.ndarray, *, landsat7_slc_off: bool = False, minimum_valid_ratio: float = 0.70
) -> QualityResult:
    masks = decode_qa_pixel(qa, landsat7_slc_off=landsat7_slc_off)
    stats = {name: float(mask.mean()) for name, mask in masks.items()}
    ratio = stats["valid"]
    if ratio < minimum_valid_ratio:
        return QualityResult(GateState.UNAVAILABLE, ratio, stats, "optical_unavailable")
    state = GateState.READY if stats["cloud"] <= 0.15 else GateState.FALLBACK_READY
    return QualityResult(state, ratio, stats, None)


def _aws_credentials_available() -> bool:
    return bool(
        os.getenv("AWS_ACCESS_KEY_ID")
        or os.getenv("AWS_PROFILE")
        or os.getenv("AWS_WEB_IDENTITY_TOKEN_FILE")
    )


class RasterioCogBackend:
    """Read AOI windows from official USGS C2 assets via AWS or authenticated M2M."""

    def __init__(self) -> None:
        self.m2m = UsgsM2MClient.from_env()

    def _access_href(self, catalog_href: str) -> tuple[str, bool]:
        cloud_href = official_cloud_href(catalog_href)
        if not cloud_href.startswith(USGS_LANDSAT_S3_PREFIX):
            return cloud_href, False
        if _aws_credentials_available():
            return cloud_href, True
        if self.m2m is not None:
            return self.m2m.signed_band_url(catalog_href), False
        raise RuntimeError(
            "USGS Landsat scientific access requires either AWS requester-pays credentials "
            "or USGS_USERNAME + USGS_M2M_TOKEN. Preview imagery is not accepted."
        )

    def read(self, href: str, bbox: tuple[float, float, float, float], size: int) -> np.ndarray:
        try:
            rasterio = import_module("rasterio")
            RasterioIOError = import_module("rasterio.errors").RasterioIOError
            Resampling = import_module("rasterio.enums").Resampling
            transform_bounds = import_module("rasterio.warp").transform_bounds
            from_bounds = import_module("rasterio.windows").from_bounds
        except ImportError as exc:
            raise RuntimeError("rasterio is required for scientific COG window reads") from exc

        try:
            access_href, requester_pays = self._access_href(href)
        except (requests.RequestException, UsgsM2MError) as exc:
            raise RuntimeError("Authenticated USGS M2M individual-band resolution failed") from exc

        env: dict[str, str] = {
            "GDAL_HTTP_MULTIRANGE": "YES",
            "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        }
        if requester_pays:
            env.update({"AWS_REQUEST_PAYER": "requester", "AWS_REGION": "us-west-2"})

        try:
            with rasterio.Env(**env), rasterio.open(access_href) as dataset:
                bounds = transform_bounds("EPSG:4326", dataset.crs, *bbox, densify_pts=21)
                window = (
                    from_bounds(*bounds, transform=dataset.transform).round_offsets().round_lengths()
                )
                return cast(
                    np.ndarray,
                    dataset.read(
                        1,
                        window=window,
                        out_shape=(size, size),
                        resampling=Resampling.nearest,
                        masked=True,
                    ),
                )
        except RasterioIOError as exc:
            raise RuntimeError("Official USGS Landsat scientific raster read failed") from exc


def read_scientific_window(
    item: Mapping[str, Any],
    bbox: tuple[float, float, float, float],
    backend: RasterBackend,
    *,
    size: int = 512,
) -> dict[str, Any]:
    assets = semantic_assets(item)
    properties = item.get("properties")
    platform = (
        str(properties.get("platform", "unknown")) if isinstance(properties, dict) else "unknown"
    )
    acquired = str(properties.get("datetime", "")) if isinstance(properties, dict) else ""
    slc_off = "landsat-7" in platform.lower() and acquired[:10] > "2003-05-30"
    qa = backend.read(assets["qa_pixel"].href, bbox, size)
    gate = quality_gate(np.asarray(qa), landsat7_slc_off=slc_off)
    provenance = {
        semantic: {
            "asset_key": asset.key,
            "catalog_href": asset.href,
            "cloud_href": official_cloud_href(asset.href),
            "access_policy": "AWS_requester_pays_or_USGS_M2M_individual_band",
        }
        for semantic, asset in assets.items()
    }
    if gate.state == GateState.UNAVAILABLE:
        return {
            "state": gate.state.value,
            "evidence_class": EvidenceClass.UNKNOWN.value,
            "reason": gate.reason,
            "quality": gate.statistics,
            "valid_pixel_ratio": gate.valid_pixel_ratio,
            "assets": provenance,
        }
    masks = decode_qa_pixel(np.asarray(qa), landsat7_slc_off=slc_off)
    bands: dict[str, np.ndarray] = {}
    for semantic in ("green", "red", "nir", "swir1"):
        raw = np.asarray(backend.read(assets[semantic].href, bbox, size), dtype=np.float32)
        scaled = raw * SR_SCALE + SR_OFFSET
        bands[semantic] = np.where(masks["valid"], scaled, np.nan)
    return {
        "state": gate.state.value,
        "evidence_class": EvidenceClass.OBSERVATION.value,
        "bands": bands,
        "quality": gate.statistics,
        "valid_pixel_ratio": gate.valid_pixel_ratio,
        "assets": provenance,
        "platform": platform,
        "native_resolution_m": 30,
        "processing_level": "Collection 2 Level-2 Surface Reflectance",
        "scale": SR_SCALE,
        "offset": SR_OFFSET,
        "slc_off_masked": slc_off,
    }
