from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}
LOCAL_ROOTS = ("web/public", "published", "data", "research_cache")
RESEARCH_HINTS = (
    "experiment-",
    "experiment_",
    "sahara",
    "arctic",
    "ocean",
    "landsat",
    "sentinel",
    "satellite",
    "copernicus",
    "gibs",
    "water",
    "river",
    "lake",
    "flood",
    "glacier",
    "himal",
    "tibet",
    "grays-harbor",
    "cosmopolis",
    "vistula",
    "wisla",
)
DECORATIVE_TOKENS = ("logo", "favicon", "avatar", "sprite", "button-icon", "ui-icon")
RAW_ROOT = "https://raw.githubusercontent.com/Terraforming-Planet/Polar-Sun-Moon-Analysis"


@dataclass(slots=True, frozen=True)
class SiteImageRecord:
    path: str
    sha256: str
    origin: str
    experiment: str | None
    year: int | None
    platform: str | None
    item_id: str | None
    source_url: str | None
    source_scene_sha256: str | None


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _infer_year(text: str) -> int | None:
    match = re.search(r"(?<!\d)(19\d{2}|20\d{2})(?!\d)", text)
    if not match:
        return None
    year = int(match.group(1))
    return year if 1990 <= year <= 2026 else None


def _infer_experiment(text: str) -> str | None:
    match = re.search(r"experiment[-_](\d{3})", text.lower())
    return f"experiment-{match.group(1)}" if match else None


def _is_research_image(relative: str) -> bool:
    text = relative.lower()
    if any(token in Path(text).name for token in DECORATIVE_TOKENS):
        return False
    if text.startswith("web/public/experiment-"):
        return True
    if any(token in text for token in ("sahara-station", "arctic-90n", "ocean-station")):
        return True
    return any(token in text for token in RESEARCH_HINTS)


def _local_records(repo_root: Path) -> list[SiteImageRecord]:
    by_hash: dict[str, SiteImageRecord] = {}
    for relative_root in LOCAL_ROOTS:
        root = repo_root / relative_root
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            relative = path.relative_to(repo_root).as_posix()
            if relative.startswith("research_cache/site_corpus/"):
                continue
            if not _is_research_image(relative):
                continue
            digest = _sha256(path)
            if digest in by_hash:
                continue
            by_hash[digest] = SiteImageRecord(
                path=relative,
                sha256=digest,
                origin="local_project_asset",
                experiment=_infer_experiment(relative),
                year=_infer_year(relative),
                platform=None,
                item_id=None,
                source_url=None,
                source_scene_sha256=None,
            )
    return sorted(by_hash.values(), key=lambda record: record.path)


def extract_gallery_spec(page_text: str) -> tuple[str, str] | None:
    branch = re.search(r"const\s+branch\s*=\s*['\"]([^'\"]+)['\"]", page_text)
    experiment = re.search(r"published/(experiment-\d{3})", page_text)
    if not branch or not experiment:
        return None
    return branch.group(1), experiment.group(1)


def _get_bytes(url: str, *, retries: int = 4, timeout: float = 60.0) -> bytes:
    request = Request(url, headers={"User-Agent": "Terraforming-Planet-Site-Corpus/1.0"})
    for attempt in range(retries):
        try:
            with urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed public HTTPS
                return response.read()
        except (HTTPError, URLError, TimeoutError) as exc:
            if attempt + 1 >= retries:
                raise RuntimeError(f"download failed: {url}: {exc}") from exc
            time.sleep(min(10.0, 2.0**attempt))
    raise RuntimeError("unreachable")


def _download_remote_galleries(repo_root: Path) -> tuple[list[SiteImageRecord], list[str]]:
    pages_root = repo_root / "web" / "public"
    records: list[SiteImageRecord] = []
    errors: list[str] = []
    if not pages_root.exists():
        return records, errors

    for page in sorted(pages_root.glob("experiment-*/index.html")):
        spec = extract_gallery_spec(page.read_text(encoding="utf-8", errors="ignore"))
        if spec is None:
            continue
        branch, experiment = spec
        integrity_url = f"{RAW_ROOT}/{branch}/published/{experiment}/integrity.json"
        try:
            payload = json.loads(_get_bytes(integrity_url).decode("utf-8"))
        except (RuntimeError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            errors.append(str(exc))
            continue
        for raw in payload.get("records") or []:
            if not isinstance(raw, dict) or raw.get("status") != "ok":
                continue
            gallery_path = raw.get("gallery_path")
            if not isinstance(gallery_path, str) or not gallery_path.startswith("published/"):
                continue
            remote_url = f"{RAW_ROOT}/{branch}/{gallery_path}"
            relative_cache = (
                Path("research_cache")
                / "site_corpus"
                / experiment
                / Path(gallery_path).name
            )
            season = raw.get("season")
            year = raw.get("year")
            if isinstance(season, str) and isinstance(year, int):
                relative_cache = (
                    Path("research_cache") / "site_corpus" / experiment / season / f"{year}.jpg"
                )
            target = repo_root / relative_cache
            try:
                if not target.exists():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(_get_bytes(remote_url))
                digest = _sha256(target)
            except RuntimeError as exc:
                errors.append(str(exc))
                continue
            records.append(
                SiteImageRecord(
                    path=relative_cache.as_posix(),
                    sha256=digest,
                    origin="remote_project_gallery",
                    experiment=experiment,
                    year=year if isinstance(year, int) else None,
                    platform=raw.get("platform") if isinstance(raw.get("platform"), str) else None,
                    item_id=raw.get("item_id") if isinstance(raw.get("item_id"), str) else None,
                    source_url=remote_url,
                    source_scene_sha256=(
                        raw.get("sha256") if isinstance(raw.get("sha256"), str) else None
                    ),
                )
            )
    return records, errors


def build_site_corpus(
    repo_root: Path,
    *,
    download_remote: bool = True,
) -> tuple[list[SiteImageRecord], dict[str, Any]]:
    """Inventory all unique research imagery exposed by the site and TEST galleries."""
    records = _local_records(repo_root)
    remote_errors: list[str] = []
    if download_remote:
        remote_records, remote_errors = _download_remote_galleries(repo_root)
        records.extend(remote_records)

    by_hash: dict[str, SiteImageRecord] = {}
    for record in records:
        by_hash.setdefault(record.sha256, record)
    unique = sorted(by_hash.values(), key=lambda record: (record.experiment or "", record.path))

    counts_by_origin: dict[str, int] = {}
    counts_by_experiment: dict[str, int] = {}
    for record in unique:
        counts_by_origin[record.origin] = counts_by_origin.get(record.origin, 0) + 1
        key = record.experiment or "other-research-pages"
        counts_by_experiment[key] = counts_by_experiment.get(key, 0) + 1

    manifest: dict[str, Any] = {
        "schema": "terra-site-image-corpus-v1",
        "unique_image_count": len(unique),
        "counts_by_origin": dict(sorted(counts_by_origin.items())),
        "counts_by_experiment": dict(sorted(counts_by_experiment.items())),
        "remote_download_errors": remote_errors,
        "records": [asdict(record) for record in unique],
        "note": (
            "Includes unique research imagery from source site assets and dynamically referenced "
            "TEST galleries. Generated docs copies are not scanned separately, and obvious UI "
            "decorations are excluded. Remote gallery previews remain previews, not native bands."
        ),
    }
    return unique, manifest
