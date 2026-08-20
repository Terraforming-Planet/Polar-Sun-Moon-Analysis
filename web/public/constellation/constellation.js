const $ = selector => document.querySelector(selector)
const providersNode = $('#providers')
const searchNode = $('#search')
const statusNode = $('#status')
const accessNode = $('#access')
const countNode = $('#providerCount')

const statusLabels = {
  'active-adapter': 'Active adapter',
  'ready-for-adapter': 'Ready for adapter',
  'planned-adapter': 'Planned adapter',
  'registered-source': 'Registered source',
  'discovery-backbone': 'Catalogue federation',
  'licence-gated': 'Licence-gated access',
}

function accessGroup(value = '') {
  if (value.includes('public') || value.includes('federated')) return 'public'
  if (value.includes('account') || value.includes('token') || value.includes('registration')) return 'account'
  return 'commercial'
}

function renderProviders(items) {
  providersNode.replaceChildren()
  if (!items.length) {
    providersNode.innerHTML = '<p class="empty">No sources match the selected filters.</p>'
    return
  }
  for (const source of items) {
    const article = document.createElement('article')
    article.className = `provider ${source.status}`
    const api = source.api
      ? `<a href="${source.api}" target="_blank" rel="noreferrer">API / endpoint</a>`
      : '<span class="no-api">No verified public API</span>'
    article.innerHTML = `<div class="provider-head"><span>${source.country}</span><b>${statusLabels[source.status] ?? source.status}</b></div><h2>${source.agency}</h2><p class="missions">${source.missions.join(' · ')}</p><p>${source.notes}</p><dl><dt>Access</dt><dd>${source.access}</dd></dl><div class="links"><a href="${source.portal}" target="_blank" rel="noreferrer">Official catalogue</a>${api}</div>`
    providersNode.append(article)
  }
}

fetch('../data/tp26-global-sources.json')
  .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
  .then(data => {
    const providers = data.providers ?? []
    countNode.textContent = String(providers.length)
    const update = () => {
      const query = searchNode.value.trim().toLowerCase()
      renderProviders(providers.filter(source => {
        const haystack = [source.country, source.agency, ...source.missions, source.notes].join(' ').toLowerCase()
        return (!query || haystack.includes(query)) && (!statusNode.value || source.status === statusNode.value) && (!accessNode.value || accessGroup(source.access) === accessNode.value)
      }))
    }
    searchNode.addEventListener('input', update)
    statusNode.addEventListener('change', update)
    accessNode.addEventListener('change', update)
    update()
  })
  .catch(error => {
    providersNode.innerHTML = `<p class="empty">Failed to load the provider registry: ${String(error)}</p>`
  })

const safety = {
  events: [],
  type: $('#eventType'),
  severity: $('#eventSeverity'),
  search: $('#eventSearch'),
  list: $('#eventList'),
  map: $('#eventMap'),
  visible: $('#visibleEvents'),
}

const typeLabels = {
  fire: 'Fire',
  earthquake: 'Earthquake',
  flood: 'Flood',
  storm: 'Storm / cyclone',
  volcano: 'Volcano',
  space_weather: 'Space weather',
  landslide: 'Landslide',
  drought: 'Drought',
  ice: 'Ice',
}
const severityLabels = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  unknown: 'Unknown',
}
const fmt = value => Number(value || 0).toLocaleString('en-GB')

function formatTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? (value || 'No timestamp')
    : `${date.toLocaleString('en-GB', {timeZone:'UTC'})} UTC`
}

function filteredEvents() {
  const query = safety.search.value.trim().toLowerCase()
  return safety.events.filter(event => {
    const text = [event.title,event.description,event.source,event.status,event.type].join(' ').toLowerCase()
    return (!safety.type.value || event.type === safety.type.value) && (!safety.severity.value || event.severity === safety.severity.value) && (!query || text.includes(query))
  })
}

function renderMap(events) {
  safety.map.querySelectorAll('.event-dot').forEach(node => node.remove())
  for (const event of events.filter(e => Number.isFinite(Number(e.latitude)) && Number.isFinite(Number(e.longitude))).slice(0, 500)) {
    const dot = document.createElement('button')
    dot.className = `event-dot ${event.type || 'unknown'} ${event.severity || 'unknown'}`
    dot.style.left = `${((Number(event.longitude) + 180) / 360) * 100}%`
    dot.style.top = `${((90 - Number(event.latitude)) / 180) * 100}%`
    dot.title = `${event.title || event.type} · ${event.source || ''}`
    dot.addEventListener('click', () => window.open(event.source_url || '#', '_blank', 'noopener'))
    safety.map.append(dot)
  }
}

