from __future__ import annotations

from pathlib import Path
import csv
import json
import shutil
import urllib.parse
import urllib.request
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "sahara-station"
DOCS = ROOT / "docs" / "sahara-station"
DATA = ROOT / "data" / "training" / "paleoriver_8"
GIBS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
LAYER = "MODIS_Terra_CorrectedReflectance_TrueColor"

TESTS = [
    {"id":"usa-death-valley","continent":"North America","country":"USA","name":"Death Valley / Lake Manly basin","bbox":[-117.45,35.70,-116.15,36.80],"date":"2024-05-27","kind":"paleolake-and-active-washes","evidence":"USGS documents paleolake history and satellite mapping of active channels/alluvial fans.","reference":"https://www.usgs.gov/publications/unified-200-kyr-paleohydrologic-history-southern-great-basin-death-valley-searles"},
    {"id":"usa-bonneville","continent":"North America","country":"USA","name":"Bonneville Salt Flats / Lake Bonneville remnant basin","bbox":[-114.55,40.25,-113.20,41.25],"date":"2024-08-15","kind":"paleolake-remnant-basin","evidence":"Dry-basin analogue. This test limits interpretation to visible geomorphology until DEM/geology validation is added.","reference":"https://www.usgs.gov/landsat-missions"},
    {"id":"eu-ebro-aragon","continent":"Europe","country":"Spain","name":"Ebro valley / Aragón semi-arid river corridor","bbox":[-1.55,41.15,-0.15,42.05],"date":"2021-07-15","kind":"active-river-arid-analogue","evidence":"ESA describes an arid setting with irrigation and a major active river; this is a retention analogue, not a paleoriver claim.","reference":"https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Earth_from_Space_Zaragoza_Spain"},
    {"id":"eu-po-low-water","continent":"Europe","country":"Italy","name":"Po River low-water corridor","bbox":[8.90,44.70,10.35,45.35],"date":"2022-06-20","kind":"partially-active-low-water-analogue","evidence":"ESA documented exceptional low water in 2022; useful for exposed-bar and channel-contraction comparison.","reference":"https://www.esa.int/ESA_Multimedia/Images/2022/06/Po_River_dries_up"},
    {"id":"af-tanezrouft","continent":"Africa","country":"Algeria/Mali","name":"Tanezrouft Basin ancient water-erosion terrain","bbox":[-1.50,23.0,2.5,27.0],"date":"2020-01-12","kind":"ancient-water-erosion-desert","evidence":"ESA explicitly notes evidence of water erosion from a wetter Sahara.","reference":"https://www.esa.int/ESA_Multimedia/Images/2021/01/Tanezrouft_Basin"},
    {"id":"af-tsauchab","continent":"Africa","country":"Namibia","name":"Tsauchab River / Sossusvlei","bbox":[14.60,-25.20,16.00,-24.10],"date":"2019-10-27","kind":"ephemeral-river-endorheic-basin","evidence":"ESA identifies the Tsauchab as an ephemeral river ending in Sossusvlei; historically flow reached farther west.","reference":"https://www.esa.int/ESA_Multimedia/Images/2020/04/Namib_Desert"},
    {"id":"asia-lop-nur","continent":"Asia","country":"China","name":"Lop Nur / Tarim terminal basin","bbox":[88.5,39.0,92.5,41.8],"date":"2024-10-01","kind":"dry-terminal-lake-paleodrainage","evidence":"Dry terminal-basin morphology is used to inspect old inflow patterns; specific paleochannels require SAR/DEM confirmation.","reference":"https://earthobservatory.nasa.gov/images/2046/the-wandering-lake"},
    {"id":"asia-aral","continent":"Asia","country":"Kazakhstan/Uzbekistan","name":"Aral Sea / Amu Darya–Syr Darya terminal basin","bbox":[56.5,42.0,62.5,46.8],"date":"2024-08-30","kind":"partially-active-shrunken-terminal-basin","evidence":"ESA documents long-term shrinkage after river diversion; used as a storage-and-routing cautionary analogue.","reference":"https://www.esa.int/ESA_Multimedia/Images/2025/04/Earth_from_Space_The_shrinking_Aral_Sea"},
]

