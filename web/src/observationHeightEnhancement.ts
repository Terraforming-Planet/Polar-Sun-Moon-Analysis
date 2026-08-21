import './observation-height.css'

export const MIN_OBSERVATION_HEIGHT_KM = 1
export const MAX_OBSERVATION_HEIGHT_KM = 25_000
export const DEFAULT_OBSERVATION_HEIGHT_KM = 25
export const OBSERVATION_SLIDER_STEPS = 1000

const EARTH_RADIUS_KM = 6371.0088
const HALF_FOV_RADIANS = Math.PI / 6
const STORAGE_KEY = 'terra-observation-view-height-km/v1'
const CLOUD_STORAGE_KEY = 'terra-observation-cloud-mode/v1'

let installed = false
let previousFetch: typeof window.fetch | null = null
let wrappedFetch: typeof window.fetch | null = null
let observer: MutationObserver | null = null
let enhanceFrame = 0
let observationController: AbortController | null = null
let observationRunId = 0
let latestObservationRequest: ObservationRequest | null = null
let latestObservationResult: ObservationResponse | null = null

type ObservationRequest = {
  endpoint: string
  latitude: number
  longitude: number
  date: string
}

type ObservationImage = {
  source: string
  source_class: string
  date: string
  url: string
  original_url: string
  cloud_screening: string
  provenance_note: string
}

type ObservationResponse = {
  status: 'image' | 'missing'
  requested_height_km: number
  footprint_radius_km: number
  analysis_radius_recommendation_km: number
  wide_context_only?: boolean
  image?: ObservationImage
  reason?: string
  policy?: string
}

function clampHeight(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_OBSERVATION_HEIGHT_KM
  return Math.min(MAX_OBSERVATION_HEIGHT_KM, Math.max(MIN_OBSERVATION_HEIGHT_KM, Math.round(value)))
}

export function observationFootprintRadiusKm(heightKm: number) {
  const height = clampHeight(heightKm)
  const lensRadius = height * Math.tan(HALF_FOV_RADIANS)
  const horizonAngle = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + height))
  const horizonRadius = EARTH_RADIUS_KM * horizonAngle
  return Math.max(1, Math.min(lensRadius, horizonRadius))
}

export function analysisRadiusForHeightKm(heightKm: number) {
  return Math.min(500, Math.max(1, observationFootprintRadiusKm(heightKm)))
}

export function sliderPositionToHeightKm(position: number) {
  const normalized = Math.min(1, Math.max(0, Number(position) / OBSERVATION_SLIDER_STEPS))
  const height = MIN_OBSERVATION_HEIGHT_KM * Math.pow(MAX_OBSERVATION_HEIGHT_KM / MIN_OBSERVATION_HEIGHT_KM, normalized)
  return clampHeight(height)
}

export function heightKmToSliderPosition(heightKm: number) {
  const height = clampHeight(heightKm)
  const normalized = Math.log(height / MIN_OBSERVATION_HEIGHT_KM) / Math.log(MAX_OBSERVATION_HEIGHT_KM / MIN_OBSERVATION_HEIGHT_KM)
  return Math.round(normalized * OBSERVATION_SLIDER_STEPS)
}

export function readObservationHeightKm() {
  if (typeof window === 'undefined') return DEFAULT_OBSERVATION_HEIGHT_KM
  return clampHeight(Number(window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_OBSERVATION_HEIGHT_KM))
}

export function saveObservationHeightKm(heightKm: number) {
  const height = clampHeight(heightKm)
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, String(height))
  return height
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function requestPath(input: RequestInfo | URL) {
  try { return new URL(requestUrl(input), window.location.href).pathname } catch { return '' }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  return String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
}

function isScaleAwareRequest(input: RequestInfo | URL, init?: RequestInit) {
  if (requestMethod(input, init) !== 'POST') return false
  const path = requestPath(input)
  return path.endsWith('/research/analyze') || path.endsWith('/research/yearly-gallery')
}

function isAnalyzeRequest(input: RequestInfo | URL, init?: RequestInit) {
  return requestMethod(input, init) === 'POST' && requestPath(input).endsWith('/research/analyze')
}

function sourceHint(heightKm: number) {
  if (heightKm <= 250) return 'wysoki detal: Sentinel‑2 / Landsat'
  if (heightKm <= 3000) return 'widok regionalny: NASA VIIRS / MODIS'
  return 'bardzo szeroki widok: NASA GIBS VIIRS / MODIS'
}

