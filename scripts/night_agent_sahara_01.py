from pathlib import Path


HTML_PATHS = [
    Path("web/public/sahara-station/index.html"),
    Path("docs/sahara-station/index.html"),
]
CSS_PATHS = [
    Path("web/public/sahara-station/sahara-lab.css"),
    Path("docs/sahara-station/sahara-lab.css"),
]
JS_PATHS = [
    Path("web/public/sahara-station/sahara-lab.js"),
    Path("docs/sahara-station/sahara-lab.js"),
]

PLANET = """

  <section class="panel planet-section" id="global-planet">
    <div class="planet-grid">
      <div class="planet-copy">
        <div class="eyebrow">GLOBALNY MODEL ZIEMI / PRAWDZIWE DANE</div>
        <h2>Planeta 3D — NASA GIBS + lokalny Copernicus DEM</h2>
        <p>Ten glob jest georeferencyjnym kontekstem dla eksperymentów. Tekstura pochodzi z oficjalnego NASA Worldview/GIBS (MODIS), a edytor terenu poniżej wykorzystuje publiczny Copernicus DEM GLO-90 dla punktu Stacji badawczej Sahara. Glob i laboratorium mają wspólne współrzędne, ale tylko lokalny DEM jest obecnie modyfikowany przez góry i doliny.</p>
        <div class="planet-actions" aria-label="Szybkie lokalizacje globu">
          <button type="button" data-globe-place="sahara">Sahara Station</button>
          <button type="button" data-globe-place="himalaya">Himalaje / Tybet</button>
          <button type="button" data-globe-place="lopnur">Lop Nur</button>
        </div>
        <p class="method-note">Etap techniczny: globalny glob pokazuje prawdziwy obraz satelitarny; lokalna edycja wysokości pozostaje ograniczona do obszaru DEM, żeby nie udawać globalnego modelu geotechnicznego bez danych.</p>
      </div>
      <div id="planetViewer" class="planet-viewer" aria-label="Globalny model 3D Ziemi">
        <div id="planetStatus" class="planet-status">NASA GIBS: ładowanie obrazu satelitarnego…</div>
      </div>
    </div>
  </section>
"""

CSS_APPEND = """

/* Globalny kontekst planety + czytelne sprzężenie suwaków geometrii. */
.planet-section{padding:18px;margin:8px 0 18px;border-color:#315d79;background:linear-gradient(180deg,#0b1722ee,#101820ee)}
.planet-grid{display:grid;grid-template-columns:minmax(280px,420px) minmax(0,1fr);gap:18px;align-items:stretch}
.planet-copy h2{margin:10px 0 12px}.planet-copy p{color:#c8d9e8;line-height:1.6}.planet-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.planet-actions button{border:1px solid #4f89aa;border-radius:9px;background:#12334a;color:#e9f7ff;font-weight:800;cursor:pointer;padding:9px 11px}.planet-actions button:hover{background:#18445f;border-color:#83c9ef}
.planet-viewer{position:relative;min-height:430px;overflow:hidden;border:1px solid #376d8d;border-radius:12px;background:radial-gradient(circle at 50% 45%,#112b45 0,#030912 64%,#010307 100%)}
.planet-viewer canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block;touch-action:none}.planet-status{position:absolute;left:12px;bottom:12px;z-index:5;max-width:calc(100% - 24px);padding:8px 10px;border:1px solid #4f89aa;border-radius:8px;background:#06101bcc;color:#d8f3ff;font-size:.78rem;backdrop-filter:blur(8px)}
.shape-live-status{margin:-5px 0 13px;padding:9px 10px;border:1px solid #5b7f62;border-radius:8px;background:#102419;color:#c8f7d4;font-size:.78rem;line-height:1.4}
@media(max-width:900px){.planet-grid{grid-template-columns:1fr}.planet-viewer{min-height:360px}}
@media(max-width:520px){.planet-viewer{min-height:300px}.planet-actions button{flex:1 1 120px}}
"""

