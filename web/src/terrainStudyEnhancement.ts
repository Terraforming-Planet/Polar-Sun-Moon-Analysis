import './terrain-study.css'
import { analysisRadiusForHeightKm, readObservationHeightKm } from './observationHeightEnhancement'
import {
  readSatelliteTimeSelection,
  requestedSatelliteDateTimeUtc,
  type SatelliteTimeSelection,
} from './satelliteTimeSelection'
import { buildStoredZip, type ZipInputFile } from './researchGalleryEnhancements'

export const MAX_CONCURRENT_YEAR_REQUESTS = 4
export const YEAR_REQUEST_TIMEOUT_MS = 28_000
const AI_REQUEST_TIMEOUT_MS = 65_000
const AI_BATCH_SIZE = 5
const ZIP_LIMIT_BYTES = 150 * 1024 * 1024

export type TerrainStudyImage = {
  scene_id?: string | null
  date: string
  datetime_utc?: string | null
  platform: string
  source: string
  kind?: string
  cloud_cover?: number | null
  threshold?: number
  thumbnail_url: string
  full_url: string
  original_thumbnail_url?: string
  original_full_url?: string
  requested_scale_km?: number | null
  actual_scale_km?: number | null
  footprint_radius_km?: number | null
  scale_locked?: boolean
  note?: string
}

export type TerrainStudySlot = {
  year: number
  status: 'loading' | 'ready' | 'no-clear-study-image' | 'error'
  standard?: string
  analysis_image?: TerrainStudyImage | null
  original_image?: TerrainStudyImage | null
  warning?: string
  reason?: string
}

type StudyResponse = {
  mode: 'study' | 'exact'
  requested_years?: number[]
  requested_utc?: string
  cloud_filter_applied?: boolean
  slots?: TerrainStudySlot[]
  original_image?: TerrainStudyImage | null
  status?: string
  reason?: string | null
  ai_analysis?: { text: string; inspected: number } | null
  error?: string
}

type ResearchRequest = {
  endpoint: string
  latitude: number
  longitude: number
  placeName: string
  radiusKm: number
  selection: SatelliteTimeSelection
}

type AiReport = { years: number[]; text: string; inspected: number }

let installed = false
let previousFetch: typeof window.fetch | null = null
let observer: MutationObserver | null = null
let renderFrame = 0
let runId = 0
let controller: AbortController | null = null
let latestRequest: ResearchRequest | null = null
let slots = new Map<number, TerrainStudySlot>()
let reports: AiReport[] = []
let aiHandledYears = new Set<number>()
let aiBusy = false
let totalYears = 0
let studyActive = false

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function isAnalyzeRequest(input: RequestInfo | URL, init?: RequestInit) {
  const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method !== 'POST') return false
  try { return new URL(requestUrl(input), window.location.href).pathname.endsWith('/research/analyze') } catch { return false }
}