GLOBE_SECTION = '''
  <section class="panel research-section" id="global-planet-lab">
    <div class="eyebrow">PRAWDZIWY MODEL PLANETY / NASA GIBS + COPERNICUS DEM</div>
    <h2>Globalny model 3D Ziemi — kafelki, LOD i lokalne laboratorium terenu</h2>
    <p>Glob nie używa jednej tekstury planety. Powierzchnia jest składana z niezależnych kafelków NASA GIBS, ładowanych asynchronicznie i przełączanych między poziomami szczegółowości zależnie od odległości kamery. Lokalna scena Sahara nadal korzysta z Copernicus DEM.</p>
    <div id="planetViewer" data-imagery-date="2026-08-12" style="height:min(62vh,620px);min-height:380px;border-radius:14px;overflow:hidden;background:#02060c"></div>
    <p id="planetStatus" class="method-note">NASA GIBS: inicjalizacja kafelków…</p>
    <div class="button-grid compact"><button data-globe-place="sahara">Sahara Station</button><button data-globe-place="himalaya">Himalaje / Tybet</button><button data-globe-place="deathvalley">Death Valley</button><button data-globe-place="lopnur">Lop Nur</button><button data-globe-place="aral">Aral</button></div>
    <p class="warn"><strong>Granica eksperymentu:</strong> globalny glob pokazuje rzeczywiste zobrazowanie satelitarne. Góry i doliny są modyfikowane wyłącznie w symulatorze DEM.</p>
  </section>
'''

JS_HELPERS = '''
function updateShapeLimits() {
  const baseInput = $('baseSize');
  const topInput = $('topSize');
  if (!baseInput || !topInput) return;
  const base = Math.max(0.5, Number(baseInput.value || 0.5));
  const safeMax = Math.max(Number(topInput.min || 0.2), base - 0.1);
  topInput.max = String(safeMax);
  if (Number(topInput.value) > safeMax) topInput.value = String(safeMax);
}

function placementRadius(shape) {
  return Math.max(2.2, shape.base * 0.58);
}

function placementIsFree(shape, x, z) {
  const margin = shape.base / 2 + 0.8;
  if (Math.abs(x) > WORLD_LIMIT - margin || Math.abs(z) > WORLD_LIMIT - margin) return false;
  const radius = placementRadius(shape);
  return objects.every((object) => {
    const required = radius + placementRadius(object.userData.shape);
    return Math.hypot(x - object.position.x, z - object.position.z) >= required;
  });
}

function findFreePlacement(shape, preferred = { x: 0, z: 0 }) {
  const startX = clamp(preferred.x, -WORLD_LIMIT, WORLD_LIMIT);
  const startZ = clamp(preferred.z, -WORLD_LIMIT, WORLD_LIMIT);
  if (placementIsFree(shape, startX, startZ)) return { x: startX, z: startZ };
  const step = Math.max(CELL_SIZE, shape.base * 0.72);
  for (let ring = 1; ring <= 8; ring += 1) {
    const candidates = [];
    for (let dx = -ring; dx <= ring; dx += 1) candidates.push([dx, -ring], [dx, ring]);
    for (let dz = -ring + 1; dz < ring; dz += 1) candidates.push([-ring, dz], [ring, dz]);
    for (const [dx, dz] of candidates) {
      const x = clamp(startX + dx * step, -WORLD_LIMIT, WORLD_LIMIT);
      const z = clamp(startZ + dz * step, -WORLD_LIMIT, WORLD_LIMIT);
      if (placementIsFree(shape, x, z)) return { x, z };
    }
  }
  return { x: startX, z: startZ };
}
'''