function heightLabel(heightKm: number) {
  return heightKm >= 1000 ? `${heightKm.toLocaleString('pl-PL')} km` : `${heightKm} km`
}

function ensureHeightControl() {
  const form = document.querySelector<HTMLFormElement>('.simple-search')
  if (!form || form.parentElement?.querySelector(':scope > .research-observation-height')) return

  const height = readObservationHeightKm()
  const box = document.createElement('section')
  box.className = 'research-observation-height'
  box.innerHTML = `
    <div class="research-observation-height-copy">
      <span><b>Wysokość obserwacji</b><output class="research-height-output"></output></span>
      <small>1–25 000 km · wirtualna wysokość kamery / skala kadru. System dobiera oficjalne źródło; nie zmienia orbity satelity.</small>
      <em class="research-height-source"></em>
    </div>
    <div class="research-observation-height-controls">
      <input class="research-height-range" type="range" min="0" max="${OBSERVATION_SLIDER_STEPS}" step="1" aria-label="Wysokość obserwacji od 1 do 25000 kilometrów" />
      <label><span>km</span><input class="research-height-number" type="number" min="${MIN_OBSERVATION_HEIGHT_KM}" max="${MAX_OBSERVATION_HEIGHT_KM}" step="1" inputmode="numeric" /></label>
    </div>
    <div class="research-height-scale"><span>1 km</span><span>100 km</span><span>1 000 km</span><span>25 000 km</span></div>`

  const range = box.querySelector<HTMLInputElement>('.research-height-range')!
  const number = box.querySelector<HTMLInputElement>('.research-height-number')!
  const output = box.querySelector<HTMLOutputElement>('.research-height-output')!
  const source = box.querySelector<HTMLElement>('.research-height-source')!

  const paint = (value: number) => {
    const next = clampHeight(value)
    range.value = String(heightKmToSliderPosition(next))
    number.value = String(next)
    output.value = heightLabel(next)
    output.textContent = heightLabel(next)
    source.textContent = `${sourceHint(next)} · przybliżony promień kadru ${observationFootprintRadiusKm(next).toFixed(next < 20 ? 1 : 0)} km`
  }

  const commit = (value: number) => {
    const next = saveObservationHeightKm(value)
    paint(next)
    if (latestObservationRequest) void loadObservationView(latestObservationRequest)
  }

  range.value = String(heightKmToSliderPosition(height))
  range.addEventListener('input', () => paint(sliderPositionToHeightKm(Number(range.value))))
  range.addEventListener('change', () => commit(sliderPositionToHeightKm(Number(range.value))))
  number.addEventListener('change', () => commit(Number(number.value)))
  paint(height)
  form.insertAdjacentElement('afterend', box)
}

function observationCard() {
  return document.querySelector<HTMLElement>('.research-observation-view-card')
}

function renderObservationResult(result: ObservationResponse | null, loading = false) {
  const gallery = document.querySelector<HTMLElement>('.simple-context-gallery')
  if (!gallery) return false
  let card = observationCard()
  if (!card) {
    card = document.createElement('section')
    card.className = 'research-observation-view-card'
    const head = gallery.querySelector('.simple-section-head')
    if (head) head.insertAdjacentElement('afterend', card)
    else gallery.prepend(card)
  }

  if (loading || !result) {
    card.innerHTML = '<div class="research-observation-loading"><span></span><b>Ładuję widok dla wybranej wysokości…</b></div>'
    return true
  }

  if (result.status !== 'image' || !result.image) {
    card.innerHTML = `<div class="research-observation-missing"><b>Widok ${heightLabel(result.requested_height_km)}</b><span>${result.reason ?? 'Brak oficjalnego obrazu dla tej daty i skali.'}</span></div>`
    return true
  }

  const image = result.image
  const wideNote = result.wide_context_only
    ? 'To bardzo szeroki kontekst. Analiza wysokiej szczegółowości jest ograniczona do promienia maks. 500 km, aby zachować szybkość i wiarygodność.'
    : 'Ten kadr mieści się w zakresie szczegółowej analizy terenu.'
  card.innerHTML = `
    <div class="research-observation-card-head">
      <div><small>ADAPTACYJNY WIDOK SATELITARNY</small><h3>Widok z wirtualnej wysokości ${heightLabel(result.requested_height_km)}</h3></div>
      <span>${result.footprint_radius_km.toLocaleString('pl-PL')} km promienia kadru</span>
    </div>
    <a class="research-observation-image-link" href="${image.url}" target="_blank" rel="noreferrer"><img src="${image.url}" alt="Widok satelitarny ${image.source} ${image.date}" loading="eager" decoding="async" /></a>
    <div class="research-observation-meta"><b>${image.source}</b><span>${image.date}</span><small>${image.cloud_screening}</small><small>${image.provenance_note}</small><em>${wideNote}</em></div>`
  return true
}

