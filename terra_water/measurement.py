from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.floating]
BoolArray = NDArray[np.bool_]
IntArray = NDArray[np.integer]

LANDSAT_SR_SCALE = 0.0000275
LANDSAT_SR_OFFSET = -0.2
LANDSAT_BAD_QA_BITS = (0, 1, 2, 3, 4, 5)
SENTINEL_BAD_SCL_CLASSES = (0, 1, 3, 8, 9, 10, 11)


@dataclass(frozen=True)
class WaterAreaMeasurement:
    threshold: float
    sensitivity: float
    valid_pixels: int
    central_water_pixels: int
    conservative_water_pixels: int
    upper_water_pixels: int
    pixel_area_m2: float
    central_area_m2: float
    conservative_area_m2: float
    upper_area_m2: float
    valid_area_m2: float

    @property
    def central_area_km2(self) -> float:
        return self.central_area_m2 / 1_000_000.0

    @property
    def conservative_area_km2(self) -> float:
        return self.conservative_area_m2 / 1_000_000.0

    @property
    def upper_area_km2(self) -> float:
        return self.upper_area_m2 / 1_000_000.0


def landsat_surface_reflectance(dn: NDArray[np.number]) -> FloatArray:
    """Convert Landsat Collection 2 Level-2 SR digital numbers to reflectance."""
    return np.asarray(dn, dtype=np.float64) * LANDSAT_SR_SCALE + LANDSAT_SR_OFFSET


def landsat_qa_valid_mask(qa_pixel: IntArray) -> BoolArray:
    """Return pixels clear of fill/cloud/cirrus/shadow/snow flags in QA_PIXEL."""
    qa = np.asarray(qa_pixel)
    bad = np.zeros(qa.shape, dtype=bool)
    for bit in LANDSAT_BAD_QA_BITS:
        bad |= (qa & (1 << bit)) != 0
    return ~bad


def sentinel_scl_valid_mask(scl: IntArray) -> BoolArray:
    """Mask Sentinel-2 L2A no-data, defective, shadow, cloud, cirrus and snow."""
    classes = np.asarray(scl)
    return ~np.isin(classes, SENTINEL_BAD_SCL_CLASSES)


def mndwi(
    green: NDArray[np.number],
    swir1: NDArray[np.number],
    valid_mask: NDArray[np.bool_] | None = None,
) -> FloatArray:
    """Compute Modified Normalized Difference Water Index (Green-SWIR1)."""
    green_f = np.asarray(green, dtype=np.float64)
    swir_f = np.asarray(swir1, dtype=np.float64)
    if green_f.shape != swir_f.shape:
        raise ValueError("green and swir1 arrays must have identical shapes")

    denominator = green_f + swir_f
    output = np.full(green_f.shape, np.nan, dtype=np.float64)
    finite = np.isfinite(green_f) & np.isfinite(swir_f) & (denominator != 0)
    if valid_mask is not None:
        mask = np.asarray(valid_mask, dtype=bool)
        if mask.shape != green_f.shape:
            raise ValueError("valid_mask must have the same shape as the spectral bands")
        finite &= mask
    output[finite] = (green_f[finite] - swir_f[finite]) / denominator[finite]
    return output


def measure_mndwi_water_area(
    index: NDArray[np.number],
    *,
    pixel_area_m2: float,
    threshold: float = 0.0,
    sensitivity: float = 0.1,
    analysis_mask: NDArray[np.bool_] | None = None,
) -> WaterAreaMeasurement:
    """Measure open-water area and a fixed threshold-sensitivity interval.

    The central estimate uses ``index > threshold``. The conservative estimate
    raises the threshold by ``sensitivity`` and the upper estimate lowers it by
    the same amount. This does not replace sensor/AOI-specific validation; it
    makes threshold uncertainty explicit instead of hiding it.
    """
    if pixel_area_m2 <= 0:
        raise ValueError("pixel_area_m2 must be positive")
    if sensitivity < 0:
        raise ValueError("sensitivity must be non-negative")

    values = np.asarray(index, dtype=np.float64)
    valid = np.isfinite(values)
    if analysis_mask is not None:
        mask = np.asarray(analysis_mask, dtype=bool)
        if mask.shape != values.shape:
            raise ValueError("analysis_mask must have the same shape as the index")
        valid &= mask

    central = valid & (values > threshold)
    conservative = valid & (values > threshold + sensitivity)
    upper = valid & (values > threshold - sensitivity)

    valid_pixels = int(np.count_nonzero(valid))
    central_pixels = int(np.count_nonzero(central))
    conservative_pixels = int(np.count_nonzero(conservative))
    upper_pixels = int(np.count_nonzero(upper))

    return WaterAreaMeasurement(
        threshold=threshold,
        sensitivity=sensitivity,
        valid_pixels=valid_pixels,
        central_water_pixels=central_pixels,
        conservative_water_pixels=conservative_pixels,
        upper_water_pixels=upper_pixels,
        pixel_area_m2=pixel_area_m2,
        central_area_m2=central_pixels * pixel_area_m2,
        conservative_area_m2=conservative_pixels * pixel_area_m2,
        upper_area_m2=upper_pixels * pixel_area_m2,
        valid_area_m2=valid_pixels * pixel_area_m2,
    )