def patch_js(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "function updateShapeLimits()" not in text:
        text = text.replace("function updateShapeOutputs() {", JS_HELPERS + "\nfunction updateShapeOutputs() {", 1)
    old = """function updateShapeOutputs() {\n  const shape = currentShape();\n  if ($('baseOut')) $('baseOut').textContent = `${fmt(shape.base, 1)} km`;\n  if ($('topOut')) $('topOut').textContent = `${fmt(shape.top, 1)} km`;\n  if ($('heightOut')) $('heightOut').textContent = `${fmt(shape.height, 1)} km`;\n  if ($('newVolume')) $('newVolume').textContent = `${fmt(shape.volume)} km³`;\n  updateMetrics();\n}"""
    new = """function updateShapeOutputs() {\n  updateShapeLimits();\n  const shape = currentShape();\n  if ($('baseOut')) $('baseOut').textContent = `${fmt(shape.base, 1)} km`;\n  if ($('topOut')) $('topOut').textContent = `${fmt(shape.top, 1)} km`;\n  if ($('heightOut')) $('heightOut').textContent = `${fmt(shape.height, 1)} km`;\n  if ($('newVolume')) $('newVolume').textContent = `${fmt(shape.volume)} km³`;\n  const preview = document.querySelector('.shape-preview span');\n  if (preview) preview.textContent = `NOWY OBIEKT: ${fmt(shape.base, 1)} × ${fmt(shape.top, 1)} × ${fmt(shape.height, 1)} km • objętość`;\n  updateMetrics();\n}"""
    if old in text:
        text = text.replace(old, new, 1)
    text = text.replace("const placement = at ?? { x: 17, z: -11 };", "const placement = at ?? findFreePlacement(shape, { x: 17, z: -11 });", 1)
    text = text.replace("const placement = at ?? { x: -12, z: 8 };", "const placement = at ?? findFreePlacement(shape, { x: -12, z: 8 });", 1)
    old_pair = """function createPair(shape = currentShape(), near = null) {\n  const center = near ?? { x: 8, z: 10 };\n  const valley = digValley(shape, {\n    x: clamp(center.x + 8, -WORLD_LIMIT, WORLD_LIMIT),\n    z: clamp(center.z - 6, -WORLD_LIMIT, WORLD_LIMIT),\n  });\n  const mountain = buildMountain(shape, {\n    x: clamp(center.x - 8, -WORLD_LIMIT, WORLD_LIMIT),\n    z: clamp(center.z + 5, -WORLD_LIMIT, WORLD_LIMIT),\n  }, { sourceValley: valley });\n  return { valley, mountain };\n}"""
    new_pair = """function createPair(shape = currentShape(), near = null) {\n  const center = near ?? findFreePlacement(shape, { x: 8, z: 10 });\n  const valleySpot = findFreePlacement(shape, { x: center.x + Math.max(8, shape.base * 0.7), z: center.z - Math.max(6, shape.base * 0.45) });\n  const valley = digValley(shape, valleySpot);\n  const mountainSpot = findFreePlacement(shape, { x: center.x - Math.max(8, shape.base * 0.7), z: center.z + Math.max(5, shape.base * 0.45) });\n  const mountain = buildMountain(shape, mountainSpot, { sourceValley: valley });\n  return { valley, mountain };\n}"""
    if old_pair in text:
        text = text.replace(old_pair, new_pair, 1)
    path.write_text(text, encoding="utf-8")


def gallery_html() -> str:
    cards = []
    for item in TESTS:
        cards.append(f'''<figure style="margin:0"><a href="./paleoriver-tests/{item['id']}.jpg" target="_blank" rel="noopener"><img src="./paleoriver-tests/{item['id']}.jpg" loading="lazy" alt="Test satelitarny: {item['name']}" style="width:100%;border-radius:10px"></a><figcaption><strong>{item['name']}</strong><span>{item['continent']} · {item['kind']} · {item['date']}</span><span>{item['evidence']}</span><a href="{item['reference']}" target="_blank" rel="noopener noreferrer">Oficjalne źródło ↗</a></figcaption></figure>''')
    return '''\n  <section class="panel references" id="paleoriver-test-suite">\n    <div class="eyebrow">8 TESTÓW SATELITARNYCH / DANE TRENINGOWE</div>\n    <h2>Dawne, wyschnięte i częściowo aktywne systemy wodne — USA, Europa, Afryka, Azja</h2>\n    <p>Każdy test ma jawny bounding box, datę i oficjalne źródło. Obraz jest materiałem obserwacyjnym; interpretacja jest oddzielona od danych.</p>\n    <p><a class="button-link" href="./paleoriver-tests/paleoriver_tests_8.zip" download>Pobierz ZIP — 8 testów + manifest + cechy treningowe</a></p>\n    <div class="reference-gallery" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">''' + "".join(cards) + '''</div>\n    <p class="method-note"><strong>Baseline:</strong> histogramy RGB + deterministyczne klastry służą tylko do testu pipeline’u. To nie jest walidowany detektor paleokanałów.</p>\n    <p><a href="./paleoriver-tests/research-note.md" target="_blank" rel="noopener">Notatka badawcza ↗</a></p>\n  </section>\n'''


def patch_html(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if 'id="global-planet-lab"' not in text:
        text = text.replace('  <section class="lab-layout">', GLOBE_SECTION + '\n  <section class="lab-layout">', 1)
    if 'id="paleoriver-test-suite"' not in text:
        text = text.replace('  <section class="panel references">', gallery_html() + '\n  <section class="panel references">', 1)
    if './sahara-globe.js' not in text:
        text = text.replace('<script type="module" src="./sahara-lab.js"></script>', '<script type="module" src="./sahara-lab.js"></script>\n<script type="module" src="./sahara-globe.js"></script>', 1)
    path.write_text(text, encoding="utf-8")


def download_images(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for item in TESTS:
        west, south, east, north = item["bbox"]
        query = urllib.parse.urlencode({"SERVICE":"WMS","VERSION":"1.1.1","REQUEST":"GetMap","LAYERS":LAYER,"STYLES":"","FORMAT":"image/jpeg","TRANSPARENT":"FALSE","SRS":"EPSG:4326","BBOX":f"{west},{south},{east},{north}","WIDTH":"768","HEIGHT":"768","TIME":item["date"]})
        req = urllib.request.Request(f"{GIBS}?{query}", headers={"User-Agent":"Terraforming-Planet-Research/1.0"})
        with urllib.request.urlopen(req, timeout=90) as response:
            data = response.read()
        if len(data) < 10000 or not data.startswith(b"\xff\xd8"):
            raise RuntimeError(f"NASA GIBS returned invalid image for {item['id']} ({len(data)} bytes)")
        (out / f"{item['id']}.jpg").write_bytes(data)


def train_baseline(out: Path, manifest: dict) -> None:
    rows: list[list[object]] = []
    vectors: list[list[float]] = []
    for item in TESTS:
        image = Image.open(out / f"{item['id']}.jpg").convert("RGB").resize((96, 96))
        hist = image.histogram()
        vec: list[float] = []
        for channel in range(3):
            channel_hist = hist[channel * 256 : (channel + 1) * 256]
            total = sum(channel_hist) or 1
            for start in range(0, 256, 32):
                vec.append(sum(channel_hist[start : start + 32]) / total)
        pixels = list(image.getdata())
        mean = [sum(pixel[c] for pixel in pixels) / len(pixels) for c in range(3)]
        rows.append([item["id"], item["continent"], item["kind"], *[round(x, 5) for x in mean], *[round(x, 7) for x in vec]])
        vectors.append(vec)
    assignments = [0] * len(vectors)
    centroids = [vectors[i][:] for i in (0, 2, 4, 6)]
    for _ in range(25):
        updated = []
        for vector in vectors:
            distances = [sum((a - b) ** 2 for a, b in zip(vector, centroid)) for centroid in centroids]
            updated.append(min(range(4), key=lambda idx: distances[idx]))
        if updated == assignments:
            break
        assignments = updated
        for cluster in range(4):
            members = [vector for vector, assigned in zip(vectors, assignments) if assigned == cluster]
            if members:
                centroids[cluster] = [sum(values) / len(values) for values in zip(*members)]
    header = ["id", "continent", "kind", "mean_r", "mean_g", "mean_b"] + [f"hist_{channel}_{bucket}" for channel in "rgb" for bucket in range(8)]
    with (out / "training_features.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)
    baseline = {"model":"deterministic-kmeans-color-histogram-baseline","k":4,"purpose":"pipeline smoke test / surface grouping; NOT validated paleochannel detection","assignments":{item["id"]:int(assigned) for item, assigned in zip(TESTS, assignments)},"centroids":centroids}
    (out / "baseline_clusters.json").write_text(json.dumps(baseline, indent=2), encoding="utf-8")
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")


def write_note(out: Path) -> None:
    note = """# Notatka badawcza — iteracja 1\n\n## Obserwacje\n- **Death Valley:** zamknięta misa i wachlarze aluwialne pokazują rolę progów odpływu; USGS dokumentuje dawne fazy jeziorne.\n- **Bonneville:** suchy basen jest kontrolnym przykładem dawnego magazynu wody; konkretne kanały wymagają DEM/geologii.\n- **Ebro / Aragón:** aktywna rzeka w półsuchym otoczeniu pokazuje znaczenie korytarza rzecznego i retencji; to analog zarządzania wodą, nie paleorzeka.\n- **Po 2022:** niski stan odsłania łachy i zwęża aktywny kanał; to analog wrażliwości przepływu na zasilanie zlewni.\n- **Tanezrouft:** ESA opisuje ślady dawnej erozji wodnej w dziś hiper suchym terenie.\n- **Tsauchab / Sossusvlei:** rzeka efemeryczna kończy się w naturalnej niecce endoreicznej, która magazynuje wodę i sedyment podczas rzadkich epizodów.\n- **Lop Nur:** terminalny basen nadaje się do badania dawnych kierunków dopływu, ale szczegółowe paleokanały wymagają SAR/DEM.\n- **Aral:** pokazuje, że sam duży basen nie gwarantuje retencji, jeśli dopływy są ograniczone lub przekierowane.\n\n## Wnioski modelowe do testowania, nie fakty wykonawcze\n1. Najpierw wyznaczać zlewnie, obniżenia i progi odpływu z DEM.\n2. Liczyć czas retencji, infiltrację, parowanie, erozję i sedymentację, a nie tylko objętość.\n3. Testować kaskady mniejszych magazynów i istniejące niecki przed megastrukturami.\n4. Oddzielać kanały aktywne, efemeryczne i kopalne; forma liniowa na RGB sama nie dowodzi paleorzeki.\n5. Łączyć optykę z SAR i DEM na pustyniach.\n\n## Trening\nZbudowano 8-obrazowy zestaw kontrolny i baseline K-means na histogramach RGB. To test pipeline’u, nie walidowany detektor. Następny etap wymaga ręcznie zweryfikowanych masek i cech topograficzno-radarowych.\n"""
    (out / "research-note.md").write_text(note, encoding="utf-8")


def make_zip(out: Path) -> None:
    with zipfile.ZipFile(out / "paleoriver_tests_8.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for image in sorted(out.glob("*.jpg")):
            archive.write(image, image.name)
        for name in ("manifest.json", "training_features.csv", "baseline_clusters.json", "research-note.md"):
            archive.write(out / name, name)


def patch_tests() -> None:
    path = ROOT / "tests" / "test_sahara_station_page.py"
    text = path.read_text(encoding="utf-8")
    marker = "def test_sahara_night_agent_iteration_one() -> None:"
    if marker in text:
        return
    text += '''\n\n\ndef test_sahara_night_agent_iteration_one() -> None:\n    import json\n\n    html = PAGE.read_text(encoding="utf-8")\n    js = SCRIPT.read_text(encoding="utf-8")\n    globe = (ROOT / "web" / "public" / "sahara-station" / "sahara-globe.js").read_text(encoding="utf-8")\n    docs_globe = (ROOT / "docs" / "sahara-station" / "sahara-globe.js").read_text(encoding="utf-8")\n    manifest = json.loads((ROOT / "data" / "training" / "paleoriver_8" / "manifest.json").read_text(encoding="utf-8"))\n\n    assert 'id="global-planet-lab"' in html\n    assert 'id="planetViewer"' in html\n    assert "function updateShapeLimits()" in js\n    assert "function findFreePlacement(shape" in js\n    assert "NOWY OBIEKT:" in js\n    assert "gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi" in globe\n    assert "function buildLod(lod)" in globe\n    assert "textureCache" in globe\n    assert "snapshot?REQUEST=GetSnapshot" not in globe\n    assert globe == docs_globe\n    assert manifest["count"] == 8\n    assert len(manifest["tests"]) == 8\n    assert {item["continent"] for item in manifest["tests"]} == {"North America", "Europe", "Africa", "Asia"}\n'''
    path.write_text(text, encoding="utf-8")


def main() -> None:
    patch_js(WEB / "sahara-lab.js")
    patch_js(DOCS / "sahara-lab.js")
    (DOCS / "sahara-globe.js").write_text((WEB / "sahara-globe.js").read_text(encoding="utf-8"), encoding="utf-8")
    patch_html(WEB / "index.html")
    patch_html(DOCS / "index.html")
    DATA.mkdir(parents=True, exist_ok=True)
    manifest = {"schema_version":1,"purpose":"training-and-visual-test-set","count":8,"imagery_provider":"NASA GIBS WMS / MODIS Terra true color","tests":TESTS}
    (DATA / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    web_out = WEB / "paleoriver-tests"
    docs_out = DOCS / "paleoriver-tests"
    download_images(web_out)
    train_baseline(web_out, manifest)
    write_note(web_out)
    make_zip(web_out)
    if docs_out.exists():
        shutil.rmtree(docs_out)
    shutil.copytree(web_out, docs_out)
    patch_tests()


if __name__ == "__main__":
    main()
