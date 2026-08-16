from __future__ import annotations

import numpy as np
import pytest

from terra_water.measurement import (
    landsat_qa_valid_mask,
    landsat_surface_reflectance,
    measure_mndwi_water_area,
    mndwi,
    sentinel_scl_valid_mask,
)


def test_landsat_surface_reflectance_scaling() -> None:
    values = landsat_surface_reflectance(np.array([0, 10_000], dtype=np.uint16))
    assert values[0] == pytest.approx(-0.2)
    assert values[1] == pytest.approx(0.075)


def test_landsat_qa_masks_bad_bits() -> None:
    qa = np.array([0, 1 << 3, 1 << 4, 1 << 5, 1 << 6], dtype=np.uint16)
    assert landsat_qa_valid_mask(qa).tolist() == [True, False, False, False, True]


def test_sentinel_scl_masks_cloud_shadow_and_snow() -> None:
    scl = np.array([2, 3, 4, 6, 8, 9, 10, 11], dtype=np.uint8)
    assert sentinel_scl_valid_mask(scl).tolist() == [
        True,
        False,
        True,
        True,
        False,
        False,
        False,
        False,
    ]


def test_mndwi_uses_green_and_swir() -> None:
    green = np.array([[0.4, 0.1], [0.3, 0.2]])
    swir = np.array([[0.1, 0.3], [0.3, 0.2]])
    index = mndwi(green, swir)
    assert index[0, 0] == pytest.approx(0.6)
    assert index[0, 1] == pytest.approx(-0.5)
    assert index[1, 0] == pytest.approx(0.0)


def test_area_measurement_exposes_threshold_uncertainty() -> None:
    index = np.array([[0.3, 0.05], [-0.02, -0.3]])
    result = measure_mndwi_water_area(
        index,
        pixel_area_m2=900.0,
        threshold=0.0,
        sensitivity=0.1,
    )
    assert result.central_water_pixels == 2
    assert result.conservative_water_pixels == 1
    assert result.upper_water_pixels == 3
    assert result.central_area_m2 == pytest.approx(1800.0)
    assert result.conservative_area_m2 == pytest.approx(900.0)
    assert result.upper_area_m2 == pytest.approx(2700.0)


def test_analysis_mask_limits_measurement_zone() -> None:
    index = np.ones((2, 2), dtype=float)
    mask = np.array([[True, False], [True, False]])
    result = measure_mndwi_water_area(index, pixel_area_m2=100.0, analysis_mask=mask)
    assert result.valid_pixels == 2
    assert result.central_water_pixels == 2
    assert result.central_area_m2 == pytest.approx(200.0)
