from __future__ import annotations

from typing import Any

from terra_research_node.water_cycle_acquisition import (
    PLANETARY_COMPUTER_LANDSAT_COLLECTION,
    PlanetaryComputerLandsatSearcher,
    _select_best,
    resolve_pack,
)


def _item(
    item_id: str,
    *,
    date: str,
    cloud: float,
    bbox: list[float] | None = None,
) -> dict[str, Any]:
    return {
        "id": item_id,
        "collection": "landsat-c2l2-sr",
        "bbox": bbox or [17.0, 52.0, 20.0, 55.0],
        "properties": {
            "datetime": f"{date}T10:00:00Z",
            "eo:cloud_cover": cloud,
            "platform": "landsat-8",
        },
        "links": [
            {
                "rel": "self",
                "href": f"https://landsatlook.usgs.gov/stac-server/collections/landsat-c2l2-sr/items/{item_id}",
            }
        ],
    }


def test_scene_selector_prefers_preferred_cloud_band() -> None:
    items = [
        _item("LC08_TEST_T1_SR", date="2020-04-20", cloud=20.0),
        _item("LC08_CLEAR_T1_SR", date="2020-03-05", cloud=10.0),
    ]
    selected = _select_best(
        items,
        lat=53.5,
        lon=19.0,
        year=2020,
        window=("03-01", "05-31"),
    )
    assert selected is not None
    assert selected["id"] == "LC08_CLEAR_T1_SR"


def test_scene_selector_prefers_tier_one_within_quality_band() -> None:
    items = [
        _item("LC08_NEAR_T2_SR", date="2020-04-15", cloud=5.0),
        _item("LC08_TIER1_T1_SR", date="2020-03-25", cloud=6.0),
    ]
    selected = _select_best(
        items,
        lat=53.5,
        lon=19.0,
        year=2020,
        window=("03-01", "05-31"),
    )
    assert selected is not None
    assert selected["id"] == "LC08_TIER1_T1_SR"


def test_scene_selector_rejects_cloudier_than_fallback() -> None:
    selected = _select_best(
        [_item("LC08_CLOUD_T1_SR", date="2020-04-15", cloud=31.0)],
        lat=53.5,
        lon=19.0,
        year=2020,
        window=("03-01", "05-31"),
    )
    assert selected is None


class FakeSearcher:
    def __init__(self) -> None:
        self.calls: list[tuple[float, float, int, tuple[str, str]]] = []

    def search(
        self,
        *,
        lat: float,
        lon: float,
        year: int,
        window: tuple[str, str],
    ) -> list[dict[str, Any]]:
        self.calls.append((lat, lon, year, window))
        return [_item(f"LC08_{year}_T1_SR", date=f"{year}-04-15", cloud=5.0)]


def _base_pack() -> dict[str, Any]:
    return {
        "pack_id": "T004-W30-0000001",
        "category": "green_water_rich",
        "region_id": "example",
        "sample_center": {"lat": 53.5, "lon": 19.0},
        "season": {
            "zone": "mid_latitude",
            "primary": "spring",
            "secondary": "autumn",
            "primary_window": ["03-01", "05-31"],
            "secondary_window": ["09-01", "11-30"],
        },
        "temporal": {
            "mode": "same_season_cross_year",
            "reference_year": 2000,
            "comparison_year": 2020,
            "year_gap": 20,
        },
    }


def test_same_season_pack_queries_same_window_across_years() -> None:
    searcher = FakeSearcher()
    resolved = resolve_pack(_base_pack(), searcher)
    assert resolved["status"] == "RESOLVED"
    assert [call[2:] for call in searcher.calls] == [
        (2000, ("03-01", "05-31")),
        (2020, ("03-01", "05-31")),
    ]


def test_within_year_pack_queries_spring_then_autumn() -> None:
    pack = _base_pack()
    pack["temporal"] = {
        "mode": "within_year_seasonal_response",
        "reference_year": 2020,
        "comparison_year": 2020,
        "year_gap": 0,
    }
    searcher = FakeSearcher()
    resolved = resolve_pack(pack, searcher)
    assert resolved["status"] == "RESOLVED"
    assert [call[2:] for call in searcher.calls] == [
        (2020, ("03-01", "05-31")),
        (2020, ("09-01", "11-30")),
    ]


def test_tropical_pack_requires_real_hydroclimatic_windows_without_search() -> None:
    pack = _base_pack()
    pack["sample_center"] = {"lat": -3.1, "lon": -60.0}
    pack["season"] = {
        "zone": "tropical",
        "primary": "hydrological_window_a",
        "secondary": "hydrological_window_b",
        "window_source": "derive from official precipitation climatology",
        "spring_autumn_label_allowed": False,
    }
    searcher = FakeSearcher()
    resolved = resolve_pack(pack, searcher)
    assert resolved["status"] == "NEEDS_HYDROCLIMATIC_WINDOW"
    assert searcher.calls == []


class _FakePlanetaryResponse:
    status_code = 200

    def __init__(self, body: dict[str, Any]) -> None:
        self.body = body

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self.body


class _FakePlanetarySession:
    def __init__(self, body: dict[str, Any]) -> None:
        self.body = body
        self.calls: list[dict[str, Any]] = []

    def post(self, endpoint: str, **kwargs: Any) -> _FakePlanetaryResponse:
        self.calls.append({"endpoint": endpoint, **kwargs})
        return _FakePlanetaryResponse(self.body)


def test_planetary_computer_search_is_thread_local_and_cached() -> None:
    feature = _item("LC08_PC_T1_SR", date="2020-04-15", cloud=4.0)
    searcher = PlanetaryComputerLandsatSearcher(request_delay_ms=0)
    session = _FakePlanetarySession({"type": "FeatureCollection", "features": [feature]})
    searcher._local.session = session

    first = searcher.search(
        lat=53.5, lon=19.0, year=2020, window=("03-01", "05-31")
    )
    second = searcher.search(
        lat=53.5, lon=19.0, year=2020, window=("03-01", "05-31")
    )

    assert first == second == [feature]
    assert len(session.calls) == 1
    assert session.calls[0]["json"]["collections"] == [
        PLANETARY_COMPUTER_LANDSAT_COLLECTION
    ]