HELPER = """

function shapeLabel(shape) {
  return `podstawa ${fmt(shape.base, 1)} km • plateau/dno ${fmt(shape.top, 1)} km • wysokość/głębokość ${fmt(shape.height, 1)} km`;
}

function placementClear(shape, x, z, ignore = null) {
  if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return false;
  return objects.every((object) => {
    if (object === ignore) return true;
    const other = object.userData.shape;
    const clearance = (shape.base + other.base) / 2 + 1.25;
    return Math.hypot(x - object.position.x, z - object.position.z) >= clearance;
  });
}

function findOpenPlacement(shape, preferred = { x: 0, z: 0 }) {
  const start = {
    x: clamp(Number(preferred.x) || 0, -WORLD_LIMIT, WORLD_LIMIT),
    z: clamp(Number(preferred.z) || 0, -WORLD_LIMIT, WORLD_LIMIT),
  };
  if (placementClear(shape, start.x, start.z)) return start;

  const candidates = [];
  const step = Math.max(CELL_SIZE, Math.min(10, shape.base * 0.45));
  for (let z = -WORLD_LIMIT; z <= WORLD_LIMIT + 0.01; z += step) {
    for (let x = -WORLD_LIMIT; x <= WORLD_LIMIT + 0.01; x += step) {
      candidates.push({ x, z, distance: Math.hypot(x - start.x, z - start.z) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const open = candidates.find((candidate) => placementClear(shape, candidate.x, candidate.z));
  return open ? { x: open.x, z: open.z } : start;
}
"""

OLD_UPDATE = """function updateShapeOutputs() {
  const shape = currentShape();
  if ($('baseOut')) $('baseOut').textContent = `${fmt(shape.base, 1)} km`;
  if ($('topOut')) $('topOut').textContent = `${fmt(shape.top, 1)} km`;
  if ($('heightOut')) $('heightOut').textContent = `${fmt(shape.height, 1)} km`;
  if ($('newVolume')) $('newVolume').textContent = `${fmt(shape.volume)} km³`;
  updateMetrics();
}
"""

NEW_UPDATE = """function updateShapeOutputs() {
  const baseInput = $('baseSize');
  const topInput = $('topSize');
  if (baseInput && topInput) {
    const maxTop = Math.max(0.2, Number(baseInput.value) - 0.1);
    topInput.max = String(maxTop);
    if (Number(topInput.value) > maxTop) topInput.value = String(maxTop);
  }
  const shape = currentShape();
  if ($('baseOut')) $('baseOut').textContent = `${fmt(shape.base, 1)} km`;
  if ($('topOut')) $('topOut').textContent = `${fmt(shape.top, 1)} km`;
  if ($('heightOut')) $('heightOut').textContent = `${fmt(shape.height, 1)} km`;
  if ($('newVolume')) $('newVolume').textContent = `${fmt(shape.volume)} km³`;
  if ($('shapeLiveStatus')) $('shapeLiveStatus').textContent = `Nowy obiekt: ${shapeLabel(shape)} • objętość ${fmt(shape.volume)} km³`;
  updateMetrics();
}
"""


def patch_html() -> None:
    for path in HTML_PATHS:
        text = path.read_text(encoding="utf-8")
        if 'id="global-planet"' not in text:
            anchor = "  </header>\n"
            if anchor not in text:
                raise RuntimeError(f"Header anchor missing: {path}")
            text = text.replace(anchor, anchor + PLANET, 1)
        if 'id="shapeLiveStatus"' not in text:
            anchor = '      <div class="shape-preview"><span>Objętość pojedynczej bryły</span><strong id="newVolume">—</strong></div>\n'
            if anchor not in text:
                raise RuntimeError(f"Shape anchor missing: {path}")
            text = text.replace(
                anchor,
                anchor + '      <div id="shapeLiveStatus" class="shape-live-status">Nowy obiekt: parametry z suwaków zostaną użyte przy następnym wykopie lub budowie.</div>\n',
                1,
            )
        globe_script = '<script type="module" src="./sahara-globe.js"></script>\n'
        lab_script = '<script type="module" src="./sahara-lab.js"></script>\n'
        if globe_script not in text:
            if lab_script not in text:
                raise RuntimeError(f"Lab script anchor missing: {path}")
            text = text.replace(lab_script, globe_script + lab_script, 1)
        path.write_text(text, encoding="utf-8")


