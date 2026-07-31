# CDSE parallel processing profile

The current Copernicus JupyterLab container exposes 32 logical CPUs and about 251 GiB RAM, but no CUDA, ROCm or DRM render device. The correct execution model is therefore hybrid.

## Responsibilities

- CDSE CPU container: catalogue queries, decoding, reprojection, tiling, validation, indexing and compact result generation.
- Remote batch services: openEO, Sentinel Hub Batch/Async and other data-proximate processing for terabyte-scale workloads.
- Dedicated compute GPU: segmentation, change detection and other neural image models when a GPU backend is available.
- Browser GPU: WebGL/WebGPU rendering of the globe, imagery tiles and instanced hazard markers.

## Resource policy

The orchestrator detects available CPU and memory at runtime. It reserves part of the CPU for Jupyter and operating-system work and caps the default process pool at 24 workers. Each worker receives one BLAS/OpenMP thread to prevent 24 processes from each creating 32 internal threads.

This avoids oversubscription, memory spikes and an unresponsive notebook.

## One-command test in JupyterLab

```bash
cd ~/mystorage/Polar-Sun-Moon-Analysis
bash scripts/run_cdse_parallel.sh environmental_monitor/orchestrator/example_manifest.json --report ~/mystorage/terraforming-planet/logs/parallel-report.json
```

## Production manifests

A production manifest should contain independent area/time tiles. Each task invokes a processing command and can optionally name its expected output. Large jobs should produce COG or Zarr objects in durable storage rather than loading a complete archive into notebook RAM.

The pipeline writes one JSON report containing resource information, task duration, exit status and truncated logs. Failed tasks can be resubmitted without recalculating successful tiles.

## Important limit

More RAM does not make it sensible to download terabytes into JupyterLab. Send computation to the archive, divide work into resumable tiles, and retrieve only COG/Zarr results, thumbnails, statistics and vector alerts.
