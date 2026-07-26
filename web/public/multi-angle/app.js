const endpoint = 'https://stac.dataspace.copernicus.eu/v1/search'
const form = document.querySelector('#search-form')
const status = document.querySelector('#status')
const results = document.querySelector('#results')
const summary = document.querySelector('#summary')

const value = id => document.querySelector(`#${id}`).value
const safe = input => input === null || input === undefined || input === '' ? 'brak danych' : String(input)
const number = input => Number.isFinite(Number(input)) ? Number(input).toFixed(2) : 'brak danych'

function angle(properties, names) {
  for (const name of names) if (properties[name] !== undefined) return number(properties[name]) + '°'
  return 'brak danych'
}

function assetLinks(assets = {}) {
  return Object.entries(assets).slice(0, 6).map(([name, asset]) => {
    if (!asset?.href) return ''
    return `<a href="${asset.href}" target="_blank" rel="noreferrer">${name}</a>`
  }).join('')
}

function render(items) {
  results.replaceChildren()
  if (!items.length) {
    results.innerHTML = '<div class="empty">Brak produktów dla podanego punktu i czasu. Zwiększ zakres dat lub limit zachmurzenia.</div>'
    summary.style.display = 'none'
    return
  }
  const platforms = new Set(items.map(item => item.properties?.platform).filter(Boolean))
  const orbits = new Set(items.map(item => item.properties?.['sat:relative_orbit']).filter(v => v !== undefined))
  summary.style.display = 'block'
  summary.innerHTML = `<b>Znaleziono ${items.length} produktów</b> · platformy: ${platforms.size || 'brak'} · orbity względne: ${orbits.size || 'brak'}. Każda karta zachowuje własny czas i pochodzenie.`

  for (const item of items) {
    const p = item.properties || {}
    const card = document.createElement('article')
    card.className = 'card'
    card.innerHTML = `
      <span class="badge">${safe(item.collection)}</span>
      <h2>${safe(item.id)}</h2>
      <div class="meta"><span>Czas UTC</span><b>${safe(p.datetime || p.start_datetime)}</b></div>
      <div class="meta"><span>Platforma</span><b>${safe(p.platform)}</b></div>
      <div class="meta"><span>Instrumenty</span><b>${safe(Array.isArray(p.instruments) ? p.instruments.join(', ') : p.instruments)}</b></div>
      <div class="meta"><span>Orbita względna</span><b>${safe(p['sat:relative_orbit'])}</b></div>
      <div class="meta"><span>Kierunek orbity</span><b>${safe(p['sat:orbit_state'])}</b></div>
      <div class="meta"><span>Zachmurzenie</span><b>${number(p['eo:cloud_cover'])}%</b></div>
      <div class="meta"><span>Kąt obserwacji</span><b>${angle(p,['view:off_nadir','view:incidence_angle','sar:incidence_angle'])}</b></div>
      <div class="meta"><span>Azymut obserwacji</span><b>${angle(p,['view:azimuth'])}</b></div>
      <div class="meta"><span>Azymut Słońca</span><b>${angle(p,['view:sun_azimuth'])}</b></div>
      <div class="meta"><span>Wysokość Słońca</span><b>${angle(p,['view:sun_elevation'])}</b></div>
      <p class="warning">Brak kąta oznacza, że katalog nie opublikował tej właściwości dla produktu. Nie jest ona zgadywana.</p>
      <div class="assets">${assetLinks(item.assets)}</div>`
    results.append(card)
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault()
  const lat = Number(value('lat')); const lon = Number(value('lon'))
  const cloud = Number(value('cloud'))
  const collection = value('collection')
  status.textContent = 'Wyszukiwanie w oficjalnym katalogu STAC…'
  results.replaceChildren(); summary.style.display = 'none'
  const body = {
    collections: [collection],
    intersects: { type: 'Point', coordinates: [lon, lat] },
    datetime: `${value('from')}T00:00:00Z/${value('to')}T23:59:59Z`,
    limit: 40,
    sortby: [{ field: 'properties.datetime', direction: 'desc' }]
  }
  if (collection.startsWith('sentinel-2') && Number.isFinite(cloud)) body.query = { 'eo:cloud_cover': { lte: cloud } }
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    const data = await response.json()
    render(data.features || [])
    status.textContent = `Wyniki katalogowe dla ${lat.toFixed(4)}, ${lon.toFixed(4)}. To metadane oryginalnych produktów, nie jeden zszyty obraz.`
  } catch (error) {
    status.textContent = `Nie udało się pobrać katalogu: ${error.message}. Możliwa blokada CORS lub czasowa niedostępność usługi.`
  }
})