const ECLIPSE_EVENTS = [
  { id: '2026-08-28-lunar-partial', kind: 'Lunar', type: 'Partial', greatestUtc: '2026-08-28T04:13:00Z', catalogTd: '04:14:04 TD', visibility: 'Eastern Pacific, Americas, Europe, Africa', source: 'NASA GSFC Eclipses During 2026 (UT rounded to nearest minute)' },
  { id: '2027-02-06-solar-annular', kind: 'Solar', type: 'Annular', greatestUtc: '2027-02-06T16:00:00Z', catalogTd: '16:00:48 TD', visibility: 'South America, Antarctica, western and southern Africa; annular path through Chile, Argentina and Atlantic', source: 'NASA GSFC Eclipses During 2027 (UT rounded to nearest minute)' },
  { id: '2027-02-20-lunar-penumbral', kind: 'Lunar', type: 'Penumbral', greatestUtc: '2027-02-20T23:13:00Z', catalogTd: '23:14:06 TD', visibility: 'Americas, Europe, Africa, Asia', source: 'NASA GSFC Eclipses During 2027 (UT rounded to nearest minute)' },
  { id: '2027-07-18-lunar-penumbral', kind: 'Lunar', type: 'Penumbral', greatestUtc: '2027-07-18T16:03:00Z', catalogTd: '16:04:09 TD', visibility: 'Eastern Africa, Asia, Australia, Pacific', source: 'NASA GSFC Eclipses During 2027 (UT rounded to nearest minute)' },
  { id: '2027-08-02-solar-total', kind: 'Solar', type: 'Total', greatestUtc: '2027-08-02T10:07:00Z', catalogTd: '10:07:50 TD', visibility: 'Africa, Europe, Middle East, western and southern Asia; totality: Morocco, Spain, Algeria, Libya, Egypt, Saudi Arabia, Yemen, Somalia', source: 'NASA GSFC Eclipses During 2027 (UT rounded to nearest minute)' },
  { id: '2027-08-17-lunar-penumbral', kind: 'Lunar', type: 'Penumbral', greatestUtc: '2027-08-17T07:14:00Z', catalogTd: '07:14:59 TD', visibility: 'Pacific, Americas', source: 'NASA GSFC Eclipses During 2027 (UT rounded to nearest minute)' },
  { id: '2028-01-12-lunar-partial', kind: 'Lunar', type: 'Partial', greatestUtc: '2028-01-12T04:13:00Z', catalogTd: '04:14:13 TD', visibility: 'Americas, Europe, Africa', source: 'NASA GSFC Eclipses During 2028 (UT rounded to nearest minute)' },
  { id: '2028-01-26-solar-annular', kind: 'Solar', type: 'Annular', greatestUtc: '2028-01-26T15:08:00Z', catalogTd: '15:08:59 TD', visibility: 'Eastern North America, Central and South America, western Europe, northwestern Africa', source: 'NASA GSFC Eclipses During 2028 (UT rounded to nearest minute)' },
  { id: '2028-07-06-lunar-partial', kind: 'Lunar', type: 'Partial', greatestUtc: '2028-07-06T18:20:00Z', catalogTd: '18:20:57 TD', visibility: 'Europe, Africa, Asia, Australia', source: 'NASA GSFC Eclipses During 2028 (UT rounded to nearest minute)' },
  { id: '2028-07-22-solar-total', kind: 'Solar', type: 'Total', greatestUtc: '2028-07-22T02:55:00Z', catalogTd: '02:56:40 TD', visibility: 'Southeast Asia, East Indies, Australia, New Zealand', source: 'NASA GSFC Eclipses During 2028 (UT rounded to nearest minute)' },
  { id: '2028-12-31-lunar-total', kind: 'Lunar', type: 'Total', greatestUtc: '2028-12-31T16:52:00Z', catalogTd: '16:53:15 TD', visibility: 'Europe, Africa, Asia, Australia, Pacific', source: 'NASA GSFC Eclipses During 2028 (UT rounded to nearest minute)' },
]

const TEST_AREAS = [
  { id: 'olszowka', label: 'Olszówka · Gardeja · Poland', lat: 53.61586, lon: 18.99546, region: 'Europe', rationale: 'Project reference point retained for reproducibility. It lies inside NASA’s broad Europe visibility region for the 28 Aug 2026 partial lunar eclipse; local Moon altitude and weather still decide practical visibility.' },
  { id: 'lisbon', label: 'Lisbon · Portugal', lat: 38.7223, lon: -9.1393, region: 'Western Europe', rationale: 'Representative western-European test point within NASA’s broad Europe visibility region for the next lunar eclipse.' },
  { id: 'dakar', label: 'Dakar · Senegal', lat: 14.7167, lon: -17.4677, region: 'Western Africa', rationale: 'Representative western-African test point inside NASA’s broad Africa visibility region.' },
  { id: 'new-york', label: 'New York · USA', lat: 40.7128, lon: -74.0060, region: 'Americas', rationale: 'Representative North American test point inside NASA’s broad Americas visibility region.' },
  { id: 'santiago', label: 'Santiago · Chile', lat: -33.4489, lon: -70.6693, region: 'Americas', rationale: 'Representative South American test point and useful continuity point for the 6 Feb 2027 annular-solar-eclipse region.' },
  { id: 'honolulu', label: 'Honolulu · Hawaiʻi · USA', lat: 21.3069, lon: -157.8583, region: 'Pacific', rationale: 'Representative Pacific test point for the next lunar-eclipse visibility region. This is not a weather forecast.' },
]

function nextEvent(now = new Date()) {
  return ECLIPSE_EVENTS.find(event => new Date(event.greatestUtc).getTime() > now.getTime()) || null
}

