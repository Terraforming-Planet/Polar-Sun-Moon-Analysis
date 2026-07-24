# Copernicus CDSE JupyterLab setup

This integration queries the official Copernicus Data Space Ecosystem STAC catalogue at:

`https://stac.dataspace.copernicus.eu/v1/`

It uses real catalogue metadata. The first version analyses scene availability and cloud metadata for representative northern and southern polar study areas. It does **not** claim that the selected boxes are the exact geographic poles, and it does not yet perform pixel-level environmental change detection.

## Run in CDSE JupyterLab

Open **Terminal** and run:

```bash
git clone https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis.git
cd Polar-Sun-Moon-Analysis
bash setup_and_run_cdse.sh --test
```

After the test succeeds, run the complete configured query:

```bash
bash setup_and_run_cdse.sh
```

The launcher creates `.venv`, installs the small CDSE dependency set, validates the environment, checks CDSE connectivity, runs fast tests and generates:

- `docs/data/copernicus/latest_results.json`
- `docs/data/copernicus/observations.csv`
- `docs/data/copernicus/run_metadata.json`
- `docs/charts/copernicus/observation_timeline.png`
- `docs/reports/copernicus-analysis.html`

Local execution logs are written under `logs/` and are intentionally excluded from Git.

## Configuration

On first launch, `config/cdse.yaml` is copied from `config/cdse.example.yaml`. Edit the local YAML file to change:

- date range;
- STAC collection;
- northern and southern bounding boxes;
- maximum cloud cover;
- result limit.

The local configuration is excluded from Git. It must not contain passwords or access tokens.

## Authentication

The metadata-only STAC query used by this first pipeline does not require storing a secret. Future openEO processing can use the official interactive OIDC flow. Never paste a password or token into a notebook committed to GitHub.

## Troubleshooting

### Terminal is unavailable

Open a Python notebook and prefix the command with `!`:

```python
!bash setup_and_run_cdse.sh --test
```

### `python3 -m venv` fails

Use the preinstalled Python environment only as a temporary fallback, or ask CDSE support to enable the standard `venv` module. Do not use `sudo` in the managed JupyterLab environment.

### CDSE endpoint timeout

Re-run the command. The pipeline uses bounded HTTP timeouts and writes the failing stage to the log file.

### No matching observations

Increase the date range, raise `cloud_cover_max`, or verify the configured collection and bounding box. A valid empty result is exported explicitly and is not replaced with demo data.

### Low disk space

Delete `.venv` and old files under `logs/`, then rerun. The current pipeline downloads metadata only and should not consume large storage.

### Rasterio or GDAL errors

The initial metadata pipeline deliberately avoids requiring Rasterio or GDAL. Add those packages only when a later pixel-processing stage genuinely needs them and the CDSE image supports compatible wheels.

## Scientific scope

The generated records are evidence-class `OBSERVATION` catalogue metadata. They indicate that satellite scenes exist for the selected place and time. They are not emergency alerts and do not by themselves prove changes in ice, water, vegetation or temperature.
