const endpoint = 'https://stac.dataspace.copernicus.eu/v1/search'
const form = document.querySelector('#case-form')
const status = document.querySelector('#status')
const results = document.querySelector('#results')
const summary = document.querySelector('#case-summary')
const value = id => document.querySelector(`#${id}`).value
const safe = v => v === null || v === undefined || v === '' ? 'brak danych' : String(v)

function bbox(lon, lat, radiusKm) {
  const dLat = radiusKm / 111
  const dLon = radiusKm / Math.max(1, 111 * Math.cos(lat * Math.PI / 180))
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat]
}

async function searchPeriod(label, range, box) {
  const body = {
    collections: ['sentinel-2-l2a'],
    bbox: box,
    datetime: `${range[0]}T00:00:00Z/${range[1]}T23:59:59Z`,
    query: { 'eo:cloud_cover': { lte: 45 } },
    sortby: [
      { field: 'properties.eo:cloud_cover', direction: 'asc' },
      { field: 'properties.datetime', direction: 'desc' }
    ],
    limit: 8
  }
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`${label}: ${response.status} ${response.statusText}`)
  const data = await response.json()
  return { label, features: data.features || [] }
}

function card(item, period) {
  const p = item.properties || {}
  const preview = Object.entries(item.assets || {}).find(([name, asset]) => /preview|thumbnail|visual/i.test(name) && asset?.href)
  const product = Object.entries(item.assets || {}).find(([, asset]) => asset?.href)
  return `<article class="card">
    <span class="badge">${period}</span>
    <h2>${safe(item.id)}</h2>
    <div class="meta"><span>Czas UTC</span><b>${safe(p.datetime)}</b></div>
    <div class="meta"><span>Platforma</span><b>${safe(p.platform)}</b></div>
    <div class="meta"><span>Zachmurzenie</span><b>${safe(p['eo:cloud_cover'])}%</b></div>
    <div class="meta"><span>Orbita</span><b>${safe(p['sat:relative_orbit'])}</b></div>
    <div class="meta"><span>Poziom przetwarzania</span><b>${safe(p['processing:level'])}</b></div>
    <p class="warning">To produkt obserwacyjny, nie dowód winy konkretnej osoby.</p>
    <div class="assets">
      ${preview ? `<a href="${preview[1].href}" target="_blank" rel="noreferrer">Podgląd</a>` : ''}
      ${product ? `<a href="${product[1].href}" target="_blank" rel="noreferrer">Zasób produktu</a>` : ''}
    </div>
  </article>`
}

form.addEventListener('submit', async event => {
  event.preventDefault()
  results.replaceChildren(); summary.style.display = 'none'
  const lat = Number(value('lat')); const lon = Number(value('lon')); const radius = Number(value('radius'))
  const box = bbox(lon, lat, radius)
  status.textContent = 'Pobieranie produktów „przed” i „po”…'
  try {
    const [before, after] = await Promise.all([
      searchPeriod('PRZED', [value('before-from'), value('before-to')], box),
      searchPeriod('PO', [value('after-from'), value('after-to')], box)
    ])
    const selectedBefore = before.features.slice(0, 4)
    const selectedAfter = after.features.slice(0, 4)
    results.innerHTML = selectedBefore.map(item => card(item, 'PRZED')).join('') + selectedAfter.map(item => card(item, 'PO')).join('')
    if (!selectedBefore.length && !selectedAfter.length) results.innerHTML = '<div class="empty">Brak produktów w obu okresach. Zwiększ zakres dat lub obszar.</div>'
    summary.style.display = 'block'
    summary.innerHTML = `<b>${safe(value('case-type'))}</b> · obszar ${radius} km wokół ${lat.toFixed(4)}, ${lon.toFixed(4)} · produkty przed: ${before.features.length} · produkty po: ${after.features.length}. System nie wykonuje jeszcze automatycznej klasyfikacji zmiany; pokazuje najlepsze kandydaty do ręcznego i przyszłego algorytmicznego porównania.`
    status.textContent = 'Pakiet porównawczy utworzony z metadanych oryginalnych produktów.'
  } catch (error) {
    status.textContent = `Nie udało się pobrać danych: ${error.message}. Możliwa blokada CORS lub czasowa niedostępność katalogu.`
  }
})