function nextSolar(now = new Date(), type = null) {
  return ECLIPSE_EVENTS.find(event => event.kind === 'Solar' && (!type || event.type === type) && new Date(event.greatestUtc) > now) || null
}

function nextLunar(now = new Date()) {
  return ECLIPSE_EVENTS.find(event => event.kind === 'Lunar' && new Date(event.greatestUtc) > now) || null
}

function nextSameKindAfter(event) {
  if (!event) return null
  const eventTime = new Date(event.greatestUtc).getTime()
  return ECLIPSE_EVENTS.find(item => item.kind === event.kind && new Date(item.greatestUtc).getTime() > eventTime) || null
}

function pad(value) {
  return String(Math.max(0, Math.floor(value))).padStart(2, '0')
}

function setText(id, text) {
  const node = document.getElementById(id)
  if (node) node.textContent = text
}

function renderCountdownFor(event, prefix) {
  if (!event) {
    setText(`${prefix}-count-title`, 'Brak przyszłego wydarzenia w lokalnym katalogu')
    return
  }
  const now = new Date()
  const delta = Math.max(0, new Date(event.greatestUtc).getTime() - now.getTime())
  const days = Math.floor(delta / 86_400_000)
  const hours = Math.floor((delta % 86_400_000) / 3_600_000)
  const minutes = Math.floor((delta % 3_600_000) / 60_000)
  const seconds = Math.floor((delta % 60_000) / 1000)
  setText(`${prefix}-count-days`, String(days))
  setText(`${prefix}-count-hours`, pad(hours))
  setText(`${prefix}-count-minutes`, pad(minutes))
  setText(`${prefix}-count-seconds`, pad(seconds))
  setText(`${prefix}-count-title`, `${event.type} ${event.kind.toLowerCase()} eclipse`)
  setText(`${prefix}-count-time`, `${event.greatestUtc.replace('T', ' ').replace('Z', ' UT')} · countdown to greatest eclipse · catalog ${event.catalogTd}`)
  setText(`${prefix}-count-visibility`, event.visibility)
  setText(`${prefix}-count-source`, event.source)
}

function renderCountdowns() {
  const now = new Date()
  const solar = nextSolar(now)
  const lunar = nextLunar(now)
  renderCountdownFor(solar, 'solar')
  renderCountdownFor(lunar, 'lunar')

  const total = nextSolar(now, 'Total')
  const nextLunarEvent = nextSameKindAfter(lunar)
  setText('solar-next-total', total ? `${total.greatestUtc.slice(0, 10)} · ${total.type}` : '—')
  setText('lunar-next-after', nextLunarEvent ? `${nextLunarEvent.greatestUtc.slice(0, 10)} · ${nextLunarEvent.type}` : '—')
}

function renderEventCards() {
  const host = document.getElementById('event-list')
  if (!host) return
  const now = new Date()
  const upcoming = ECLIPSE_EVENTS.filter(event => new Date(event.greatestUtc) > now).slice(0, 6)
  host.replaceChildren(...upcoming.map((event, index) => {
    const article = document.createElement('article')
    article.className = `event-card${index === 0 ? ' active' : ''}`
    article.innerHTML = `<small>${event.kind.toUpperCase()} · ${event.type.toUpperCase()}</small><h3>${new Date(event.greatestUtc).toISOString().slice(0, 10)}</h3><b>${event.greatestUtc.slice(11, 16)} UT · greatest eclipse</b><p>Catalog time: ${event.catalogTd}. ${event.visibility}</p>`
    return article
  }))
}

let viewer = null
function initMap() {
  const host = document.getElementById('map')
  if (!host || !window.Cesium) return
  Cesium.Ion.defaultAccessToken = ''
  viewer = new Cesium.Viewer(host, {
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    timeline: false,
    animation: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  })
  viewer.imageryLayers.removeAll()
  viewer.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }))
  viewer.scene.globe.enableLighting = true
  for (const area of TEST_AREAS) {
    viewer.entities.add({
      id: `area-${area.id}`,
      position: Cesium.Cartesian3.fromDegrees(area.lon, area.lat, 0),
      point: { pixelSize: 9, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth: 1 },
      label: { text: area.label, font: '12px sans-serif', fillColor: Cesium.Color.WHITE, pixelOffset: new Cesium.Cartesian2(0, -16), showBackground: true, backgroundColor: Cesium.Color.BLACK.withAlpha(0.55), distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 9_000_000) },
    })
  }
  selectArea(TEST_AREAS[0])
}

function selectArea(area) {
  setText('area-title', area.label)
  setText('area-coords', `${area.lat.toFixed(5)}°, ${area.lon.toFixed(5)}°`)
  setText('area-region', area.region)
  setText('area-rationale', area.rationale)
  document.querySelectorAll('[data-area]').forEach(button => button.classList.toggle('active', button.dataset.area === area.id))
  if (viewer) {
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(area.lon, area.lat, 2_500_000), duration: 1.1 })
  }
}

function renderAreas() {
  const host = document.getElementById('area-buttons')
  if (!host) return
  for (const area of TEST_AREAS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.area = area.id
    button.textContent = area.label.split(' · ')[0]
    button.addEventListener('click', () => selectArea(area))
    host.appendChild(button)
  }
}

function installImageFallbacks() {
  document.querySelectorAll('.planet-media img').forEach(image => {
    image.addEventListener('error', () => {
      image.style.display = 'none'
      const fallback = image.parentElement?.querySelector('.image-fallback')
      if (fallback) fallback.hidden = false
    })
  })
}

renderCountdowns()
renderEventCards()
renderAreas()
installImageFallbacks()
window.setInterval(renderCountdowns, 1000)
window.addEventListener('load', initMap)

export { ECLIPSE_EVENTS, TEST_AREAS, nextEvent, nextSolar, nextLunar }
