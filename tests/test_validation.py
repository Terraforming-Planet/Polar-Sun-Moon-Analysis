"""Tests for quality-control validation."""
import pandas as pd
import pytest
from polar_equinox_analysis.validation import ValidationError, validate_observations


def test_validation_rejects_missing_columns(tmp_path):
    """Missing required columns stop processing."""
    with pytest.raises(ValidationError):
        validate_observations(pd.DataFrame({'year': [2006]}), tmp_path / 'qc.md')


def test_validation_accepts_example_layout(tmp_path):
    """A complete numeric observation layout passes quality control."""
    data = pd.DataFrame({
        'year': [2006], 'season': ['vernal'], 'timestamp_utc': ['2006-03-20T00:00:00Z'],
        'pole': ['North Pole'], 'body': ['Sun'], 'apparent_altitude_deg': [0.0], 'declination_deg': [0.0]
    })
    assert validate_observations(data, tmp_path / 'qc.md') == []