export function yearsForTerrainStudy(selection: SatelliteTimeSelection) {
  if (selection.preset === 'exact') return []
  const end = Number(selection.endYear)
  if (!Number.isInteger(end)) return []
  if (selection.preset === 'twenty-years') return Array.from({ length: 20 }, (_, index) => end - 19 + index).filter(year => year >= 1972)
  if (selection.preset === 'five-years') return Array.from({ length: 5 }, (_, index) => end - 4 + index).filter(year => year >= 1972)
  if (selection.preset === 'one-year') return end >= 1972 ? [end] : []
  const start = Number(selection.startYear)
  if (!Number.isInteger(start) || start > end) return []
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function seasonForSelection(selection: SatelliteTimeSelection) {
  return selection.preset === 'seasonal' ? selection.season : 'all'
}

function resolvedCount() {
  return [...slots.values()].filter(slot => slot.status !== 'loading').length
}

function readyCount() {
  return [...slots.values()].filter(slot => slot.status === 'ready' && slot.analysis_image).length
}

function loadingCount() {
  return [...slots.values()].filter(slot => slot.status === 'loading').length
}

function orderedSlots() {
  return [...slots.values()].sort((a, b) => a.year - b.year)
}

function studySection() {
  return document.querySelector<HTMLElement>('.terrain-study-section')
}

function setDailyContextVisibility(hidden: boolean) {
  const context = document.querySelector<HTMLElement>('.simple-context-gallery .simple-context-grid')
  if (!context) return
  context.hidden = hidden
  let toggle = document.querySelector<HTMLButtonElement>('.terrain-daily-context-toggle')
  if (!toggle) {
    toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'secondary terrain-daily-context-toggle'
    context.insertAdjacentElement('beforebegin', toggle)
    toggle.addEventListener('click', () => {
      context.hidden = !context.hidden
      toggle!.textContent = context.hidden ? 'Pokaż oryginalny dzienny kontekst (może zawierać chmury)' : 'Ukryj oryginalny dzienny kontekst'
    })
  }
  toggle.textContent = hidden ? 'Pokaż oryginalny dzienny kontekst (może zawierać chmury)' : 'Ukryj oryginalny dzienny kontekst'
}

function suppressSingleObservationCard(suppress: boolean) {
  document.querySelectorAll<HTMLElement>('.research-observation-view-card').forEach(card => {
    if (suppress) card.style.display = 'none'
    else card.style.removeProperty('display')
  })
}

function ensureSection() {
  const gallery = document.querySelector<HTMLElement>('.simple-context-gallery')
  if (!gallery) return null
  let section = studySection()
  if (section) return section
  section = document.createElement('section')
  section.className = 'terrain-study-section simple-selected-period-images'
  const head = gallery.querySelector('.simple-section-head')
  if (head) head.insertAdjacentElement('afterend', section)
  else gallery.prepend(section)
  return section
}

function cloudLabel(image: TerrainStudyImage) {
  if (typeof image.cloud_cover === 'number') return `${image.cloud_cover.toFixed(1)}% zachmurzenia sceny`
  if (image.threshold != null) return `filtr chmur ≤ ${image.threshold}%`
  return 'brak dokładnej wartości zachmurzenia w metadanych źródła'
}

function scaleLabel(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('pl-PL')} km` : 'n/d'
}

function openImageModal(image: TerrainStudyImage, title: string) {
  document.querySelector('.terrain-image-modal')?.remove()
  const modal = document.createElement('div')
  modal.className = 'terrain-image-modal'
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  const panel = document.createElement('div')
  panel.className = 'terrain-image-modal-panel'
  const top = document.createElement('div')
  top.className = 'terrain-image-modal-head'
  const heading = document.createElement('b')
  heading.textContent = title
  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = '✕'
  close.setAttribute('aria-label', 'Zamknij pełny obraz')
  top.append(heading, close)
  const loading = document.createElement('span')
  loading.className = 'terrain-modal-loading'
  loading.textContent = 'Ładuję pełny obraz…'
  const img = document.createElement('img')
  img.src = image.full_url
  img.alt = `${image.source} ${image.date}`
  img.decoding = 'async'
  img.addEventListener('load', () => loading.remove())
  img.addEventListener('error', () => { loading.textContent = 'Pełny obraz nie załadował się. Otwórz oficjalne źródło.' })
  const meta = document.createElement('div')
  meta.className = 'terrain-modal-meta'
  meta.textContent = `${image.date} · ${image.source} · ${cloudLabel(image)} · requested_scale_km ${scaleLabel(image.requested_scale_km)} · actual_scale_km ${scaleLabel(image.actual_scale_km)}`
  const sourceLink = document.createElement('a')
  sourceLink.href = image.original_full_url ?? image.full_url
  sourceLink.target = '_blank'
  sourceLink.rel = 'noreferrer'
  sourceLink.textContent = 'Otwórz oficjalne źródło / pełny plik'
  panel.append(top, loading, img, meta, sourceLink)
  modal.appendChild(panel)
  const dismiss = () => modal.remove()
  close.addEventListener('click', dismiss)
  modal.addEventListener('click', event => { if (event.target === modal) dismiss() })
  document.body.appendChild(modal)
}

function makeStudyCard(slot: TerrainStudySlot) {
  const card = document.createElement('article')
  card.className = 'terrain-study-card'
  card.dataset.year = String(slot.year)
  card.dataset.status = slot.status
  const title = document.createElement('h3')
  title.textContent = String(slot.year)
  card.appendChild(title)

  if (slot.status === 'loading') {
    card.classList.add('loading')
    const pending = document.createElement('p')
    pending.textContent = '⏳ loading · szukam najlepszej oficjalnej sceny dla tego rocznika…'
    card.appendChild(pending)
    return card
  }

  if (slot.status !== 'ready' || !slot.analysis_image) {
    card.classList.add('missing')
    const state = document.createElement('b')
    state.textContent = slot.status === 'error' ? 'timeout / fetch error' : 'no usable scene found'
    const warning = document.createElement('p')
    warning.textContent = slot.reason ?? 'Nie znaleziono używalnej oficjalnej sceny dla tego rocznika.'
    card.append(state, warning)
    if (slot.original_image) {
      const original = document.createElement('button')
      original.type = 'button'
      original.className = 'secondary'
      original.textContent = 'Pokaż oryginalne źródło'
      original.addEventListener('click', () => openImageModal(slot.original_image!, `Oryginalna obserwacja ${slot.year}`))
      card.appendChild(original)
    }
    return card
  }

  const image = slot.analysis_image
  const thumbButton = document.createElement('button')
  thumbButton.type = 'button'
  thumbButton.className = 'terrain-thumb-button'
  const img = document.createElement('img')
  img.src = image.thumbnail_url
  img.alt = `Obraz badawczy ${slot.year}: ${image.source}`
  img.loading = slot.year === orderedSlots()[0]?.year ? 'eager' : 'lazy'
  img.decoding = 'async'
  img.width = 420
  img.height = 420
  thumbButton.appendChild(img)
  thumbButton.addEventListener('click', () => openImageModal(image, `Obraz do analizy terenu ${slot.year}`))

  const meta = document.createElement('div')
  meta.className = 'terrain-study-meta'
  const badge = document.createElement('b')
  badge.textContent = 'ready · OBRAZ DO ANALIZY TERENU'
  const source = document.createElement('span')
  source.textContent = `source: ${image.source}`
  const date = document.createElement('small')
  date.textContent = `date: ${image.date}`
  const cloud = document.createElement('small')
  cloud.textContent = `cloud cover: ${cloudLabel(image)} · ${slot.standard ?? 'najlepsza dostępna pogoda'}`
  const scale = document.createElement('small')
  scale.textContent = `requested_scale_km: ${scaleLabel(image.requested_scale_km)} · actual_scale_km: ${scaleLabel(image.actual_scale_km)}`
  meta.append(badge, source, date, cloud, scale)
  if (slot.warning) {
    const note = document.createElement('small')
    note.className = 'terrain-study-warning'
    note.textContent = slot.warning
    meta.appendChild(note)
  }

  const actions = document.createElement('div')
  actions.className = 'terrain-study-actions'
  const full = document.createElement('button')
  full.type = 'button'
  full.className = 'secondary'
  full.textContent = 'Powiększ'
  full.addEventListener('click', () => openImageModal(image, `Obraz do analizy terenu ${slot.year}`))
  actions.appendChild(full)
  if (slot.original_image) {
    const original = document.createElement('button')
    original.type = 'button'
    original.className = 'secondary'
    original.textContent = 'Oryginał · chmury zachowane'
    original.addEventListener('click', () => openImageModal(slot.original_image!, `Oryginalna obserwacja ${slot.year}`))
    actions.appendChild(original)
  }
  card.append(thumbButton, meta, actions)
  return card
}

function renderExact(section: HTMLElement, response: StudyResponse) {
  studyActive = false
  suppressSingleObservationCard(false)
  section.replaceChildren()
  const head = document.createElement('div')
  head.className = 'terrain-study-head'
  const copy = document.createElement('div')
  copy.innerHTML = '<small>DOKŁADNA DATA + GODZINA · ORYGINAŁ</small><h2>Oryginalna obserwacja — bez filtrowania chmur</h2><p>Dokładny czas zachowuje najbliższą prawdziwą obserwację. Chmury nie są usuwane ani podmieniane.</p>'
  head.appendChild(copy)
  section.appendChild(head)
  if (!response.original_image) {
    const missing = document.createElement('p')
    missing.className = 'research-error'
    missing.textContent = response.reason ?? 'Brak oryginalnej sceny dla wybranego dnia.'
    section.appendChild(missing)
    return
  }
  const image = response.original_image
  const card = document.createElement('article')
  card.className = 'terrain-study-card exact'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'terrain-thumb-button'
  const img = document.createElement('img')
  img.src = image.thumbnail_url
  img.alt = `Oryginalna obserwacja ${image.date}`
  img.loading = 'eager'
  img.decoding = 'async'
  button.appendChild(img)
  button.addEventListener('click', () => openImageModal(image, 'Oryginalna obserwacja dokładnego czasu'))
  const meta = document.createElement('p')
  meta.textContent = `${image.datetime_utc ?? image.date} · ${image.source} · ${cloudLabel(image)}`
  card.append(button, meta)
  section.appendChild(card)
}

function renderStudy() {
  const section = ensureSection()
  if (!section || !latestRequest || latestRequest.selection.preset === 'exact') return
  studyActive = true
  suppressSingleObservationCard(true)
  setDailyContextVisibility(true)
  section.replaceChildren()

  const head = document.createElement('div')
  head.className = 'terrain-study-head'
  const copy = document.createElement('div')
  const small = document.createElement('small')
  small.textContent = 'ROCZNIK PO ROCZNIKU · NAJLEPSZA DOSTĘPNA POGODA'
  const title = document.createElement('h2')
  title.textContent = `${totalYears} selected years = ${totalYears} yearly study images`
  const note = document.createElement('p')
  note.textContent = 'Wszystkie karty rocznikowe są tworzone od razu. Każdy rok ładuje się niezależnie; błąd albo timeout jednego roku nie zatrzymuje pozostałych.'
  copy.append(small, title, note)
  const status = document.createElement('span')
  status.className = 'terrain-study-status'
  status.textContent = `Gotowe ${resolvedCount()}/${totalYears} · obrazy ${readyCount()}/${totalYears}${loadingCount() ? ` · pracuje ${loadingCount()}` : ''}`
  head.append(copy, status)
  section.appendChild(head)

  const toolbar = document.createElement('div')
  toolbar.className = 'terrain-study-toolbar'
  const count = document.createElement('span')
  count.textContent = `${totalYears} roczników · wszystkie placeholdery widoczne`
  const actions = document.createElement('div')
  const manifest = document.createElement('button')
  manifest.type = 'button'
  manifest.className = 'secondary'
  manifest.textContent = 'Pobierz manifest JSON'
  manifest.addEventListener('click', downloadManifest)
  const zip = document.createElement('button')
  zip.type = 'button'
  zip.className = 'secondary'
  zip.textContent = 'Pobierz ZIP · pokazany zestaw'
  zip.addEventListener('click', () => { void downloadStudyZip(zip) })
  actions.append(manifest, zip)
  toolbar.append(count, actions)
  section.appendChild(toolbar)

  const grid = document.createElement('div')
  grid.className = 'terrain-study-grid'
  for (const slot of orderedSlots()) grid.appendChild(makeStudyCard(slot))
  section.appendChild(grid)

  const ai = document.createElement('section')
  ai.className = 'terrain-ai-stream'
  const aiTitle = document.createElement('h3')
  aiTitle.textContent = 'AI · analiza gotowych roczników w tle'
  ai.appendChild(aiTitle)
  if (!reports.length) {
    const pending = document.createElement('p')
    pending.textContent = readyCount() ? 'Galeria działa niezależnie. AI analizuje pierwsze dostępne obrazy bez blokowania pozostałych kart…' : 'AI wystartuje po pojawieniu się pierwszego gotowego obrazu.'
    ai.appendChild(pending)
  }
  for (const report of reports) {
    const article = document.createElement('article')
    const label = document.createElement('b')
    label.textContent = `${report.years.join(', ')} · AI obejrzało ${report.inspected} obrazów`
    const text = document.createElement('p')
    text.textContent = report.text
    article.append(label, text)
    ai.appendChild(article)
  }
  section.appendChild(ai)
}

function scheduleRender() {
  if (renderFrame) return
  renderFrame = window.requestAnimationFrame(() => { renderFrame = 0; renderStudy() })
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, parentSignal: AbortSignal) {
  if (!previousFetch) throw new Error('Fetch unavailable.')
  const timeoutController = new AbortController()
  const parentAbort = () => timeoutController.abort()
  parentSignal.addEventListener('abort', parentAbort, { once: true })
  const timer = window.setTimeout(() => timeoutController.abort(), timeoutMs)
  try {
    return await previousFetch(url, { ...init, signal: timeoutController.signal })
  } catch (error) {
    if (!parentSignal.aborted && timeoutController.signal.aborted) throw new Error(`timeout: przekroczono ${Math.round(timeoutMs / 1000)} s oczekiwania na źródło.`)
    throw error
  } finally {
    window.clearTimeout(timer)
    parentSignal.removeEventListener('abort', parentAbort)
  }
}

async function postStudy(request: ResearchRequest, years: number[], analyze: boolean, signal: AbortSignal) {
  const url = new URL(request.endpoint)
  url.pathname = url.pathname.replace(/\/research\/analyze$/, analyze ? '/research/terrain-study/analyze' : '/research/terrain-study')
  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      latitude: request.latitude,
      longitude: request.longitude,
      radius_km: request.radiusKm,
      years,
      season: seasonForSelection(request.selection),
      mode: 'study',
      place_name: request.placeName,
    }),
  }, analyze ? AI_REQUEST_TIMEOUT_MS : YEAR_REQUEST_TIMEOUT_MS, signal)
  const payload = await response.json().catch(() => ({})) as StudyResponse
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`)
  return payload
}

