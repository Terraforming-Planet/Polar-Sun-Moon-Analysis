#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
python -m pip install -r requirements-cdse.txt

if [[ ! -f config/flood_detection.yaml ]]; then
  cp config/flood_detection.example.yaml config/flood_detection.yaml
fi

python scripts/cdse/run_flood_detection.py --config config/flood_detection.yaml
python scripts/cdse/publish_flood_map.py

echo
echo "Flood analysis and web map completed."
echo "Map: docs/flood-map/index.html"
echo "Assets: docs/flood-map/assets/"
echo "For local preview: python -m http.server 8000 --directory docs"