def patch_css() -> None:
    for path in CSS_PATHS:
        text = path.read_text(encoding="utf-8")
        if ".planet-section{" not in text:
            text += CSS_APPEND
        path.write_text(text, encoding="utf-8")


def patch_js() -> None:
    for path in JS_PATHS:
        text = path.read_text(encoding="utf-8")
        if "function findOpenPlacement(shape" not in text:
            anchor = "function sameShape(a, b) {\n"
            if anchor not in text:
                raise RuntimeError(f"sameShape anchor missing: {path}")
            text = text.replace(anchor, HELPER + "\n" + anchor, 1)
        if OLD_UPDATE in text:
            text = text.replace(OLD_UPDATE, NEW_UPDATE, 1)
        elif "shapeLiveStatus" not in text:
            raise RuntimeError(f"updateShapeOutputs changed unexpectedly: {path}")
        text = text.replace(
            "  const placement = at ?? { x: 17, z: -11 };\n  const valley = createValley(shape, clamp(placement.x, -WORLD_LIMIT, WORLD_LIMIT), clamp(placement.z, -WORLD_LIMIT, WORLD_LIMIT));",
            "  const placement = findOpenPlacement(shape, at ?? { x: 17, z: -11 });\n  const valley = createValley(shape, placement.x, placement.z);",
            1,
        )
        text = text.replace(
            "  const placement = at ?? { x: -12, z: 8 };\n  const mountain = createMountain(\n    shape,\n    clamp(placement.x, -WORLD_LIMIT, WORLD_LIMIT),\n    clamp(placement.z, -WORLD_LIMIT, WORLD_LIMIT),",
            "  const placement = findOpenPlacement(shape, at ?? { x: -12, z: 8 });\n  const mountain = createMountain(\n    shape,\n    placement.x,\n    placement.z,",
            1,
        )
        old_hud = "  if (hud) hud.textContent = `Zaznaczenie: ${label} #${selected.userData.id} • ${cellAddress(col, row, 0)} • ${fmt(selected.userData.volume)} km³`;"
        new_hud = "  if (hud) hud.textContent = `Zaznaczenie: ${label} #${selected.userData.id} • ${shapeLabel(selected.userData.shape)} • ${cellAddress(col, row, 0)} • ${fmt(selected.userData.volume)} km³`;"
        if old_hud in text:
            text = text.replace(old_hud, new_hud, 1)
        path.write_text(text, encoding="utf-8")


def patch_tests() -> None:
    path = Path("tests/test_sahara_station_page.py")
    tests = path.read_text(encoding="utf-8")
    marker = "def test_sahara_station_has_global_nasa_globe_and_working_shape_feedback() -> None:"
    if marker in tests:
        return
    tests += '''\n\n\ndef test_sahara_station_has_global_nasa_globe_and_working_shape_feedback() -> None:\n    html = PAGE.read_text(encoding="utf-8")\n    js = SCRIPT.read_text(encoding="utf-8")\n    globe = ROOT / "web" / "public" / "sahara-station" / "sahara-globe.js"\n    docs_globe = ROOT / "docs" / "sahara-station" / "sahara-globe.js"\n\n    assert 'id="global-planet"' in html\n    assert 'id="planetViewer"' in html\n    assert 'id="shapeLiveStatus"' in html\n    assert "function findOpenPlacement(shape" in js\n    assert "placementClear(shape" in js\n    assert "shapeLabel(selected.userData.shape)" in js\n    globe_text = globe.read_text(encoding="utf-8")\n    assert "wvs.earthdata.nasa.gov/api/v1/snapshot" in globe_text\n    assert "MODIS_Terra_CorrectedReflectance_TrueColor" in globe_text\n    assert globe_text == docs_globe.read_text(encoding="utf-8")\n'''
    path.write_text(tests, encoding="utf-8")


def main() -> None:
    source_globe = Path("web/public/sahara-station/sahara-globe.js")
    docs_globe = Path("docs/sahara-station/sahara-globe.js")
    docs_globe.write_text(source_globe.read_text(encoding="utf-8"), encoding="utf-8")
    patch_html()
    patch_css()
    patch_js()
    patch_tests()


if __name__ == "__main__":
    main()
