import {
  analysisRadiusForHeightKm,
  observationFootprintRadiusKm,
  readObservationHeightKm,
} from './observationHeightEnhancement'

export const SCALE_LOCK_EVENT = 'terra-observation-scale-lock-change'

const GALLERY_STYLE_ID = 'terra-source-gallery-visibility'

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

function installGalleryStyles() {
  if (document.getElementById(GALLERY_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = GALLERY_STYLE_ID
  style.textContent = `
    .simple-context-grid figure:first-child{display:block!important}
    .simple-context-grid figure:nth-child(n+2){display:none!important}
    .simple-research[data-source-gallery-mode="simple"] .simple-selected-period-images .simple-image-grid figure:nth-child(-n+4),
    .simple-research[data-source-gallery-mode="simple"] .simple-history-body .simple-image-grid figure:nth-child(-n+4),
    .simple-research[data-source-gallery-mode="advanced"] .simple-selected-period-images .simple-image-grid figure:nth-child(-n+8),
    .simple-research[data-source-gallery-mode="advanced"] .simple-history-body .simple-image-grid figure:nth-child(-n+8){display:block!important}
    .simple-research[data-source-gallery-mode="simple"] .simple-selected-period-images .simple-image-grid figure:nth-child(n+5),
    .simple-research[data-source-gallery-mode="simple"] .simple-history-body .simple-image-grid figure:nth-child(n+5),
    .simple-research[data-source-gallery-mode="advanced"] .simple-selected-period-images .simple-image-grid figure:nth-child(n+9),
    .simple-research[data-source-gallery-mode="advanced"] .simple-history-body .simple-image-grid figure:nth-child(n+9){display:none!important}
  `
  document.head.appendChild(style)
}

function activeResearchMode() {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.simple-console-mode button')]
  if (buttons.length >= 2 && buttons[1].classList.contains('active')) return 'advanced' as const
  return 'simple' as const
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
    if (title) title.textContent = `Context · scale ${heightKm.toLocaleString('en-US')} km`
    if (note) note.textContent = `Scale locked for this study · virtual height ${heightKm.toLocaleString('en-US')} km · frame radius about ${footprint.toFixed(1)} km.`
  })

  const gallery = grid.closest<HTMLElement>('.simple-context-gallery')
  const intro = gallery?.querySelector<HTMLElement>(':scope > .simple-section-head p')
  if (intro) {
    intro.textContent = `All study imagery uses the selected scale: ${heightKm.toLocaleString('en-US')} km. The official source scenes remain visible below in their native frames.`
  }
}

function syncSourceGalleryLimit() {
  const root = document.querySelector<HTMLElement>('.simple-research')
  if (!root) return
  const mode = activeResearchMode()
  const limit = mode === 'advanced' ? 8 : 4
  root.dataset.sourceGalleryMode = mode
  root.dataset.sourceGalleryLimit = String(limit)

  const selectedFigures = [...document.querySelectorAll<HTMLElement>('.simple-selected-period-images:not(.terrain-study-section) .simple-image-grid figure')]
  const historyFigures = [...document.querySelectorAll<HTMLElement>('.simple-history-body .simple-image-grid figure')]
  const total = Math.max(selectedFigures.length, historyFigures.length)
  const summaryCount = document.querySelector<HTMLElement>('.simple-history .simple-evidence-summary span:first-child b')
  if (summaryCount) summaryCount.textContent = String(Math.min(total, limit))
}

function normalizeOriginalSections() {
  const sections = [...document.querySelectorAll<HTMLElement>('.simple-context-gallery .simple-selected-period-images:not(.terrain-study-section)')]
  if (!sections.length) return
  let toggle = document.querySelector<HTMLButtonElement>('.scale-lock-originals-toggle')
  if (!toggle) {
    toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'secondary scale-lock-originals-toggle'
    toggle.dataset.collapsed = 'false'
    sections[0].insertAdjacentElement('beforebegin', toggle)
    toggle.addEventListener('click', () => {
      const nextCollapsed = toggle!.dataset.collapsed !== 'true'
      toggle!.dataset.collapsed = nextCollapsed ? 'true' : 'false'
      sections.forEach(section => { section.hidden = nextCollapsed })
      toggle!.textContent = nextCollapsed ? 'Show original scenes · native scale' : 'Hide original scenes · native scale'
    })
  }
  const collapsed = toggle.dataset.collapsed === 'true'
  sections.forEach(section => { section.hidden = collapsed })
  toggle.textContent = collapsed ? 'Show original scenes · native scale' : 'Hide original scenes · native scale'
}

function enhanceAll() {
  installGalleryStyles()
  normalizeContextGrid()
  normalizeOriginalSections()
  syncSourceGalleryLimit()
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
  installGalleryStyles()
  document.addEventListener('change', onChange)
  observer = new MutationObserver(() => scheduleEnhance())
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
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
    document.getElementById(GALLERY_STYLE_ID)?.remove()
    document.querySelector('.simple-research')?.removeAttribute('data-source-gallery-mode')
    document.querySelector('.simple-research')?.removeAttribute('data-source-gallery-limit')
    document.querySelectorAll<HTMLElement>('.simple-selected-period-images').forEach(section => { section.hidden = false })
    document.querySelectorAll<HTMLElement>('.simple-context-grid figure').forEach(figure => { figure.hidden = false })
    if (previousFetch) window.fetch = previousFetch
    previousFetch = null
    installed = false
  }
}
