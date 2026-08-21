import './research-gallery-enhancements.css'
import { readSatelliteTimeSelection } from './satelliteTimeSelection'

export type ResearchCloudMode = 'clear' | 'any'
export type ZipInputFile = { name: string; data: Uint8Array }

const CLOUD_STORAGE_KEY = 'terra-observation-cloud-mode/v1'
const INITIAL_VISIBLE_IMAGES = 10
const MAX_ZIP_BYTES = 150 * 1024 * 1024
let installed = false
let originalFetch: typeof window.fetch | null = null
let observer: MutationObserver | null = null

export function readResearchCloudMode(): ResearchCloudMode {
  if (typeof window === 'undefined') return 'clear'
  return window.localStorage.getItem(CLOUD_STORAGE_KEY) === 'any' ? 'any' : 'clear'
}

export function saveResearchCloudMode(mode: ResearchCloudMode) {
  if (typeof window !== 'undefined') window.localStorage.setItem(CLOUD_STORAGE_KEY, mode)
  return mode
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

function installFetchPolicy() {
  if (originalFetch || typeof window === 'undefined') return
  originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!originalFetch || !isAreaAnalysisRequest(input, init) || typeof init?.body !== 'string') return (originalFetch ?? fetch)(input, init)
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>
      body.cloud_mode = readResearchCloudMode()
      const selection = readSatelliteTimeSelection()
      if (selection.preset === 'seasonal') {
        body.season = selection.season
        body.start_year = selection.startYear
        body.end_year = selection.endYear
      }
      return originalFetch(input, { ...init, body: JSON.stringify(body) })
    } catch {
      return originalFetch(input, init)
    }
  }
}

function rerunCurrentSearch() {
  const form = document.querySelector<HTMLFormElement>('.simple-search')
  const input = form?.querySelector<HTMLInputElement>('input')
  if (form && input?.value.trim()) form.requestSubmit()
}

function enhanceCloudControl() {
  const form = document.querySelector<HTMLFormElement>('.simple-search')
  if (!form || form.parentElement?.querySelector(':scope > .research-cloud-preference')) return
  const box = document.createElement('div')
  box.className = 'research-cloud-preference'
  box.innerHTML = '<span><b>Zdjęcia do analizy</b><small>Preferencja dla Landsat; gdy nie ma idealnie czystej sceny, system wybiera najmniej zachmurzoną dostępną i pokazuje jej zachmurzenie.</small></span><div role="group" aria-label="Preferencja zachmurzenia"><button type="button" data-cloud="clear">☀ Bez chmur / najmniej chmur</button><button type="button" data-cloud="any">☁ Dopuszczaj chmury</button></div>'
  const refresh = () => {
    const mode = readResearchCloudMode()
    box.querySelectorAll<HTMLButtonElement>('button[data-cloud]').forEach(button => button.classList.toggle('active', button.dataset.cloud === mode))
  }
  box.querySelectorAll<HTMLButtonElement>('button[data-cloud]').forEach(button => button.addEventListener('click', () => {
    saveResearchCloudMode(button.dataset.cloud === 'any' ? 'any' : 'clear')
    refresh()
    rerunCurrentSearch()
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
    images: records,
  }
  files.push({ name: 'manifest.json', data: textBytes(JSON.stringify(manifest, null, 2)) })
  files.push({ name: 'sources.txt', data: textBytes(records.map(record => `${record.date}\t${record.source}\t${record.url}`).join('\n')) })
  const missing: string[] = []
  let totalBytes = files.reduce((sum, file) => sum + file.data.byteLength, 0)

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    button.textContent = `ZIP ${index + 1}/${records.length}…`
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
  }
  if (missing.length) files.push({ name: 'missing-or-too-large.txt', data: textBytes(missing.join('\n')) })
  files.push({ name: 'README.txt', data: textBytes('Terra Observation export. Obrazy pochodzą z oficjalnych/publicznych źródeł wskazanych w manifest.json. Plik missing-or-too-large.txt, jeśli istnieje, zawiera pozycje których przeglądarka nie mogła dołączyć do paczki.\n') })
  const zip = buildStoredZip(files)
  const blobPart = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)
  triggerDownload(new Blob([blobPart], { type: 'application/zip' }), `terra-observation-${new Date().toISOString().slice(0, 10)}.zip`)
  button.textContent = oldLabel
  button.disabled = false
}

function downloadManifest(parent: HTMLElement) {
  const records = galleryFigures(parent).map(imageRecord).filter(record => record.url)
  const blob = new Blob([JSON.stringify({ generated_at_utc: new Date().toISOString(), cloud_mode: readResearchCloudMode(), images: records }, null, 2)], { type: 'application/json' })
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
  if (count) count.textContent = expanded || figures.length <= INITIAL_VISIBLE_IMAGES ? `Wyświetlono ${figures.length} z ${figures.length}` : `Wyświetlono pierwsze ${INITIAL_VISIBLE_IMAGES} z ${figures.length}`
  const expand = toolbar?.querySelector<HTMLButtonElement>('.research-gallery-expand')
  if (expand) {
    expand.hidden = figures.length <= INITIAL_VISIBLE_IMAGES
    expand.textContent = expanded ? 'Pokaż tylko pierwsze 10' : `Pokaż pozostałe ${figures.length - INITIAL_VISIBLE_IMAGES}`
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
  document.querySelectorAll<HTMLElement>('.simple-selected-period-images').forEach(enhanceOneGallery)
}

function enhanceAll() {
  enhanceCloudControl()
  enhanceGalleries()
}

export function installResearchGalleryEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined
  if (installed) return () => undefined
  installed = true
  installFetchPolicy()
  enhanceAll()
  observer = new MutationObserver(() => enhanceAll())
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer?.disconnect()
    observer = null
    if (originalFetch) window.fetch = originalFetch
    originalFetch = null
    installed = false
  }
}
