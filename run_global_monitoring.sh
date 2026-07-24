#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
python -m pip install -r requirements-cdse.txt

CONFIG="config/global_monitoring.yaml"
if [[ ! -f "$CONFIG" ]]; then
  cp config/global_monitoring.example.yaml "$CONFIG"
fi

python scripts/cdse/global_catalog_monitor.py --config "$CONFIG"
printf '\nGlobal catalogue monitoring completed.\nResult: docs/data/copernicus/global_catalog_summary.json\n'
