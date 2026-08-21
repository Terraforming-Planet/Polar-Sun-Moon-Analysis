import './research-gallery-enhancements.css'
import { readSatelliteTimeSelection, type SatelliteTimeSelection } from './satelliteTimeSelection'

export type ResearchCloudMode = 'clear' | 'any'
export type ZipInputFile = { name: string; data: Uint8Array }

type GalleryImage = {
  year: number
  date: string
  source: string
  url: string
  original_url?: string
  scene_id?: string | null
  cloud_cover?: number | null
  cloud_preference_met?: boolean
}

type GallerySlot = {
  year: number
  status: 'image' | 'missing'
  image?: GalleryImage
  reason?: string
  warning?: string
}

type GalleryBatchResponse = {
  slots: GallerySlot[]
  requested_years: number[]
}

type ProgressiveRequest = {
  endpoint: string
  latitude: number
  longitude: number
  radiusKm: number
  selection: SatelliteTimeSelection
}

const CLOUD_STORAGE_KEY = 'terra-observation-cloud-mode/v1'
const INITIAL_VISIBLE_IMAGES = 10
const MAX_ZIP_BYTES = 150 * 1024 * 1024
const GALLERY_BATCH_SIZE = 5
let installed = false
let originalFetch: typeof window.fetch | null = null
let observer: MutationObserver | null = null
let enhanceFrame = 0
let progressiveRunId = 0
let progressiveController: AbortController | null = null
let latestProgressiveRequest: ProgressiveRequest | null = null
let progressiveTotal = 0
let progressiveLoaded = 0
let progressiveMode: ResearchCloudMode = 'clear'
let progressiveSlots = new Map<number, GallerySlot>()

export function readResearchCloudMode(): ResearchCloudMode {
  if (typeof window === 'undefined') return 'clear'
  return window.localStorage.getItem(CLOUD_STORAGE_KEY) === 'any' ? 'any' : 'clear'
}

export function saveResearchCloudMode(mode: ResearchCloudMode) {
  if (typeof window !== 'undefined') window.localStorage.setItem(CLOUD_STORAGE_KEY, mode)
  return mode
}

function setText(element: HTMLElement | null | undefined, value: string) {
  if (element && element.textContent !== value) element.textContent = value
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function isAreaAnalysisRequest(input: RequestInfo | URL, init?: RequestInit) {
  const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method !== 'POST') return false
  try { return new URL(requestUrl(input), window.location.href).pathname.endsWith('/research/analyze') } catch { return false }
}

export function yearsForResearchSelection(selection: SatelliteTimeSelection) {
  const startYear = Number(selection.startYear)
  const endYear = Number(selection.endYear)
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear) return []
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index)
}

