import './research-chat-images.css'

export const CHAT_CONTEXT_WINDOW_MESSAGES = 40

let installed = false
let previousFetch: typeof window.fetch | null = null
let observer: MutationObserver | null = null
let renderFrame = 0
let requestSequence = 0
let pending: { sequence: number; text: string; autoExpand: boolean; year: number | null } | null = null

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function isResearchChatRequest(input: RequestInfo | URL, init?: RequestInit) {
  const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method !== 'POST') return false
  try { return new URL(requestUrl(input), window.location.href).pathname.endsWith('/research/chat') } catch { return false }
}

export function trimResearchChatMessages<T>(messages: T[]) {
  return messages.slice(-CHAT_CONTEXT_WINDOW_MESSAGES)
}

export function wantsSatelliteImage(text: string) {
  return /(?:pokaż|pokaz|wyświetl|wyswietl|zdjęci|zdjec|obraz|kadr|satelit|fotograf|image|satellite|scene|show|frame|view)/i.test(text)
}

export function requestedSatelliteImageYear(text: string) {
  const match = text.match(/\b(19\d{2}|20\d{2}|21\d{2})\b/)
  return match ? Number(match[1]) : null
}

function latestUserText(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const messages = (value as { messages?: unknown }).messages
  if (!Array.isArray(messages)) return ''
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index]
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const message = item as { role?: unknown; text?: unknown }
    if (message.role === 'user' && typeof message.text === 'string') return message.text
  }
  return ''
}

function normalizeRequestBody(init?: RequestInit) {
  if (typeof init?.body !== 'string') return { init, text: '' }
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(init.body) as Record<string, unknown> } catch { return { init, text: '' } }
  const text = latestUserText(parsed)
  if (Array.isArray(parsed.messages)) parsed.messages = trimResearchChatMessages(parsed.messages)
  return { init: { ...init, body: JSON.stringify(parsed) }, text }
}

type CurrentVisual = {
  src: string
  href: string
  meta: string
  label: string
}

function visualFromElement(root: Element | null, label: string): CurrentVisual | null {
  if (!root) return null
  const image = root.querySelector<HTMLImageElement>('img')
  if (!image?.src) return null
  const anchor = image.closest<HTMLAnchorElement>('a[href]') ?? root.querySelector<HTMLAnchorElement>('a[href]')
  const metaNode = root.querySelector<HTMLElement>('figcaption, .terrain-study-meta, p, small')
  const meta = (metaNode?.textContent ?? root.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 360)
  return {
    src: image.currentSrc || image.src,
    href: anchor?.href || image.currentSrc || image.src,
    meta,
    label,
  }
}

function currentSatelliteVisual(year: number | null): CurrentVisual | null {
  if (year) {
    const yearCard = document.querySelector<HTMLElement>(`.terrain-study-card[data-year="${year}"]`)
    const exactYear = visualFromElement(yearCard, `Obraz badawczy ${year}`)
    if (exactYear) return exactYear
  }

  const exact = visualFromElement(document.querySelector<HTMLElement>('.terrain-study-card.exact'), 'Oryginalna obserwacja dokładnego czasu')
  if (exact) return exact

  const terrainCards = [...document.querySelectorAll<HTMLElement>('.terrain-study-card:not(.missing)')]
  const visibleTerrain = terrainCards.find(card => !card.hidden)
  const terrain = visualFromElement(visibleTerrain ?? terrainCards[0] ?? null, 'Aktualny obraz badawczy')
  if (terrain) return terrain

  const contextFigures = [...document.querySelectorAll<HTMLElement>('.simple-context-grid figure')]
  const visibleContext = contextFigures.find(figure => !figure.hidden)
  const context = visualFromElement(visibleContext ?? contextFigures[0] ?? null, 'Aktualny oficjalny obraz satelitarny')
  if (context) return context

  const selected = visualFromElement(document.querySelector<HTMLElement>('.simple-image-grid figure'), 'Oficjalny obraz z wybranego okresu')
  return selected
}

