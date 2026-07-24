from __future__ import annotations

import json

import requests

ENDPOINTS = {
    "stac": "https://stac.dataspace.copernicus.eu/v1/",
    "openeo": "https://openeo.dataspace.copernicus.eu/.well-known/openeo",
}


def main() -> int:
    results: dict[str, object] = {}
    failures = 0
    for name, url in ENDPOINTS.items():
        try:
            response = requests.get(url, timeout=30)
            results[name] = {"url": url, "status": response.status_code, "ok": response.ok}
            if not response.ok:
                failures += 1
        except requests.RequestException as exc:
            results[name] = {"url": url, "ok": False, "error": str(exc)}
            failures += 1
    print(json.dumps(results, indent=2))
    if not results.get("stac", {}).get("ok", False):
        raise SystemExit("The required CDSE STAC endpoint is unavailable")
    if failures:
        print("Warning: an optional CDSE endpoint is unavailable; STAC pipeline can continue.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
