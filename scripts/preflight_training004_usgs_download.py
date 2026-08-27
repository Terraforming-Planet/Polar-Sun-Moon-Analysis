from __future__ import annotations

import contextlib
import os
from typing import Any, cast
from uuid import uuid4

from terra_research_node.training004_sources.usgs_m2m import (
    UsgsM2MClient,
    UsgsM2MError,
    UsgsM2MProviderError,
)

DATASET = "landsat_ot_c2_l2"


def _discover_probe_scene(client: UsgsM2MClient) -> tuple[str, str]:
    result = client._call(
        "scene-search",
        {
            "datasetName": DATASET,
            "maxResults": 5,
            "startingNumber": 1,
            "sceneFilter": {
                "acquisitionFilter": {
                    "start": "2025-01-01",
                    "end": "2025-12-31",
                },
                "spatialFilter": {
                    "filterType": "mbr",
                    "lowerLeft": {"latitude": 52.0, "longitude": 17.0},
                    "upperRight": {"latitude": 54.5, "longitude": 20.5},
                },
            },
        },
    )
    if not isinstance(result, dict):
        raise UsgsM2MError("USGS M2M scene-search returned no result object")
    raw_results = result.get("results")
    if not isinstance(raw_results, list) or not raw_results:
        raise UsgsM2MError("USGS M2M scene-search returned no Landsat probe scenes")
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        entity_id = item.get("entityId")
        display_id = item.get("displayId")
        if entity_id and display_id:
            return str(entity_id), str(display_id)
    raise UsgsM2MError("USGS M2M scene-search results lacked entityId/displayId")


def _check_download_options(client: UsgsM2MClient) -> None:
    entity_id, display_id = _discover_probe_scene(client)
    list_id = f"terra-t004-preflight-{uuid4().hex}"
    added = client._call(
        "scene-list-add",
        {
            "listId": list_id,
            "idField": "entityId",
            "entityIds": [entity_id],
            "datasetName": DATASET,
        },
    )
    if not isinstance(added, int) or added < 1:
        raise UsgsM2MError(
            f"USGS M2M could not add dynamically discovered probe scene {display_id}"
        )
    try:
        products = client._call(
            "download-options",
            {"listId": list_id, "datasetName": DATASET},
        )
    finally:
        with contextlib.suppress(Exception):
            client._call("scene-list-remove", {"listId": list_id})
    if not isinstance(products, list) or not products:
        raise UsgsM2MError(
            f"USGS M2M download-options returned no products for probe scene {display_id}"
        )
    available = [
        cast(dict[str, Any], item)
        for item in products
        if isinstance(item, dict)
        and (item.get("available") or item.get("bulkAvailable"))
    ]
    if not available:
        raise UsgsM2MError(
            f"USGS M2M returned products but none were downloadable for probe scene {display_id}"
        )


def main() -> int:
    username = os.getenv("USGS_USERNAME", "").strip()
    token = os.getenv("USGS_M2M_TOKEN", "").strip()
    if not username or not token:
        print("USGS_PREFLIGHT=BLOCKED reason=missing_credentials")
        return 20

    client = UsgsM2MClient(username, token)
    try:
        _ = client.api_key
        print("USGS_LOGIN=PASS")
        _check_download_options(client)
        print("USGS_SCENE_DISCOVERY=PASS")
        print("USGS_DOWNLOAD_OPTIONS=PASS")
        print("USGS_SCIENTIFIC_PIXEL_ACCESS=PASS")
        return 0
    except UsgsM2MProviderError as exc:
        message = str(exc)
        if "403" in message and "download-options" in message:
            print("USGS_LOGIN=PASS")
            print("USGS_SCENE_DISCOVERY=PASS")
            print("USGS_DOWNLOAD_OPTIONS=BLOCKED http=403")
            print(
                "ACTION_REQUIRED=ERS account must have M2M archive download permission."
            )
            return 21
        print(f"USGS_PROVIDER=BLOCKED detail={message}")
        return 22
    except UsgsM2MError as exc:
        print(f"USGS_M2M=BLOCKED detail={exc}")
        return 23


if __name__ == "__main__":
    raise SystemExit(main())
