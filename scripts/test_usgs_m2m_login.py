from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from terra_research_node.training004_sources.usgs_m2m import UsgsM2MClient  # noqa: E402


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
