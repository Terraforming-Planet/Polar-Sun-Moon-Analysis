#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-/home/jovyan/mystorage/terraforming-planet/frames/latest.json}"
TARGET="${2:-web/public/data/copernicus/latest.json}"

if [[ ! -s "$SOURCE" ]]; then
  echo "Copernicus manifest missing or empty: $SOURCE" >&2
  exit 1
fi

mkdir -p "$(dirname "$TARGET")"
python - "$SOURCE" "$TARGET" <<'PY'
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
target = Path(sys.argv[2])
payload = json.loads(source.read_text(encoding="utf-8"))

observations = payload.get("observations") or payload.get("features") or payload.get("frames") or []
metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
start = metadata.get("data_poczatkowa") or metadata.get("start") or payload.get("start") or payload.get("start_utc")
end = metadata.get("data_koncowa") or metadata.get("end") or payload.get("end") or payload.get("end_utc")

public = {
    "metadata": {
        **metadata,
        "data_poczatkowa": start,
        "data_koncowa": end,
        "status": "ok",
        "observation_count": len(observations),
    },
    "observations": observations,
}
target.write_text(json.dumps(public, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Published {len(observations)} Copernicus observations to {target}")
PY
