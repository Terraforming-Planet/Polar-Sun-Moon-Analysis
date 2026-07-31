# Copernicus frame-storage pipeline

This directory contains the first server-side stage for timestamped Earth-observation frames.

## Storage model

- Run the script inside Copernicus Data Space Ecosystem JupyterLab.
- Metadata and generated files are written under `mystorage/terraforming-planet/` by default.
- `mystorage` is working storage, not a permanent public CDN. The web application cannot read private Jupyter storage directly.
- A separate publication step must copy approved manifests/tiles to a public object store, API, or repository artifact.
- Never commit CDSE S3 access keys, OAuth tokens, cookies, or Jupyter credentials.

## Example

```bash
python copernicus_pipeline/build_frame_manifest.py \
  --bbox 14.0 49.0 24.2 54.9 \
  --start 2026-07-30T00:00:00Z \
  --end 2026-07-31T23:59:59Z \
  --collections sentinel-2-l2a sentinel-1-grd \
  --output mystorage/terraforming-planet/frames/poland-latest.json
```

When the repository is available in JupyterLab, an optional public copy can be created:

```bash
python copernicus_pipeline/build_frame_manifest.py \
  --bbox 14.0 49.0 24.2 54.9 \
  --start 2026-07-30T00:00:00Z \
  --end 2026-07-31T23:59:59Z \
  --public-copy web/public/data/copernicus/frames.json
```

## What the manifest guarantees

Every observation includes its published UTC timestamp, collection, footprint, cloud-cover metadata when available, and STAC/preview references. It explicitly marks that the data is not a continuous live stream.

## Next stages

1. Authenticated retrieval of selected assets through CDSE S3 or supported processing APIs.
2. Reprojection and generation of web map tiles.
3. Public serving endpoint with cache headers and access control.
4. Viewer playback that advances only between real timestamps.
5. Geostationary weather imagery for higher-frequency full-disc sequences.
