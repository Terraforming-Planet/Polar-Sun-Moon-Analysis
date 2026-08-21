import {
  analysisRadiusForHeightKm,
  observationFootprintRadiusKm,
  readObservationHeightKm,
} from './observationHeightEnhancement'

export const SCALE_LOCK_EVENT = 'terra-observation-scale-lock-change'

let installed = false
let previousFetch: typeof window.fetch | null = null
let observer: MutationObserver | null = null
let enhanceFrame = 0
let rerunTimer = 0

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

export function isScaleLockedTerrainRequest(input: RequestInfo | URL, init?: RequestInit) {
  const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method !== 'POST') return false
  try {
    const path = new URL(requestUrl(input), window.location.href).pathname
    return path.endsWith('/research/terrain-study') || path.endsWith('/research/terrain-study/analyze')
  } catch {
    return false
  }
}

export function lockedStudyRadiusKm(heightKm: number) {
  return Number(analysisRadiusForHeightKm(heightKm).toFixed(2))
}

function installFetchScaleLock() {
  if (previousFetch || typeof window === 'undefined') return
  previousFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!previousFetch || !isScaleLockedTerrainRequest(input, init) || typeof init?.body !== 'string') {
      return (previousFetch ?? fetch)(input, init)
    }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(init.body) as Record<string, unknown>
    } catch {
      return previousFetch(input, init)
    }
    const heightKm = readObservationHeightKm()
    parsed.view_height_km = heightKm
    parsed.radius_km = lockedStudyRadiusKm(heightKm)
    return previousFetch(input, { ...init, body: JSON.stringify(parsed) })
  }
}

function boundsFromCenter(latitude: number, longitude: number, radiusKm: number) {
  const latDelta = radiusKm / 111.32
  const lonScale = Math.max(0.15, Math.cos(latitude * Math.PI / 180))
  const lonDelta = radiusKm / (111.32 * lonScale)
  return {
    west: Math.max(-180, longitude - lonDelta),
    south: Math.max(-90, latitude - latDelta),
    east: Math.min(180, longitude + lonDelta),
    north: Math.min(90, latitude + latDelta),
  }
}

function rewriteGibsUrl(value: string, footprintRadiusKm: number) {
  try {
    const url = new URL(value, window.location.href)
    if (!url.hostname.includes('gibs.earthdata.nasa.gov')) return null
    const bboxText = url.searchParams.get('BBOX')
    if (!bboxText) return null
    const bbox = bboxText.split(',').map(Number)
    if (bbox.length !== 4 || bbox.some(item => !Number.isFinite(item))) return null
    const longitude = (bbox[0] + bbox[2]) / 2
    const latitude = (bbox[1] + bbox[3]) / 2
    const next = boundsFromCenter(latitude, longitude, footprintRadiusKm)
    url.searchParams.set('BBOX', `${next.west},${next.south},${next.east},${next.north}`)
    url.searchParams.set('WIDTH', '1600')
    url.searchParams.set('HEIGHT', '1600')
    return url.toString()
  } catch {
    return null
  }
}

function normalizeContextGrid() {
  const grid = document.querySelector<HTMLElement>('.simple-context-grid')
  if (!grid) return
  const figures = [...grid.querySelectorAll<HTMLElement>('figure')]
  if (!figures.length) return
  const heightKm = readObservationHeightKm()
  const footprint = observationFootprintRadiusKm(heightKm)

  figures.forEach((figure, index) => {
    figure.hidden = index > 0
    if (index > 0) return
    const anchor = figure.querySelector<HTMLAnchorElement>('a[href]')
    const image = figure.querySelector<HTMLImageElement>('img')
    const lockedUrl = anchor ? rewriteGibsUrl(anchor.href, footprint) : null
    if (anchor && image && lockedUrl) {
      anchor.href = lockedUrl
      if (image.src !== lockedUrl) image.src = lockedUrl
    }
    const title = figure.querySelector<HTMLElement>('figcaption b')
    const note = figure.querySelector<HTMLElement>('figcaption small')
    if (title) title.textContent = `Kontekst · skala ${heightKm.toLocaleString('pl-PL')} km`
    if (note) note.textContent = `Skala zablokowana dla całego badania · wirtualna wysokość ${heightKm.toLocaleString('pl-PL')} km · promień kadru ok. ${footprint.toFixed(1)} km.`
  })

  const gallery = grid.closest<HTMLElement>('.simple-context-gallery')
  const intro = gallery?.querySelector<HTMLElement>(':scope > .simple-section-head p')
  if (intro) {
    intro.textContent = `Wszystkie obrazy badawcze używają jednej skali z suwaka: ${heightKm.toLocaleString('pl-PL')} km. Oryginalne sceny źródłowe są zachowane osobno w natywnym kadrze.`
  }
}

function normalizeOriginalSections() {
  const sections = [...document.querySelectorAll<HTMLElement>('.simple-context-gallery .simple-selected-period-images:not(.terrain-study-section)')]
  if (!sections.length) return
  let toggle = document.querySelector<HTMLButtonElement>('.scale-lock-originals-toggle')
  if (!toggle) {
    toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'secondary scale-lock-originals-toggle'
    toggle.textContent = 'Pokaż oryginalne sceny · natywna skala'
    sections[0].insertAdjacentElement('beforebegin', toggle)
    toggle.addEventListener('click', () => {
      const hidden = sections.every(section => section.hidden)
      sections.forEach(section => { section.hidden = !hidden })
      toggle!.textContent = hidden ? 'Ukryj oryginalne sceny · natywna skala' : 'Pokaż oryginalne sceny · natywna skala'
    })
  }
  if (!toggle.dataset.userOpened) sections.forEach(section => { section.hidden = true })
}

function enhanceAll() {
  normalizeContextGrid()
  normalizeOriginalSections()
}

function scheduleEnhance() {
  if (enhanceFrame) return
  enhanceFrame = window.requestAnimationFrame(() => {
    enhanceFrame = 0
    enhanceAll()
  })
}

function invalidateAndRerun() {
  document.querySelector('.terrain-study-section')?.remove()
  document.dispatchEvent(new CustomEvent(SCALE_LOCK_EVENT, { detail: { heightKm: readObservationHeightKm() } }))
  window.clearTimeout(rerunTimer)
  rerunTimer = window.setTimeout(() => {
    const button = document.querySelector<HTMLButtonElement>('.simple-search button[type="submit"]')
    if (button && !button.disabled) button.click()
  }, 120)
}

function onChange(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (!target.matches('.research-height-range, .research-height-number')) return
  scheduleEnhance()
  invalidateAndRerun()
}

export function installScaleLockEnhancement() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined
  if (installed) return () => undefined
  installed = true
  installFetchScaleLock()
  document.addEventListener('change', onChange)
  observer = new MutationObserver(() => scheduleEnhance())
  observer.observe(document.body, { childList: true, subtree: true })
  enhanceAll()
  return () => {
    document.removeEventListener('change', onChange)
    observer?.disconnect()
    observer = null
    if (enhanceFrame) window.cancelAnimationFrame(enhanceFrame)
    enhanceFrame = 0
    window.clearTimeout(rerunTimer)
    rerunTimer = 0
    document.querySelector('.scale-lock-originals-toggle')?.remove()
    document.querySelectorAll<HTMLElement>('.simple-selected-period-images').forEach(section => { section.hidden = false })
    document.querySelectorAll<HTMLElement>('.simple-context-grid figure').forEach(figure => { figure.hidden = false })
    if (previousFetch) window.fetch = previousFetch
    previousFetch = null
    installed = false
  }
}
