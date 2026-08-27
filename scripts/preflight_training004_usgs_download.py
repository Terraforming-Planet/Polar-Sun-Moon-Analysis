from __future__ import annotations

import os
import sys

from terra_research_node.training004_sources.usgs_m2m import (
    UsgsM2MClient,
    UsgsM2MError,
    UsgsM2MProviderError,
)

# A stable Landsat Collection 2 Level-2 scene/band path used only to verify that
# the authenticated account is allowed to request scientific download options.
PROBE_HREF = (
    "https://landsatlook.usgs.gov/data/collection02/level-2/standard/tm/1996/109/023/"
    "LT05_L2SP_109023_19960416_20210123_02_T1/"
    "LT05_L2SP_109023_19960416_20210123_02_T1_QA_PIXEL.TIF"
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
        url = client.signed_band_url(PROBE_HREF)
        if not url.startswith("https://"):
            print("USGS_PREFLIGHT=BLOCKED reason=invalid_download_url")
            return 20
        print("USGS_DOWNLOAD_OPTIONS=PASS")
        print("USGS_SCIENTIFIC_PIXEL_ACCESS=PASS")
        return 0
    except UsgsM2MProviderError as exc:
        message = str(exc)
        if "403" in message and "download-options" in message:
            print("USGS_LOGIN=PASS")
            print("USGS_DOWNLOAD_OPTIONS=BLOCKED http=403")
            print(
                "ACTION_REQUIRED=ERS account must have M2M API data-access permission; "
                "an Application Token alone does not grant archive download access."
            )
            return 21
        print(f"USGS_PROVIDER=BLOCKED detail={message}")
        return 22
    except UsgsM2MError as exc:
        print(f"USGS_M2M=BLOCKED detail={exc}")
        return 23


if __name__ == "__main__":
    raise SystemExit(main())
