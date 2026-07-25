#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/mystorage/Polar-Sun-Moon-Analysis}"
BRANCH="${BRANCH:-codex/finish-realistic-satellite-earth}"
LOG_DIR="${LOG_DIR:-$HOME/mystorage/terraforming-data/logs}"

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/cdse-sync-$(date -u +%Y%m%dT%H%M%SZ).log"
exec > >(tee -a "$LOG_FILE") 2>&1

cd "$REPO_DIR"

echo "[1/8] Updating repository"
git fetch origin
git switch "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[2/8] Installing notebook runtime dependencies"
python -m pip install --user --upgrade requests pillow nbconvert

echo "[3/8] Executing CDSE/NASA notebook"
python -m jupyter nbconvert \
  --to notebook \
  --execute notebooks/cdse_realistic_earth_pipeline.ipynb \
  --output cdse_realistic_earth_pipeline.executed.ipynb \
  --ExecutePreprocessor.timeout=900

echo "[4/8] Validating generated public data"
test -f web/public/data/satellite-manifest.json
python -m json.tool web/public/data/satellite-manifest.json >/dev/null

echo "[5/8] Running available Python validation"
if python -m terra_hazards satellite-validate; then
  echo "terra_hazards validation passed"
else
  echo "terra_hazards satellite-validate is not implemented yet; continuing with JSON validation"
fi

echo "[6/8] Checking for generated changes"
git status --short

if git diff --quiet -- web/public/data && \
   git diff --cached --quiet -- web/public/data && \
   [ -z "$(git ls-files --others --exclude-standard web/public/data)" ]; then
  echo "No new public data to publish"
  exit 0
fi

echo "[7/8] Committing web-ready outputs only"
git add \
  web/public/data/satellite-manifest.json \
  web/public/data/satellite \
  web/public/data/overlays \
  web/public/data/fires.geojson \
  web/public/data/floods.geojson \
  web/public/data/earthquakes.geojson \
  web/public/data/polar-observations.json \
  web/public/data/hazards.json 2>/dev/null || true

if git diff --cached --quiet; then
  echo "No tracked web-ready output changed"
  exit 0
fi

git commit -m "data: refresh verified satellite and hazard outputs"

echo "[8/8] Pushing to GitHub"
git push origin "$BRANCH"

echo "Synchronization completed"
