from __future__ import annotations

import sys

from terra_research_node.training004_sources.usgs_m2m import UsgsM2MClient


def main() -> int:
    client = UsgsM2MClient.from_env()
    if client is None:
        print("USGS M2M ENV MISSING")
        return 2
    try:
        _ = client.api_key
    except Exception as exc:  # noqa: BLE001
        print(f"USGS M2M LOGIN FAIL: {type(exc).__name__}: {exc}")
        return 1
    print("USGS M2M LOGIN OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
