from __future__ import annotations

import json

import planetary_computer
import pystac_client
import rasterio

LAT = 53.591400
LON = 19.010717
BBOX = [LON - 0.03, LAT - 0.03, LON + 0.03, LAT + 0.03]

catalog = pystac_client.Client.open(
    "https://planetarycomputer.microsoft.com/api/stac/v1",
    modifier=planetary_computer.sign_inplace,
)
search = catalog.search(
    collections=["sentinel-1-grd"],
    bbox=BBOX,
    datetime="2021-05-01/2021-05-31",
    max_items=3,
)
items = list(search.items())
print("COUNT", len(items))
for item in items:
    print("ITEM", item.id)
    print("PROPS", json.dumps({k: item.properties.get(k) for k in ["datetime", "platform", "sar:instrument_mode", "sat:orbit_state", "sar:polarizations", "s1:resolution"]}, default=str))
    print("ASSETS", sorted(item.assets))
    for key, asset in item.assets.items():
        print("ASSET", key, asset.media_type, asset.roles, asset.href[:240])
    for key in ["vv", "vh", "hh", "hv"]:
        if key in item.assets:
            href = item.assets[key].href
            try:
                with rasterio.open(href) as src:
                    print("RASTER_OK", key, src.width, src.height, str(src.crs), src.transform, src.dtypes, src.nodata)
            except Exception as exc:
                print("RASTER_FAIL", key, repr(exc))
    break
