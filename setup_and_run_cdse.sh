#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="full"
case "${1:-}" in
  --test) MODE="test" ;;
  --help|-h)
    cat <<'EOF'
Usage: bash setup_and_run_cdse.sh [--test|--help]

--test  Run a small, fast real-data STAC query.
--help  Show this help.
EOF
    exit 0 ;;
  "") ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac

for cmd in python3 git; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing required command: $cmd" >&2; exit 1; }
done

mkdir -p "$ROOT/logs" "$ROOT/docs/data/copernicus" "$ROOT/docs/charts/copernicus" "$ROOT/docs/reports" "$ROOT/config"
LOG="$ROOT/logs/cdse_run_$(date -u +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1
trap 'code=$?; echo "CDSE pipeline failed at line $LINENO (exit $code). Log: $LOG"; exit $code' ERR

cd "$ROOT"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-cdse.txt

if [[ ! -f config/cdse.yaml ]]; then
  cp config/cdse.example.yaml config/cdse.yaml
fi

python -m pytest -q tests/test_cdse_pipeline.py
python scripts/cdse/check_environment.py
python scripts/cdse/check_cdse_connection.py
PIPELINE_ARGS=(--config config/cdse.yaml)
if [[ "$MODE" == "test" ]]; then
  PIPELINE_ARGS+=(--test)
fi
python scripts/cdse/run_pipeline.py "${PIPELINE_ARGS[@]}"

echo
printf 'CDSE pipeline completed successfully.\nMode: %s\nLog: %s\nResults:\n' "$MODE" "$LOG"
find docs/data/copernicus docs/charts/copernicus docs/reports -maxdepth 2 -type f -print | sort