async function runExact(request: ResearchRequest, signal: AbortSignal) {
  if (!previousFetch) return
  const exactUtc = requestedSatelliteDateTimeUtc(request.selection)
  if (!exactUtc) return
  const url = new URL(request.endpoint)
  url.pathname = url.pathname.replace(/\/research\/analyze$/, '/research/terrain-study')
  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: request.latitude, longitude: request.longitude, radius_km: request.radiusKm, mode: 'exact', exact_utc: exactUtc, place_name: request.placeName }),
  }, YEAR_REQUEST_TIMEOUT_MS, signal)
  const payload = await response.json().catch(() => ({})) as StudyResponse
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`)
  const section = ensureSection()
  if (section) renderExact(section, payload)
  setDailyContextVisibility(false)
}

function pumpAi(request: ResearchRequest, currentRun: number, signal: AbortSignal) {
  if (aiBusy || signal.aborted || currentRun !== runId) return
  const readyYears = orderedSlots()
    .filter(slot => slot.status === 'ready' && slot.analysis_image && !aiHandledYears.has(slot.year))
    .map(slot => slot.year)
    .slice(0, AI_BATCH_SIZE)
  if (!readyYears.length) return
  readyYears.forEach(year => aiHandledYears.add(year))
  aiBusy = true
  void postStudy(request, readyYears, true, signal).then(payload => {
    if (signal.aborted || currentRun !== runId || !payload.ai_analysis) return
    reports.push({ years: readyYears, text: payload.ai_analysis.text, inspected: payload.ai_analysis.inspected })
    scheduleRender()
  }).catch(() => undefined).finally(() => {
    aiBusy = false
    if (!signal.aborted && currentRun === runId) pumpAi(request, currentRun, signal)
  })
}

async function processYear(request: ResearchRequest, year: number, currentRun: number, signal: AbortSignal) {
  try {
    const payload = await postStudy(request, [year], false, signal)
    if (signal.aborted || currentRun !== runId) return
    const slot = payload.slots?.find(item => item.year === year)
    slots.set(year, slot ?? { year, status: 'error', reason: 'fetch error: źródło nie zwróciło karty dla tego rocznika.' })
  } catch (error) {
    if (signal.aborted || currentRun !== runId) return
    slots.set(year, { year, status: 'error', reason: error instanceof Error ? error.message : 'fetch error: błąd pobierania rocznika.' })
  }
  scheduleRender()
  pumpAi(request, currentRun, signal)
}

export async function runYearTasksWithConcurrency(
  years: number[],
  task: (year: number) => Promise<void>,
  concurrency = MAX_CONCURRENT_YEAR_REQUESTS,
) {
  let cursor = 0
  const count = Math.min(Math.max(1, Math.trunc(concurrency)), years.length)
  const worker = async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= years.length) return
      await task(years[index])
    }
  }
  await Promise.all(Array.from({ length: count }, () => worker()))
}

async function runConcurrentYears(request: ResearchRequest, years: number[], currentRun: number, signal: AbortSignal) {
  await runYearTasksWithConcurrency(years, async year => {
    if (signal.aborted || currentRun !== runId) return
    await processYear(request, year, currentRun, signal)
  })
}

async function runStudy(request: ResearchRequest) {
  latestRequest = request
  reports = []
  aiHandledYears = new Set()
  aiBusy = false
  runId += 1
  const currentRun = runId
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal

  if (request.selection.preset === 'exact') {
    slots = new Map()
    totalYears = 0
    studyActive = false
    suppressSingleObservationCard(false)
    try { await runExact(request, signal) }
    catch (error) {
      const section = ensureSection()
      if (section) {
        section.replaceChildren()
        const message = document.createElement('p')
        message.className = 'research-error'
        message.textContent = error instanceof Error ? error.message : 'Nie udało się pobrać oryginalnej obserwacji.'
        section.appendChild(message)
      }
    }
    return
  }

  const years = yearsForTerrainStudy(request.selection)
  totalYears = years.length
  slots = new Map(years.map(year => [year, { year, status: 'loading' as const }]))
  studyActive = true
  suppressSingleObservationCard(true)
  setDailyContextVisibility(true)
  renderStudy()

  await runConcurrentYears(request, years, currentRun, signal)
  if (signal.aborted || currentRun !== runId) return
  for (const year of years) {
    if (slots.get(year)?.status === 'loading') slots.set(year, { year, status: 'error', reason: 'timeout: rocznik nie zakończył pobierania w limicie czasu.' })
  }
  scheduleRender()
  pumpAi(request, currentRun, signal)
}

function installFetchPolicy() {
  if (previousFetch || typeof window === 'undefined') return
  previousFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!previousFetch || !isAnalyzeRequest(input, init) || typeof init?.body !== 'string') return (previousFetch ?? fetch)(input, init)
    let parsed: Record<string, unknown> | null = null
    try { parsed = JSON.parse(init.body) as Record<string, unknown> } catch { parsed = null }

    if (parsed) {
      const latitude = Number(parsed.latitude)
      const longitude = Number(parsed.longitude)
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        const height = readObservationHeightKm()
        const request: ResearchRequest = {
          endpoint: new URL(requestUrl(input), window.location.href).toString(),
          latitude,
          longitude,
          radiusKm: Number(analysisRadiusForHeightKm(height).toFixed(2)),
          placeName: typeof parsed.place_name === 'string' ? parsed.place_name : '',
          selection: readSatelliteTimeSelection(),
        }
        queueMicrotask(() => { void runStudy(request) })
      }
    }

    return previousFetch(input, init)
  }
}

function textBytes(value: string) { return new TextEncoder().encode(value) }

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000)
}

export function terrainStudyManifestSnapshot() {
  const selectedYears = orderedSlots().map(slot => slot.year)
  return {
    generated_at_utc: new Date().toISOString(),
    cloud_policy: 'Sentinel-2 L2A preferred; Landsat Collection 2 Surface Reflectance next; cloudy least-cloud scene only when clearly labelled; context fallbacks stay separate',
    requested_year_count: totalYears,
    selected_years: selectedYears,
    ready_image_count: readyCount(),
    selection: latestRequest?.selection ?? null,
    requested_scale_km: readObservationHeightKm(),
    observation_height_km: readObservationHeightKm(),
    place: latestRequest ? { latitude: latestRequest.latitude, longitude: latestRequest.longitude, name: latestRequest.placeName } : null,
    slots: orderedSlots(),
    ai_batches: reports.map(report => ({ years: report.years, inspected: report.inspected })),
  }
}

function downloadManifest() {
  triggerDownload(new Blob([JSON.stringify(terrainStudyManifestSnapshot(), null, 2)], { type: 'application/json' }), 'terra-observation-terrain-study.json')
}

async function downloadStudyZip(button: HTMLButtonElement) {
  const old = button.textContent ?? 'Pobierz ZIP'
  button.disabled = true
  button.textContent = 'Buduję ZIP…'
  const manifest = terrainStudyManifestSnapshot()
  const files: ZipInputFile[] = [{ name: 'manifest.json', data: textBytes(JSON.stringify(manifest, null, 2)) }]
  let total = files[0].data.byteLength
  try {
    for (const slot of orderedSlots()) {
      const image = slot.analysis_image
      if (!image || slot.status !== 'ready') {
        files.push({ name: `years/${slot.year}/unavailable.txt`, data: textBytes(`${slot.status}: ${slot.reason ?? 'no usable scene found'}`) })
        continue
      }
      try {
        const response = await fetch(image.full_url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = new Uint8Array(await response.arrayBuffer())
        if (total + data.byteLength > ZIP_LIMIT_BYTES) {
          files.push({ name: `years/${slot.year}/unavailable.txt`, data: textBytes('ready in gallery but omitted from ZIP because the 150 MB export limit was reached') })
          continue
        }
        const type = response.headers.get('content-type') ?? ''
        const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
        files.push({ name: `years/${slot.year}/study.${ext}`, data })
        total += data.byteLength
      } catch (error) {
        files.push({ name: `years/${slot.year}/unavailable.txt`, data: textBytes(`export fetch error: ${error instanceof Error ? error.message : 'unknown error'}`) })
      }
    }
    const zip = buildStoredZip(files)
    triggerDownload(new Blob([zip], { type: 'application/zip' }), 'terra-observation-terrain-study.zip')
  } finally {
    button.disabled = false
    button.textContent = old
  }
}

function enhanceAll() {
  if (studyActive) {
    suppressSingleObservationCard(true)
    setDailyContextVisibility(true)
  }
}

function scheduleEnhance() {
  if (renderFrame) return
  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = 0
    enhanceAll()
  })
}

export function installTerrainStudyEnhancement() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined
  if (installed) return () => undefined
  installed = true
  installFetchPolicy()
  observer = new MutationObserver(() => scheduleEnhance())
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer?.disconnect()
    observer = null
    if (renderFrame) window.cancelAnimationFrame(renderFrame)
    renderFrame = 0
    controller?.abort()
    controller = null
    latestRequest = null
    slots = new Map()
    reports = []
    aiHandledYears = new Set()
    aiBusy = false
    totalYears = 0
    studyActive = false
    studySection()?.remove()
    suppressSingleObservationCard(false)
    document.querySelector('.terrain-daily-context-toggle')?.remove()
    document.querySelector<HTMLElement>('.simple-context-gallery .simple-context-grid')?.removeAttribute('hidden')
    if (previousFetch) window.fetch = previousFetch
    previousFetch = null
    installed = false
  }
}