function renderEvents() {
  const events = filteredEvents()
  safety.visible.textContent = `${fmt(events.length)} events`
  safety.list.replaceChildren()
  if (!events.length) {
    safety.list.innerHTML = '<p class="empty">No events match the selected filters.</p>'
    renderMap([])
    return
  }
  for (const event of events.slice(0, 120)) {
    const card = document.createElement('article')
    card.className = `event-card severity-${event.severity || 'unknown'}`
    const coords = Number.isFinite(Number(event.latitude))
      ? `${Number(event.latitude).toFixed(3)}, ${Number(event.longitude).toFixed(3)}`
      : 'No coordinates'
    card.innerHTML = `<div class="event-meta"><span>${typeLabels[event.type] || event.type || 'Event'}</span><b>${severityLabels[event.severity] || event.severity || 'Unknown'}</b></div><h4>${event.title || 'Unnamed event'}</h4><p>${event.description || ''}</p><dl><dt>Source</dt><dd>${event.source || 'Unknown'}</dd><dt>Time</dt><dd>${formatTime(event.observed_at || event.updated_at)}</dd><dt>Position</dt><dd>${coords}</dd></dl>${event.source_url ? `<a href="${event.source_url}" target="_blank" rel="noreferrer">Open source</a>` : ''}`
    safety.list.append(card)
  }
  renderMap(events)
}

async function loadEvents() {
  $('#monitorStatus').textContent = 'Fetching data…'
  try {
    const response = await fetch(`../data/events/latest.json?t=${Date.now()}`, {cache:'no-store'})
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    safety.events = Array.isArray(data.events) ? data.events : []
    const summary = data.summary || {}
    $('#countAll').textContent = fmt(data.event_count || safety.events.length)
    $('#eventTotalHero').textContent = fmt(data.event_count || safety.events.length)
    $('#countFire').textContent = fmt(summary.fire)
    $('#countEarthquake').textContent = fmt(summary.earthquake)
    $('#countFlood').textContent = fmt(summary.flood)
    $('#countStorm').textContent = fmt(summary.storm)
    $('#countVolcano').textContent = fmt(summary.volcano)
    $('#monitorStatus').textContent = 'Monitor active'
    $('#updatedAt').textContent = formatTime(data.generated_at)
    $('#liveDot').className = 'active'
    renderEvents()
  } catch (error) {
    $('#monitorStatus').textContent = 'Data temporarily unavailable'
    $('#updatedAt').textContent = String(error)
    $('#liveDot').className = 'error'
    safety.list.innerHTML = `<p class="empty">Fetch error: ${String(error)}</p>`
  }
}

for (const node of [safety.type, safety.severity, safety.search]) {
  node.addEventListener('input', renderEvents)
  node.addEventListener('change', renderEvents)
}
$('#refreshEvents').addEventListener('click', loadEvents)
loadEvents()
setInterval(loadEvents, 60000)

function endpointStateLabel(status='') {
  if (status === 'live-public') return 'LIVE PUBLIC'
  if (status === 'public-data') return 'PUBLIC DATA'
  if (status.includes('account')) return 'ACCOUNT / TOKEN'
  return status.toUpperCase().replaceAll('-', ' ')
}

async function loadApiRegistry() {
  const target = $('#apiRegistryCards')
  if (!target) return
  try {
    const response = await fetch(`../data/tp26-api-status.json?t=${Date.now()}`, {cache:'no-store'})
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    target.replaceChildren()
    for (const item of data.endpoints || []) {
      const card = document.createElement('article')
      card.className = `provider ${item.status === 'live-public' ? 'active-adapter' : item.status === 'public-data' ? 'ready-for-adapter' : 'registered-source'}`
      const endpoint = item.endpoint
        ? `<a href="${item.endpoint}" target="_blank" rel="noreferrer">Endpoint</a>`
        : '<span class="no-api">No open endpoint</span>'
      card.innerHTML = `<div class="provider-head"><span>${endpointStateLabel(item.status)}</span><b>${item.checked || ''}</b></div><h2>${item.name}</h2><p>${item.auth || ''}</p><div class="links"><a href="${item.docs}" target="_blank" rel="noreferrer">Official information</a>${endpoint}</div>`
      target.append(card)
    }
    const liveCount = (data.endpoints || []).filter(x => x.status === 'live-public').length
    $('#apiStatus').textContent = `${liveCount} public endpoints verified by response`
    $('#apiCheckedAt').textContent = formatTime(data.checked_utc)
    $('#apiDot').className = 'active'
  } catch (error) {
    target.innerHTML = `<p class="empty">Failed to load the API registry: ${String(error)}</p>`
    $('#apiStatus').textContent = 'API registry unavailable'
    $('#apiCheckedAt').textContent = String(error)
    $('#apiDot').className = 'error'
  }
}

loadApiRegistry()
