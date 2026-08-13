import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NETWORK = ROOT / "web" / "public" / "data" / "hydrology" / "gardeja-local-network.json"


def load_network() -> dict:
    return json.loads(NETWORK.read_text(encoding="utf-8"))


def test_network_tracks_requested_waterbodies_and_local_rivers() -> None:
    data = load_network()
    waterbodies = {item["display_name"] for item in data["waterbodies"]}
    rivers = {item["display_name"] for item in data["rivers_and_channels"]}

    assert "Staw w lesie" in waterbodies
    assert "Jezioro Kuchnia" in waterbodies
    assert "Mały akwen przy Jeziorze Kuchnia" in waterbodies
    assert "Jezioro Kamień" in waterbodies
    assert "Jezioro Nogat" in waterbodies
    assert "Gardęga / Gardeja" in rivers
    assert "Wandówka" in rivers
    assert "Cyganówka" in rivers
    assert "Kanał Łąkowy" in rivers
    assert "Ciek Polderowy" in rivers


def test_network_keeps_hypotheses_separate_from_confirmed_links() -> None:
    data = load_network()

    assert data["candidate_flow_chain"]["status"] == (
        "public_description_pending_official_geometry_verification"
    )
    assert "Do not extend this chain" in data["candidate_flow_chain"]["rule"]
    assert data["waterbodies"][0]["status"] == "field_report"
    assert "flag" in " ".join(data["investigation_plan"]).lower()
    assert "never as confirmed blockages" in " ".join(data["investigation_plan"]).lower()


def test_network_uses_public_official_sources_and_jrc_2024_history() -> None:
    data = load_network()
    sources = {item["name"]: item for item in data["sources"]}

    assert "Gmina Gardeja - Krajobraz" in sources
    assert "Wody Polskie - Hydroportal ISOK" in sources
    assert "Wody Polskie RZGW Gdańsk - river/channel maintenance record" in sources
    assert "EC JRC Global Surface Water" in sources
    assert any("1984-2024" in value for value in sources["EC JRC Global Surface Water"]["supports"])