function scheduleObservationRender(result: ObservationResponse | null, loading = false, attempt = 0) {
  if (renderObservationResult(result, loading)) return
  if (attempt >= 20) return
  window.setTimeout(() => scheduleObservationRender(result, loading, attempt + 1), 100)
}

async function loadObservationView(request: ObservationRequest) {
  if (!previousFetch) return
  latestObservationRequest = request
  observationRunId += 1
  const runId = observationRunId
  observationController?.abort()
  observationController = new AbortController()
  scheduleObservationRender(null, true)

  try {
    const url = new URL(request.endpoint)
    url.pathname = url.pathname.replace(/\/research\/analyze$/, '/research/observation-view')
    const response = await previousFetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: request.latitude,
        longitude: request.longitude,
        view_height_km: readObservationHeightKm(),
        date: request.date,
        cloud_mode: window.localStorage.getItem(CLOUD_STORAGE_KEY) === 'any' ? 'any' : 'clear',
      }),
      signal: observationController.signal,
    })
    const payload = await response.json().catch(() => ({})) as ObservationResponse & { error?: string }
    if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`)
    if (runId !== observationRunId) return
    latestObservationResult = payload
    scheduleObservationRender(payload)
  } catch (error) {
    if (observationController.signal.aborted || runId !== observationRunId) return
    const height = readObservationHeightKm()
    const missing: ObservationResponse = {
      status: 'missing',
      requested_height_km: height,
      footprint_radius_km: Number(observationFootprintRadiusKm(height).toFixed(1)),
      analysis_radius_recommendation_km: Number(analysisRadiusForHeightKm(height).toFixed(1)),
      reason: error instanceof Error ? error.message : 'Nie udało się pobrać widoku.',
    }
    latestObservationResult = missing
    scheduleObservationRender(missing)
  }
}

function installFetchPolicy() {
  if (previousFetch || typeof window === 'undefined') return
  previousFetch = window.fetch.bind(window)
  const wrapper: typeof window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!previousFetch || !isScaleAwareRequest(input, init) || typeof init?.body !== 'string') return (previousFetch ?? fetch)(input, init)

    let parsed: Record<string, unknown> | null = null
    try { parsed = JSON.parse(init.body) as Record<string, unknown> } catch { parsed = null }
    if (!parsed) return previousFetch(input, init)

    const height = readObservationHeightKm()
    parsed.radius_km = Number(analysisRadiusForHeightKm(height).toFixed(2))
    const nextInit = { ...init, body: JSON.stringify(parsed) }
    const response = await previousFetch(input, nextInit)

    if (response.ok && isAnalyzeRequest(input, init)) {
      const endpoint = new URL(requestUrl(input), window.location.href).toString()
      const latitude = Number(parsed.latitude)
      const longitude = Number(parsed.longitude)
      const date = typeof parsed.end_date === 'string' ? parsed.end_date : new Date().toISOString().slice(0, 10)
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const request = { endpoint, latitude, longitude, date }
        queueMicrotask(() => { void loadObservationView(request) })
      }
    }
    return response
  }
  wrappedFetch = wrapper
  window.fetch = wrapper
}

function enhanceAll() {
  ensureHeightControl()
  if (latestObservationResult) renderObservationResult(latestObservationResult)
}

function scheduleEnhance() {
  if (enhanceFrame) return
  enhanceFrame = window.requestAnimationFrame(() => {
    enhanceFrame = 0
    enhanceAll()
  })
}

export function installObservationHeightEnhancement() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined
  if (installed) return () => undefined
  installed = true
  installFetchPolicy()
  enhanceAll()
  observer = new MutationObserver(() => scheduleEnhance())
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer?.disconnect()
    observer = null
    if (enhanceFrame) window.cancelAnimationFrame(enhanceFrame)
    enhanceFrame = 0
    observationController?.abort()
    observationController = null
    latestObservationRequest = null
    latestObservationResult = null
    observationCard()?.remove()
    document.querySelector('.research-observation-height')?.remove()
    if (wrappedFetch && window.fetch === wrappedFetch && previousFetch) window.fetch = previousFetch
    wrappedFetch = null
    previousFetch = null
    installed = false
  }
}
