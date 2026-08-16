import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "sahara-station"
DOCS = ROOT / "docs" / "sahara-station"


def test_mosaic_runtime_is_published_identically() -> None:
    names = (
        "sahara-dem-mosaic-core.js",
        "sahara-dem-mosaic.js",
        "sahara-flow-grid.js",
        "sahara-dem-mosaic-suite.js",
    )
    for name in names:
        web_text = (WEB / name).read_text(encoding="utf-8")
        docs_text = (DOCS / name).read_text(encoding="utf-8")
        assert web_text == docs_text

    relief = (WEB / "sahara-dem-relief.js").read_text(encoding="utf-8")
    docs_relief = (DOCS / "sahara-dem-relief.js").read_text(encoding="utf-8")
    suite = (WEB / "sahara-dem-mosaic-suite.js").read_text(encoding="utf-8")

    assert "import './sahara-dem-mosaic-suite.js';" in relief
    assert relief == docs_relief
    assert "loadCopernicusDemMosaic" in suite
    assert "buildMosaicFlowProducts" in suite
    assert "49×49" in suite
    assert "paleoriver_hydrology_mosaic_8.json" in suite


def test_mosaic_core_stitches_nine_tiles_without_duplicate_edges() -> None:
    if not shutil.which("node"):
        pytest.skip("node is not installed")

    module_uri = (WEB / "sahara-dem-mosaic-core.js").resolve().as_uri()
    script = f"""
import {{ mosaicTileOrigins, stitchDemTiles }} from {module_uri!r};
const origins = mosaicTileOrigins(10.4, 20.6);
if (origins.length !== 9) throw new Error(`origins=${{origins.length}}`);
const tiles = origins.map((o, i) => ({{
  ...o,
  values: Float64Array.from({{length: 9}}, () => i + 1),
}}));
const stitched = stitchDemTiles(tiles, 1, 3);
if (stitched.width !== 7 || stitched.height !== 7) {{
  throw new Error(`size=${{stitched.width}}x${{stitched.height}}`);
}}
if (stitched.values.length !== 49) {{
  throw new Error(`cells=${{stitched.values.length}}`);
}}
"""
    subprocess.run(
        ["node", "--input-type=module", "-e", script],
        check=True,
    )


def test_iteration_seven_note_exists() -> None:
    note = (
        ROOT
        / "data"
        / "training"
        / "paleoriver_8"
        / "research_note_iteration_7.md"
    )
    text = note.read_text(encoding="utf-8")
    assert "3×3" in text
    assert "49×49" in text
    assert "nie dowodzi" in text
