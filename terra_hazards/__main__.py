"""CLI for current hazard events and source status."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .catalog import load_catalog
from .eonet import write_open_events


def main() -> None:
    parser = argparse.ArgumentParser(description="Evidence-first Earth hazard data")
    subparsers = parser.add_subparsers(dest="command", required=True)
    status = subparsers.add_parser("sources")
    status.add_argument("--output")
    update = subparsers.add_parser("update")
    update.add_argument("--output", default="web/public/data/hazards.json")
    update.add_argument("--limit", type=int, default=200)
    args = parser.parse_args()
    if args.command == "sources":
        content = json.dumps(load_catalog(), indent=2)
        if args.output:
            Path(args.output).write_text(content, encoding="utf-8")
        else:
            print(content)
    else:
        write_open_events(Path(args.output), args.limit)


if __name__ == "__main__":
    main()
