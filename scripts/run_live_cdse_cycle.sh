#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT="${TP_LIVE_REPORT:-/home/jovyan/mystorage/terraforming-planet/logs/live-cdse-report.json}"
WORKERS="${TP_LIVE_WORKERS:-2}"

cd "$ROOT"
mkdir -p "$(dirname "$REPORT")"

exec python -m environmental_monitor.orchestrator.parallel_pipeline \
  environmental_monitor/orchestrator/live_manifest.json \
  --backend thread \
  --workers "$WORKERS" \
  --report "$REPORT"
