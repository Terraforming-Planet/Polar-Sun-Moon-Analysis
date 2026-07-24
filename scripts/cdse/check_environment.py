from __future__ import annotations

import json
import os
import platform
import shutil
import sys
from pathlib import Path


def main() -> int:
    usage = shutil.disk_usage(Path.cwd())
    report = {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "working_directory": str(Path.cwd()),
        "virtual_env": os.environ.get("VIRTUAL_ENV"),
        "git": shutil.which("git"),
        "disk_free_gib": round(usage.free / 1024**3, 2),
    }
    print(json.dumps(report, indent=2))
    if usage.free < 512 * 1024**2:
        raise SystemExit("Less than 512 MiB of free disk space")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