function gallerySeason(selection: SatelliteTimeSelection) {
  return selection.preset === 'seasonal' ? selection.season : 'all'
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function progressiveSection() {
  return document.querySelector<HTMLElement>('.research-progressive-yearly-gallery')
}

function removeProgressiveSection() {
  progressiveSection()?.remove()
  document.querySelectorAll<HTMLElement>('.simple-context-gallery .simple-selected-period-images:not(.research-progressive-yearly-gallery)').forEach(element => { element.hidden = false })
}

function createProgressiveSection(runId: number) {
  const sourceGallery = document.querySelector<HTMLElement>('.simple-context-gallery .simple-selected-period-images:not(.research-progressive-yearly-gallery)')
  if (!sourceGallery) return null
  const existing = progressiveSection()
  if (existing?.dataset.runId === String(runId)) return existing
  existing?.remove()

  sourceGallery.hidden = true
  const section = document.createElement('section')
  section.className = 'simple-selected-period-images research-progressive-yearly-gallery'
  section.dataset.runId = String(runId)

  const head = document.createElement('div')
  head.className = 'simple-section-head'
  const headCopy = document.createElement('div')
  const small = document.createElement('small')
  small.textContent = 'ROCZNIK PO ROCZNIKU · OFICJALNE OBRAZY'
  const title = document.createElement('h2')
  title.textContent = 'Zdjęcia źródłowe — jedno miejsce, jeden rocznik'
  const note = document.createElement('p')
  note.className = 'research-progressive-note'
  note.textContent = 'Analiza AI terenu pojawia się niezależnie. Roczniki są pobierane osobno w małych paczkach, dzięki czemu telefon i strona pozostają responsywne.'
  headCopy.append(small, title, note)
  head.appendChild(headCopy)

  const progress = document.createElement('div')
  progress.className = 'research-year-progress'
  progress.setAttribute('role', 'status')
  const grid = document.createElement('div')
  grid.className = 'simple-image-grid'

  section.append(head, progress, grid)
  sourceGallery.insertAdjacentElement('afterend', section)
  return section
}

function updateProgress(runId: number, message?: string) {
  const section = createProgressiveSection(runId)
  const progress = section?.querySelector<HTMLElement>('.research-year-progress')
  if (!progress) return
  setText(progress, message ?? `Pobrano roczniki: ${progressiveLoaded} / ${progressiveTotal} · ${progressiveMode === 'clear' ? 'najmniej chmur' : 'chmury dozwolone'}`)
}

function makeSlotFigure(slot: GallerySlot) {
  const figure = document.createElement('figure')
  figure.dataset.year = String(slot.year)
  if (slot.status !== 'image' || !slot.image) {
    figure.className = 'research-year-missing'
    const missing = document.createElement('div')
    missing.className = 'research-year-missing-body'
    const strong = document.createElement('b')
    strong.textContent = String(slot.year)
    const text = document.createElement('span')
    text.textContent = 'Brak używalnego oficjalnego obrazu dla tego rocznika.'
    const reason = document.createElement('small')
    reason.textContent = slot.reason ?? 'Brak browser-renderowalnej sceny w sprawdzonych oficjalnych źródłach.'
    missing.append(strong, text, reason)
    figure.appendChild(missing)
    return figure
  }

  const image = slot.image
  const anchor = document.createElement('a')
  anchor.href = image.url
  anchor.target = '_blank'
  anchor.rel = 'noreferrer'
  const img = document.createElement('img')
  img.src = image.url
  img.alt = `${image.source} ${image.date}`
  img.loading = 'lazy'
  img.decoding = 'async'
  anchor.appendChild(img)

  const caption = document.createElement('figcaption')
  const date = document.createElement('b')
  date.textContent = image.date
  const source = document.createElement('span')
  source.textContent = image.source
  const details = document.createElement('small')
  const cloud = typeof image.cloud_cover === 'number' ? ` · zachmurzenie sceny ${image.cloud_cover.toFixed(1)}%` : ''
  details.textContent = `rocznik ${slot.year}${cloud}${slot.warning ? ` · ${slot.warning}` : ''}`
  caption.append(date, source, details)
  figure.append(anchor, caption)
  return figure
}

function syncBufferedSlots(runId: number) {
  const section = createProgressiveSection(runId)
  const grid = section?.querySelector<HTMLElement>('.simple-image-grid')
  if (!section || !grid) return
  const ordered = [...progressiveSlots.values()].sort((a, b) => a.year - b.year)
  for (const slot of ordered) {
    if (grid.querySelector(`[data-year="${slot.year}"]`)) continue
    grid.appendChild(makeSlotFigure(slot))
  }
  progressiveLoaded = progressiveSlots.size
  updateProgress(runId)
  enhanceOneGallery(section)
}

function appendSlots(runId: number, slots: GallerySlot[]) {
  for (const slot of slots) progressiveSlots.set(slot.year, slot)
  syncBufferedSlots(runId)
}

async function fetchGalleryBatch(request: ProgressiveRequest, years: number[], cloudMode: ResearchCloudMode, signal: AbortSignal) {
  if (!originalFetch) throw new Error('Fetch is not installed.')
  const url = new URL(request.endpoint)
  url.pathname = url.pathname.replace(/\/research\/analyze$/, '/research/yearly-gallery')
  const response = await originalFetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      latitude: request.latitude,
      longitude: request.longitude,
      radius_km: request.radiusKm,
      years,
      season: gallerySeason(request.selection),
      cloud_mode: cloudMode,
    }),
    signal,
  })
  const payload = await response.json().catch(() => ({})) as Partial<GalleryBatchResponse> & { error?: string }
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`)
  return Array.isArray(payload.slots) ? payload.slots : []
}

async function startProgressiveGallery(request: ProgressiveRequest, cloudMode = readResearchCloudMode()) {
  const years = yearsForResearchSelection(request.selection)
  latestProgressiveRequest = request
  progressiveMode = cloudMode
  progressiveTotal = years.length
  progressiveLoaded = 0
  progressiveSlots = new Map()
  progressiveRunId += 1
  const runId = progressiveRunId
  progressiveController?.abort()
  progressiveController = new AbortController()
  removeProgressiveSection()
  scheduleEnhance()
  updateProgress(runId, years.length ? `Przygotowuję ${years.length} roczników… analiza AI terenu działa niezależnie.` : 'Brak roczników do pobrania.')
  if (!years.length) return

  for (const batch of chunks(years, GALLERY_BATCH_SIZE)) {
    if (progressiveController.signal.aborted || runId !== progressiveRunId) return
    try {
      const slots = await fetchGalleryBatch(request, batch, cloudMode, progressiveController.signal)
      if (runId !== progressiveRunId) return
      const returned = new Map(slots.map(slot => [slot.year, slot]))
      appendSlots(runId, batch.map(year => returned.get(year) ?? ({ year, status: 'missing', reason: 'Worker nie zwrócił slotu dla rocznika.' } as GallerySlot)))
    } catch (error) {
      if (progressiveController.signal.aborted || runId !== progressiveRunId) return
      appendSlots(runId, batch.map(year => ({
        year,
        status: 'missing',
        reason: error instanceof Error ? error.message : 'Nie udało się pobrać tej paczki roczników.',
      })))
    }
    await new Promise(resolve => window.setTimeout(resolve, 0))
  }
  updateProgress(runId, `Gotowe: ${progressiveLoaded} / ${progressiveTotal} roczników. ${cloudMode === 'clear' ? 'Dla Landsat wybrano najmniej zachmurzone dostępne sceny.' : 'Dopuszczono sceny z chmurami.'}`)
}

function installFetchPolicy() {
  if (originalFetch || typeof window === 'undefined') return
  originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!originalFetch || !isAreaAnalysisRequest(input, init) || typeof init?.body !== 'string') return (originalFetch ?? fetch)(input, init)
    let parsed: Record<string, unknown> | null = null
    try { parsed = JSON.parse(init.body) as Record<string, unknown> } catch { parsed = null }
    const selection = readSatelliteTimeSelection()

    // Keep /research/analyze canonical and fast. Annual catalogue work starts only after
    // this response has returned to React, so a 20-year gallery never blocks the AI result.
    const response = await originalFetch(input, init)
    if (response.ok && parsed) {
      const endpoint = new URL(requestUrl(input), window.location.href).toString()
      const latitude = Number(parsed.latitude)
      const longitude = Number(parsed.longitude)
      const radiusKm = Number(parsed.radius_km ?? 25)
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && Number.isFinite(radiusKm)) {
        const request: ProgressiveRequest = { endpoint, latitude, longitude, radiusKm, selection }
        queueMicrotask(() => { void startProgressiveGallery(request) })
      }
    }
    return response
  }
}

function enhanceCloudControl() {
  const form = document.querySelector<HTMLFormElement>('.simple-search')
  if (!form || form.parentElement?.querySelector(':scope > .research-cloud-preference')) return
  const box = document.createElement('div')
  box.className = 'research-cloud-preference'
  box.innerHTML = '<span><b>Zdjęcia do analizy</b><small>Domyślnie dla każdego rocznika wybieramy najmniej zachmurzoną dostępną scenę Landsat. Możesz dopuścić chmury.</small></span><div role="group" aria-label="Preferencja zachmurzenia"><button type="button" data-cloud="clear">☀ Bez chmur / najmniej chmur</button><button type="button" data-cloud="any">☁ Dopuszczaj chmury</button></div>'
  const refresh = () => {
    const mode = readResearchCloudMode()
    box.querySelectorAll<HTMLButtonElement>('button[data-cloud]').forEach(button => button.classList.toggle('active', button.dataset.cloud === mode))
  }
  box.querySelectorAll<HTMLButtonElement>('button[data-cloud]').forEach(button => button.addEventListener('click', () => {
    const mode = saveResearchCloudMode(button.dataset.cloud === 'any' ? 'any' : 'clear')
    refresh()
    if (latestProgressiveRequest) void startProgressiveGallery(latestProgressiveRequest, mode)
  }))
  refresh()
  form.insertAdjacentElement('afterend', box)
}

function galleryFigures(parent: Element) {
  return [...parent.querySelectorAll<HTMLElement>('.simple-image-grid > figure')]
}

function imageRecord(figure: HTMLElement, index: number) {
  const anchor = figure.querySelector<HTMLAnchorElement>('a[href]')
  const caption = figure.querySelector('figcaption')
  const date = caption?.querySelector('b')?.textContent?.trim() || `image-${index + 1}`
  const source = caption?.querySelector('span')?.textContent?.trim() || 'official satellite source'
  return { index: index + 1, date, source, url: anchor?.href ?? '' }
}

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'image'
}

function extensionForType(type: string) {
  if (type.includes('png')) return 'png'
  if (type.includes('webp')) return 'webp'
  return 'jpg'
}

function textBytes(value: string) {
  return new TextEncoder().encode(value)
}

function u16(value: number) {
  return [value & 255, (value >>> 8) & 255]
}

function u32(value: number) {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosTimeDate(date = new Date()) {
  const year = Math.max(1980, date.getFullYear())
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const result = new Uint8Array(size)
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.byteLength }
  return result
}

function bytes(values: number[]) {
  return Uint8Array.from(values)
}

export function buildStoredZip(files: ZipInputFile[]) {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  const { time, day } = dosTimeDate()
  let offset = 0
  for (const file of files) {
    const name = textBytes(file.name)
    const crc = crc32(file.data)
    const localHeader = bytes([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(day),
      ...u32(crc), ...u32(file.data.byteLength), ...u32(file.data.byteLength), ...u16(name.byteLength), ...u16(0),
    ])
    localParts.push(localHeader, name, file.data)
    const centralHeader = bytes([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(day),
      ...u32(crc), ...u32(file.data.byteLength), ...u32(file.data.byteLength), ...u16(name.byteLength), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ])
    centralParts.push(centralHeader, name)
    offset += localHeader.byteLength + name.byteLength + file.data.byteLength
  }
  const local = concatBytes(localParts)
  const central = concatBytes(centralParts)
  const end = bytes([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(central.byteLength), ...u32(local.byteLength), ...u16(0),
  ])
  return concatBytes([local, central, end])
}

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

async function downloadGalleryZip(parent: HTMLElement, button: HTMLButtonElement) {
  const figures = galleryFigures(parent)
  const records = figures.map(imageRecord).filter(record => record.url)
  if (!records.length) return
  const oldLabel = button.textContent ?? 'Pobierz ZIP'
  button.disabled = true
  const files: ZipInputFile[] = []
  const manifest = {
    generated_at_utc: new Date().toISOString(),
    cloud_mode: readResearchCloudMode(),
    requested_slots: figures.length,
    images: records,
  }
  files.push({ name: 'manifest.json', data: textBytes(JSON.stringify(manifest, null, 2)) })
  files.push({ name: 'sources.txt', data: textBytes(records.map(record => `${record.date}\t${record.source}\t${record.url}`).join('\n')) })
  const missing: string[] = []
  let totalBytes = files.reduce((sum, file) => sum + file.data.byteLength, 0)

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    setText(button, `ZIP ${index + 1}/${records.length}…`)
    try {
      const response = await fetch(record.url, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const type = (response.headers.get('content-type') ?? 'image/jpeg').toLowerCase()
      const data = new Uint8Array(await response.arrayBuffer())
      if (!data.byteLength || totalBytes + data.byteLength > MAX_ZIP_BYTES) throw new Error('limit paczki')
      totalBytes += data.byteLength
      files.push({ name: `images/${String(index + 1).padStart(3, '0')}_${sanitizeFilePart(record.date)}.${extensionForType(type)}`, data })
    } catch (error) {
      missing.push(`${record.date}\t${record.url}\t${error instanceof Error ? error.message : 'download failed'}`)
    }
    await new Promise(resolve => window.setTimeout(resolve, 0))
  }
  if (missing.length) files.push({ name: 'missing-or-too-large.txt', data: textBytes(missing.join('\n')) })
  files.push({ name: 'README.txt', data: textBytes('Terra Observation export. Obrazy pochodzą z oficjalnych/publicznych źródeł wskazanych w manifest.json. Brakujące pozycje pozostają jawne.\n') })
  const zip = buildStoredZip(files)
  const blobPart = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)
  triggerDownload(new Blob([blobPart], { type: 'application/zip' }), `terra-observation-${new Date().toISOString().slice(0, 10)}.zip`)
  setText(button, oldLabel)
  button.disabled = false
}

function downloadManifest(parent: HTMLElement) {
  const figures = galleryFigures(parent)
  const records = figures.map(imageRecord).filter(record => record.url)
  const blob = new Blob([JSON.stringify({ generated_at_utc: new Date().toISOString(), cloud_mode: readResearchCloudMode(), requested_slots: figures.length, images: records }, null, 2)], { type: 'application/json' })
  triggerDownload(blob, `terra-observation-manifest-${new Date().toISOString().slice(0, 10)}.json`)
}

function enhanceOneGallery(parent: HTMLElement) {
  const figures = galleryFigures(parent)
  if (!figures.length) return
  const expanded = parent.dataset.galleryExpanded === 'true'
  figures.forEach((figure, index) => { figure.hidden = !expanded && index >= INITIAL_VISIBLE_IMAGES })

  let toolbar = parent.querySelector<HTMLElement>(':scope > .research-gallery-toolbar')
  if (!toolbar) {
    toolbar = document.createElement('div')
    toolbar.className = 'research-gallery-toolbar'
    toolbar.innerHTML = '<span class="research-gallery-count"></span><div><button type="button" class="research-gallery-expand"></button><button type="button" class="research-gallery-manifest">Pobierz manifest JSON</button><button type="button" class="research-gallery-zip">Pobierz ZIP · obrazy + dane</button></div>'
    parent.querySelector('.simple-section-head')?.insertAdjacentElement('afterend', toolbar)
    toolbar.querySelector<HTMLButtonElement>('.research-gallery-expand')?.addEventListener('click', () => {
      parent.dataset.galleryExpanded = parent.dataset.galleryExpanded === 'true' ? 'false' : 'true'
      enhanceOneGallery(parent)
    })
    toolbar.querySelector<HTMLButtonElement>('.research-gallery-manifest')?.addEventListener('click', () => downloadManifest(parent))
    const zipButton = toolbar.querySelector<HTMLButtonElement>('.research-gallery-zip')
    zipButton?.addEventListener('click', () => { if (zipButton) void downloadGalleryZip(parent, zipButton) })
  }
  const count = toolbar?.querySelector<HTMLElement>('.research-gallery-count')
  const countLabel = expanded || figures.length <= INITIAL_VISIBLE_IMAGES
    ? `Wyświetlono ${figures.length} z ${progressiveTotal || figures.length}`
    : `Wyświetlono pierwsze ${INITIAL_VISIBLE_IMAGES} z ${progressiveTotal || figures.length}`
  setText(count, countLabel)
  const expand = toolbar?.querySelector<HTMLButtonElement>('.research-gallery-expand')
  if (expand) {
    expand.hidden = figures.length <= INITIAL_VISIBLE_IMAGES
    setText(expand, expanded ? 'Pokaż tylko pierwsze 10' : `Pokaż kolejne ${Math.max(0, figures.length - INITIAL_VISIBLE_IMAGES)}`)
  }

  figures.forEach(figure => {
    const image = figure.querySelector<HTMLImageElement>('img')
    if (!image || image.dataset.terraRetryBound) return
    image.dataset.terraRetryBound = '1'
    image.addEventListener('error', () => {
      figure.classList.add('research-source-image-failed')
      image.alt = `${image.alt} · obraz nie załadował się — otwórz źródło`
    })
    image.addEventListener('load', () => figure.classList.remove('research-source-image-failed'))
  })
}

function enhanceGalleries() {
  document.querySelectorAll<HTMLElement>('.simple-selected-period-images:not(.research-progressive-yearly-gallery)').forEach(parent => {
    parent.hidden = Boolean(latestProgressiveRequest)
  })
  if (latestProgressiveRequest) {
    createProgressiveSection(progressiveRunId)
    syncBufferedSlots(progressiveRunId)
  } else {
    document.querySelectorAll<HTMLElement>('.simple-selected-period-images').forEach(enhanceOneGallery)
  }
}

function enhanceAll() {
  enhanceCloudControl()
  enhanceGalleries()
}

function scheduleEnhance() {
  if (enhanceFrame) return
  enhanceFrame = window.requestAnimationFrame(() => {
    enhanceFrame = 0
    enhanceAll()
  })
}

export function installResearchGalleryEnhancements() {
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
    progressiveController?.abort()
    progressiveController = null
    latestProgressiveRequest = null
    progressiveSlots = new Map()
    removeProgressiveSection()
    if (originalFetch) window.fetch = originalFetch
    originalFetch = null
    installed = false
  }
}
