from __future__ import annotations

import re
import subprocess
from pathlib import Path

TOKEN_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("OpenAI-style API key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b")),
    ("GitHub classic token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b")),
    ("GitHub fine-grained token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b")),
)

PROHIBITED_FILENAMES = {".env", ".dev.vars"}
SKIP_SUFFIXES = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".tif",
    ".tiff",
    ".zip",
    ".gz",
    ".pdf",
    ".glb",
    ".gltf",
    ".bin",
    ".woff",
    ".woff2",
}


def tracked_files() -> list[Path]:
    output = subprocess.check_output(["git", "ls-files", "-z"])
    return [Path(item.decode("utf-8")) for item in output.split(b"\0") if item]


def main() -> int:
    findings: list[str] = []
    files = tracked_files()

    for path in files:
        if path.name in PROHIBITED_FILENAMES:
            findings.append(f"prohibited tracked secret file: {path}")
            continue
        if path.suffix.lower() in SKIP_SUFFIXES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for label, pattern in TOKEN_PATTERNS:
            if pattern.search(text):
                findings.append(f"{label} pattern in tracked file: {path}")

    if findings:
        print("Tracked-secret scan FAILED. Values are intentionally not printed.")
        for finding in sorted(set(findings)):
            print(f"- {finding}")
        return 1

    print(f"Tracked-secret scan passed across {len(files)} tracked paths.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