function lastAssistantTarget() {
  const simple = [...document.querySelectorAll<HTMLElement>('.simple-question-answer')].reverse().find(article => {
    const label = article.querySelector('small')?.textContent ?? ''
    return label.includes('ODPOWIEDŹ ASYSTENTA')
  })
  if (simple) return simple
  return [...document.querySelectorAll<HTMLElement>('.research-chat-log article.assistant')].at(-1) ?? null
}

function appendSatelliteCard(target: HTMLElement, visual: CurrentVisual | null, autoExpand: boolean, sequence: number) {
  target.querySelector('.research-chat-satellite-image')?.remove()
  const wrapper = document.createElement('div')
  wrapper.className = 'research-chat-satellite-image'
  wrapper.dataset.sequence = String(sequence)

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'secondary research-chat-satellite-toggle'
  toggle.textContent = visual ? '🛰️ Pokaż dokładny obraz satelitarny z bieżącego badania' : '🛰️ Brak załadowanego obrazu satelitarnego'
  toggle.disabled = !visual
  wrapper.appendChild(toggle)

  if (visual) {
    const panel = document.createElement('div')
    panel.className = 'research-chat-satellite-panel'
    panel.hidden = !autoExpand
    const top = document.createElement('div')
    top.className = 'research-chat-satellite-head'
    const title = document.createElement('b')
    title.textContent = visual.label
    const provenance = document.createElement('small')
    provenance.textContent = 'Ten sam oficjalny/publiczny obraz, który jest aktualnie załadowany w badaniu — bez generowania zastępczej grafiki.'
    top.append(title, provenance)
    const link = document.createElement('a')
    link.href = visual.href
    link.target = '_blank'
    link.rel = 'noreferrer'
    const image = document.createElement('img')
    image.src = visual.src
    image.alt = visual.label
    image.loading = 'lazy'
    image.decoding = 'async'
    link.appendChild(image)
    const meta = document.createElement('small')
    meta.className = 'research-chat-satellite-meta'
    meta.textContent = visual.meta || 'Oficjalny obraz z bieżącego badania.'
    panel.append(top, link, meta)
    wrapper.appendChild(panel)
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden
      toggle.textContent = panel.hidden ? '🛰️ Pokaż dokładny obraz satelitarny z bieżącego badania' : '🛰️ Ukryj obraz satelitarny'
    })
    if (autoExpand) toggle.textContent = '🛰️ Ukryj obraz satelitarny'
  }

  target.appendChild(wrapper)
  target.dataset.terraSatelliteImageSequence = String(sequence)
}

function renderPending() {
  if (!pending) return
  const target = lastAssistantTarget()
  if (!target) return
  if (target.dataset.terraSatelliteImageSequence === String(pending.sequence)) return
  appendSatelliteCard(target, currentSatelliteVisual(pending.year), pending.autoExpand, pending.sequence)
}

function scheduleRender() {
  if (renderFrame) return
  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = 0
    renderPending()
  })
}

function installFetchWrapper() {
  if (previousFetch || typeof window === 'undefined') return
  previousFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!previousFetch || !isResearchChatRequest(input, init)) return (previousFetch ?? fetch)(input, init)
    const normalized = normalizeRequestBody(init)
    const response = await previousFetch(input, normalized.init)
    if (response.ok) {
      const text = normalized.text
      requestSequence += 1
      pending = {
        sequence: requestSequence,
        text,
        autoExpand: wantsSatelliteImage(text),
        year: requestedSatelliteImageYear(text),
      }
      window.setTimeout(scheduleRender, 0)
    }
    return response
  }
}

export function installResearchChatImageEnhancement() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined
  if (installed) return () => undefined
  installed = true
  installFetchWrapper()
  observer = new MutationObserver(() => scheduleRender())
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer?.disconnect()
    observer = null
    if (renderFrame) window.cancelAnimationFrame(renderFrame)
    renderFrame = 0
    pending = null
    document.querySelectorAll('.research-chat-satellite-image').forEach(node => node.remove())
    if (previousFetch) window.fetch = previousFetch
    previousFetch = null
    installed = false
  }
}
