# CDSE + NASA + GitHub Pages automation architecture

## Verified platform capabilities

The Copernicus Data Space Ecosystem account is usable for this project through JupyterLab and the official APIs. CDSE provides STAC, OData, S3, Sentinel Hub and openEO interfaces. JupyterLab includes a persistent `mystorage` area, but the notebook server is not a permanent 24/7 worker: it shuts down after inactivity. Therefore JupyterLab is suitable for development, processing, caching and manual or attended runs, but it must not be the only scheduler for a public automatic warning service.

Store the cloned repository and all persistent working data under:

```text
~/mystorage/Polar-Sun-Moon-Analysis
```

Files outside `mystorage` can disappear after a Jupyter session ends.

## Required hybrid design

Use two synchronized execution paths:

### 1. CDSE JupyterLab processing path

Purpose:

- search Sentinel products through CDSE STAC;
- process Sentinel-1 and Sentinel-2 data;
- keep raw downloads, temporary rasters, caches and notebooks in `mystorage`;
- generate only small web-ready outputs for the public site;
- commit and push generated manifests, GeoJSON and previews to GitHub.

Persistent CDSE layout:

```text
~/mystorage/Polar-Sun-Moon-Analysis/
~/mystorage/terraforming-data/raw/
~/mystorage/terraforming-data/cache/
~/mystorage/terraforming-data/processed/
~/mystorage/terraforming-data/logs/
```

Do not commit large Sentinel archives, NetCDF files, SAFE products or full GeoTIFF scenes to GitHub.

### 2. GitHub Actions publication path

Purpose:

- run on a schedule even when the CDSE Jupyter server is stopped;
- fetch public NASA and USGS feeds;
- optionally call authenticated CDSE APIs using repository secrets;
- validate and merge all source manifests;
- build the Vite site;
- deploy GitHub Pages automatically.

This path is required because CDSE JupyterLab sessions stop after inactivity and cannot guarantee uninterrupted monitoring.

## Official data sources

### Base Earth imagery

- NASA GIBS VIIRS true-colour global image.
- Blue Marble fallback only when no current frame is available.

### Fires

- NASA FIRMS VIIRS/MODIS active-fire API.
- Optional geostationary products where officially available.
- EONET is a catalogue of events and must remain visually separate from measured FIRMS detections.

### Floods

- Copernicus Sentinel-1 GRD scenes discovered through CDSE STAC.
- Use before/after SAR processing only for real scenes covering the selected area.
- Output a derived flood extent with source scene IDs, timestamps and processing method.
- Never claim water depth unless a real depth product exists.

### Earthquakes

- USGS earthquake feed for epicentres, magnitude, depth and time.
- Sentinel-1 InSAR products only where suitable before/after SLC observations exist.
- Do not describe USGS points as satellite detections.

### Polar monitoring

- Sentinel-1 SAR and Sentinel-2 where light/cloud conditions permit.
- NASA GIBS and documented ice/snow products.
- Use polar projections for regional products and do not stretch them over the whole globe.

## CDSE access method

Use the current STAC endpoint:

```text
https://stac.dataspace.copernicus.eu/v1/
```

Recommended discovery flow:

1. Search STAC without downloading data.
2. Store returned item IDs, collection, geometry, sensing time and asset metadata.
3. Download or process only new products.
4. Use OAuth2/Sentinel Hub client credentials or CDSE S3 credentials through environment variables.
5. Never commit secrets to GitHub or notebooks.

Required environment variables:

```text
CDSE_CLIENT_ID
CDSE_CLIENT_SECRET
CDSE_S3_ACCESS_KEY
CDSE_S3_SECRET_KEY
NASA_FIRMS_MAP_KEY
```

For GitHub synchronization use one of:

- GitHub CLI authentication stored in the Jupyter user environment;
- an SSH deploy key with write access to this repository;
- a fine-grained token stored outside the repository.

Never write a GitHub token into a notebook cell or committed `.env` file.

## Output contract for GitHub Pages

Only these web-ready files should be pushed:

```text
web/public/data/satellite-manifest.json
web/public/data/hazards.json
web/public/data/fires.geojson
web/public/data/floods.geojson
web/public/data/earthquakes.geojson
web/public/data/polar-observations.json
web/public/data/satellite/*.jpg
web/public/data/satellite/*.png
web/public/data/overlays/*.webp
```

Each observation must include:

- source ID;
- agency;
- satellite and instrument;
- observation timestamp UTC;
- retrieval timestamp UTC;
- processing timestamp UTC when derived;
- latency;
- geometry or coverage;
- official product/item ID;
- official source URL;
- checksum;
- availability status;
- last error;
- evidence type: `satellite-image`, `measured-detection`, `derived-product`, `event-catalogue` or `unavailable`.

## Automatic hazard rules

The system must not invent a threat level. Alerts must be rule-based and traceable.

Examples:

### Fire alert

Create an alert only when a new FIRMS detection exists and contains a valid acquisition time and coordinates. Include FRP, brightness temperature or confidence only when present in the source record.

### Flood alert

Create an alert only when a derived Sentinel-1 change product passes documented quality checks and exceeds a configured area threshold. The alert must reference both source scene IDs and label the result as a derived product.

### Earthquake alert

Create an alert from an official USGS event when magnitude, depth, coordinates and event time are present. Use configurable thresholds by region.

### Polar alert

Create an alert only from a documented measured or derived ice/snow indicator with a real observation date and baseline comparison.

All rules must write their decision inputs and reason into the output JSON.

## Synchronization sequence

```text
CDSE STAC / Sentinel Hub / S3
             |
             v
CDSE Jupyter processing in mystorage
             |
             v
validated manifests + GeoJSON + web previews
             |
             v
git commit and push
             |
             v
GitHub Actions validation and Vite build
             |
             v
GitHub Pages deployment
```

NASA GIBS, NASA FIRMS and USGS can also be refreshed directly by scheduled GitHub Actions. CDSE-derived outputs are refreshed by Jupyter when the server is running, or later by a separate always-on runner if uninterrupted Sentinel processing is required.

## Important limitation

The free CDSE JupyterLab service is not an always-on production server. Its persistent storage is suitable for keeping project files and processed data, but the session stops after inactivity. A true unattended 24/7 system therefore requires GitHub Actions for lightweight feeds and either an external runner, openEO batch jobs, or another always-on service for heavy Sentinel processing.
