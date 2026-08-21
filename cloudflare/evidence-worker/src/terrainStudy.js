import { isAllowedOrigin } from './index.js'
import { buildUsGsLandsatUrl } from './landsatProxy.js'

export const TERRAIN_STUDY_PATH = '/research/terrain-study'
export const TERRAIN_STUDY_ANALYZE_PATH = '/research/terrain-study/analyze'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5.6-terra'
const LANDSAT_START_YEAR = 1972
const SENTINEL2_START = '2015-06-23'
const MAX_YEARS_PER_BATCH = 5
const MAX_QUERY_FEATURES = 100
const CLEAR_CLOUD_THRESHOLD = 10
const UPSTREAM_TIMEOUT_MS = 8000
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_VISUAL_BYTES = 24 * 1024 * 1024
const DEFAULT_CDSE_INSTANCE = 'd708f736-b553-4328-9b5e-39bdb444790c'

const SEASON_WINDOWS = {
  all: ['01-01', '12-31'],
  spring: ['03-01', '05-31'],
  summer: ['06-01', '08-31'],
  autumn: ['09-01', '11-30'],
  winter: ['01-01', '02-28'],
}
const SEASON_REFERENCE = {
  all: '07-15',
  spring: '04-15',
  summer: '07-15',
  autumn: '10-15',
  winter: '01-15',
}

function corsHeaders(origin, env = {}) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (origin && isAllowedOrigin(origin, env)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function jsonResponse(payload, status, origin, env, cacheControl = 'no-store') {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      ...corsHeaders(origin, env),
    },
  })
}

async function readJson(request) {
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > 8192) throw new Error('Request is too large.')
  return JSON.parse(text)
}

function researchBounds(latitude, longitude, radiusKm) {
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

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function parsePayload(value, allowAnalyze = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Request body must be one object.')
  const allowed = new Set(['latitude', 'longitude', 'radius_km', 'years', 'season', 'mode', 'exact_utc', 'place_name'])
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`Unexpected field: ${key}.`)
  const latitude = Number(value.latitude)
  const longitude = Number(value.longitude)
  const radiusKm = Number(value.radius_km ?? 25)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('latitude is outside WGS84 bounds.')
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('longitude is outside WGS84 bounds.')
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 500) throw new Error('radius_km must be from 1 to 500.')
  const mode = value.mode === 'exact' ? 'exact' : 'study'
  const placeName = typeof value.place_name === 'string' ? value.place_name.trim().slice(0, 180) : ''
  if (mode === 'exact') {
    const exactUtc = typeof value.exact_utc === 'string' ? value.exact_utc : ''
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(exactUtc)) throw new Error('exact_utc must use YYYY-MM-DDTHH:MM:SSZ.')
    return { latitude, longitude, radiusKm, mode, exactUtc, placeName, years: [], season: 'all', allowAnalyze }
  }
  const season = String(value.season ?? 'all')
  if (!SEASON_WINDOWS[season]) throw new Error('season must be all, spring, summer, autumn or winter.')
  if (!Array.isArray(value.years) || value.years.length < 1 || value.years.length > MAX_YEARS_PER_BATCH) {
    throw new Error(`years must contain 1 to ${MAX_YEARS_PER_BATCH} years.`)
  }
  const currentYear = new Date().getUTCFullYear()
  const years = [...new Set(value.years.map(Number))]
  if (years.some(year => !Number.isInteger(year) || year < LANDSAT_START_YEAR || year > currentYear)) {
    throw new Error(`years must be integers from ${LANDSAT_START_YEAR} to ${currentYear}.`)
  }
  return { latitude, longitude, radiusKm, mode, exactUtc: null, placeName, years, season, allowAnalyze }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try { return await fetch(url, { ...options, signal: controller.signal }) }
  finally { clearTimeout(timeout) }
}

function safeRasterUrl(value) {
  if (typeof value !== 'string') return null
  const url = value.trim()
  if (!url.startsWith('https://')) return null
  return url
}

function imageAssets(item) {
  const assets = []
  for (const [key, asset] of Object.entries(item?.assets ?? {})) {
    const href = safeRasterUrl(asset?.href)
    if (!href) continue
    const title = String(asset?.title ?? '').toLowerCase()
    const type = String(asset?.type ?? '').toLowerCase()
    const roles = Array.isArray(asset?.roles) ? asset.roles.map(role => String(role).toLowerCase()) : []
    let previewScore = 0
    let fullScore = 0
    const lowerKey = key.toLowerCase()
    if (lowerKey.includes('thumbnail') || roles.includes('thumbnail')) previewScore += 150
    if (lowerKey.includes('browse') || title.includes('browse')) previewScore += 110
    if (title.includes('full resolution browse')) fullScore += 160
    if (lowerKey.includes('browse')) fullScore += 120
    if (type.startsWith('image/')) { previewScore += 40; fullScore += 40 }
    assets.push({ href, previewScore, fullScore })
  }
  const links = Array.isArray(item?.links) ? item.links : []
  for (const link of links) {
    const href = safeRasterUrl(link?.href)
    if (!href) continue
    const rel = String(link?.rel ?? '').toLowerCase()
    if (rel === 'thumbnail') assets.push({ href, previewScore: 145, fullScore: 20 })
    if (rel === 'preview') assets.push({ href, previewScore: 120, fullScore: 80 })
  }
  const preview = [...assets].sort((a, b) => b.previewScore - a.previewScore)[0]?.href ?? null
  const full = [...assets].sort((a, b) => b.fullScore - a.fullScore)[0]?.href ?? preview
  return { preview, full }
}

function sceneFromItem(item) {
  const datetime = typeof item?.properties?.datetime === 'string' ? item.properties.datetime : null
  const id = String(item?.id ?? '').slice(0, 180)
  if (!datetime || !id) return null
  const { preview, full } = imageAssets(item)
  if (!preview && !full) return null
  return {
    id,
    datetime,
    date: datetime.slice(0, 10),
    platform: typeof item?.properties?.platform === 'string' ? item.properties.platform : 'Landsat',
    cloud_cover: typeof item?.properties?.['eo:cloud_cover'] === 'number' ? item.properties['eo:cloud_cover'] : null,
    thumbnail_url: preview ?? full,
    full_url: full ?? preview,
  }
}

async function queryLandsat(parsed, startDate, endDate) {
  const bounds = researchBounds(parsed.latitude, parsed.longitude, parsed.radiusKm)
  const url = buildUsGsLandsatUrl({
    bbox: [bounds.west, bounds.south, bounds.east, bounds.north],
    start: startDate,
    end: endDate,
    limit: MAX_QUERY_FEATURES,
  })
  const response = await fetchWithTimeout(url, { headers: { Accept: 'application/geo+json,application/json' } })
  if (!response.ok) throw new Error(`USGS Landsat catalogue HTTP ${response.status}.`)
  const payload = await response.json()
  return (Array.isArray(payload?.features) ? payload.features : []).map(sceneFromItem).filter(Boolean)
}

function dateDistanceMs(datetime, reference) {
  return Math.abs(Date.parse(datetime) - Date.parse(reference))
}

function bestClearScene(scenes, threshold = CLEAR_CLOUD_THRESHOLD) {
  return [...scenes]
    .filter(scene => Number.isFinite(scene.cloud_cover) && scene.cloud_cover <= threshold)
    .sort((a, b) => a.cloud_cover - b.cloud_cover || a.datetime.localeCompare(b.datetime))[0] ?? null
}

function nearestOriginalScene(scenes, referenceUtc) {
  return [...scenes].sort((a, b) => dateDistanceMs(a.datetime, referenceUtc) - dateDistanceMs(b.datetime, referenceUtc))[0] ?? null
}

function proxyUrl(request, url) {
  if (!url) return null
  const origin = new URL(request.url).origin
  return `${origin}/research/image?${new URLSearchParams({ url }).toString()}`
}

function publicScene(request, scene) {
  if (!scene) return null
  return {
    scene_id: scene.id,
    date: scene.date,
    datetime_utc: scene.datetime,
    platform: scene.platform,
    cloud_cover: scene.cloud_cover,
    thumbnail_url: proxyUrl(request, scene.thumbnail_url),
    full_url: proxyUrl(request, scene.full_url),
    original_thumbnail_url: scene.thumbnail_url,
    original_full_url: scene.full_url,
  }
}

function sentinelCloudMinimized(parsed, year, season, env) {
  const [startSuffix, endSuffix] = SEASON_WINDOWS[season]
  const start = `${year}-${startSuffix}`
  const end = `${year}-${endSuffix}`
  if (end < SENTINEL2_START) return null
  const bounds = researchBounds(parsed.latitude, parsed.longitude, parsed.radiusKm)
  const instance = typeof env.CDSE_INSTANCE_ID === 'string' && env.CDSE_INSTANCE_ID.trim() ? env.CDSE_INSTANCE_ID.trim() : DEFAULT_CDSE_INSTANCE
  const layer = typeof env.CDSE_TRUE_COLOR_LAYER === 'string' && env.CDSE_TRUE_COLOR_LAYER.trim() ? env.CDSE_TRUE_COLOR_LAYER.trim() : 'NATURAL-COLOR'
  const build = size => {
    const params = new URLSearchParams({
      SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: layer, STYLES: '',
      FORMAT: 'image/jpeg', TRANSPARENT: 'FALSE', SRS: 'EPSG:4326',
      BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
      WIDTH: String(size), HEIGHT: String(size), TIME: `${start}/${end}`, MAXCC: String(CLEAR_CLOUD_THRESHOLD), SHOWLOGO: 'false',
    })
    return `https://sh.dataspace.copernicus.eu/ogc/wms/${instance}?${params.toString()}`
  }
  return {
    source: 'Copernicus Data Space · Sentinel-2 L2A · cloud-minimized study mosaic',
    date: end,
    period_start: start,
    period_end: end,
    cloud_cover: null,
    threshold: CLEAR_CLOUD_THRESHOLD,
    thumbnail_url: build(420),
    full_url: build(1800),
    note: `Official Sentinel-2 L2A WMS request for ${start}..${end} with MAXCC=${CLEAR_CLOUD_THRESHOLD}. This can be a mosaic and is not claimed to be one exact acquisition.`,
  }
}

async function studySlot(request, parsed, year, env) {
  const [startSuffix, endSuffix] = SEASON_WINDOWS[parsed.season]
  const start = `${year}-${startSuffix}`
  const end = `${year}-${endSuffix}`
  const referenceUtc = `${year}-${SEASON_REFERENCE[parsed.season]}T12:00:00Z`
  let scenes = await queryLandsat(parsed, start, end)
  let clear = bestClearScene(scenes)
  let searchWindow = { start, end, expanded: false }

  if (!clear && parsed.season !== 'all') {
    const expandedStart = shiftDate(start, -30)
    const expandedEnd = shiftDate(end, 30)
    const expanded = await queryLandsat(parsed, expandedStart, expandedEnd)
    scenes = [...scenes, ...expanded]
    clear = bestClearScene(scenes)
    searchWindow = { start: expandedStart, end: expandedEnd, expanded: true }
  }

  const original = nearestOriginalScene(scenes, referenceUtc)
  const clearPublic = publicScene(request, clear)
  if (clearPublic) {
    return {
      year,
      status: 'ready',
      standard: `scene cloud cover <= ${CLEAR_CLOUD_THRESHOLD}%`,
      analysis_image: { ...clearPublic, source: `USGS Landsat Collection 2 · ${clear.platform} · terrain-study scene`, kind: 'single-scene' },
      original_image: original ? { ...publicScene(request, original), source: `USGS Landsat Collection 2 · ${original.platform} · original nearest seasonal reference` } : null,
      search_window: searchWindow,
    }
  }

  const sentinel = sentinelCloudMinimized(parsed, year, parsed.season, env)
  if (sentinel) {
    return {
      year,
      status: 'ready',
      standard: `Sentinel-2 request MAXCC <= ${CLEAR_CLOUD_THRESHOLD}%`,
      analysis_image: {
        source: sentinel.source,
        kind: 'cloud-minimized-mosaic',
        date: sentinel.date,
        datetime_utc: null,
        platform: 'Sentinel-2 L2A',
        cloud_cover: null,
        threshold: sentinel.threshold,
        thumbnail_url: proxyUrl(request, sentinel.thumbnail_url),
        full_url: proxyUrl(request, sentinel.full_url),
        original_thumbnail_url: sentinel.thumbnail_url,
        original_full_url: sentinel.full_url,
        note: sentinel.note,
      },
      original_image: original ? { ...publicScene(request, original), source: `USGS Landsat Collection 2 · ${original.platform} · original nearest seasonal reference` } : null,
      search_window: searchWindow,
      warning: 'No Landsat scene met the <=10% scene-cloud standard; Sentinel-2 cloud-minimized WMS was used for the study image.',
    }
  }

  return {
    year,
    status: 'no-clear-study-image',
    standard: `scene cloud cover <= ${CLEAR_CLOUD_THRESHOLD}%`,
    analysis_image: null,
    original_image: original ? { ...publicScene(request, original), source: `USGS Landsat Collection 2 · ${original.platform} · original evidence; clouds preserved` } : null,
    search_window: searchWindow,
    reason: 'No official image met the terrain-study cloud standard in the checked seasonal/expanded window. The original evidence is preserved instead of substituting a cloudy image as analysis-ready.',
  }
}

async function exactSlot(request, parsed) {
  const date = parsed.exactUtc.slice(0, 10)
  const scenes = await queryLandsat(parsed, date, date)
  const original = nearestOriginalScene(scenes, parsed.exactUtc)
  return {
    mode: 'exact',
    requested_utc: parsed.exactUtc,
    cloud_filter_applied: false,
    status: original ? 'ready' : 'missing',
    original_image: original ? { ...publicScene(request, original), source: `USGS Landsat Collection 2 · ${original.platform} · nearest original acquisition; clouds preserved` } : null,
    reason: original ? null : 'No Landsat scene was returned for the requested UTC day.',
  }
}

async function preflightImage(url) {
  const response = await fetchWithTimeout(url, { headers: { Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8' } }, 10_000)
  if (!response.ok) throw new Error(`image HTTP ${response.status}`)
  const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error(`unsupported image type ${mime || 'unknown'}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('image size outside analysis limit')
  return { bytes, mime }
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)))
  return btoa(binary)
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim()
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) if (part?.type === 'output_text' && typeof part.text === 'string' && part.text.trim()) return part.text.trim()
  }
  throw new Error('OpenAI terrain-study response did not contain output text.')
}

async function analyzeSlots(parsed, slots, env) {
  if (!env.OPENAI_API_KEY) throw new Error('OpenAI is not configured.')
  const inputs = []
  const metadata = []
  let totalBytes = 0
  for (const slot of slots) {
    const image = slot.analysis_image
    if (!image?.original_full_url) continue
    try {
      const prepared = await preflightImage(image.original_full_url)
      if (totalBytes + prepared.bytes.byteLength > MAX_VISUAL_BYTES) continue
      totalBytes += prepared.bytes.byteLength
      inputs.push({ type: 'input_image', image_url: `data:${prepared.mime};base64,${bytesToBase64(prepared.bytes)}`, detail: 'high' })
      metadata.push({ year: slot.year, date: image.date, source: image.source, cloud_cover: image.cloud_cover, standard: slot.standard, kind: image.kind })
    } catch {
      // Keep missing preflight explicit via metadata count below.
    }
  }
  if (!inputs.length) return { text: 'Brak obrazów spełniających standard jakości, które przeszły kontrolę przed analizą AI.', inspected: 0 }
  const instructions = `You are Terra Observation terrain-study AI. Respond in Polish. Analyze only the supplied official satellite study images. Each image was selected by a cloud-minimization policy; never claim it is absolutely cloud-free unless the metadata proves that. Compare terrain, water bodies/channels, exposed sediment, vegetation patterns and visible land-cover changes across the supplied years. Distinguish observation from causal hypotheses. Mention years/sources actually inspected. Never invent measurements or hydrological causes.`
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: typeof env.OPENAI_MODEL === 'string' && env.OPENAI_MODEL.trim() ? env.OPENAI_MODEL.trim() : DEFAULT_MODEL,
      instructions,
      input: [{ role: 'user', content: [{ type: 'input_text', text: `Obszar: ${parsed.placeName || 'wybrany punkt'}; WGS84 ${parsed.latitude}, ${parsed.longitude}.\nMetadane obrazów: ${JSON.stringify(metadata)}` }, ...inputs] }],
      max_output_tokens: 3500,
    }),
  })
  if (!response.ok) throw new Error(`OpenAI terrain-study analysis HTTP ${response.status}.`)
  const payload = await response.json()
  return { text: extractOutputText(payload), inspected: inputs.length }
}

async function handleStudy(request, env, analyze = false) {
  const origin = request.headers.get('Origin') ?? ''
  if (request.method === 'OPTIONS') {
    if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)
    return new Response(null, { status: 204, headers: corsHeaders(origin, env) })
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin, env)
  if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, origin, env)
  try {
    const parsed = parsePayload(await readJson(request), analyze)
    if (parsed.mode === 'exact') {
      const exact = await exactSlot(request, parsed)
      return jsonResponse({ service: 'terra-terrain-study-v1', generated_at_utc: new Date().toISOString(), ...exact, policy: 'Exact UTC mode preserves the nearest original observation and never replaces it with a clearer scene.' }, 200, origin, env, 'public, max-age=120')
    }
    const slots = await Promise.all(parsed.years.map(year => studySlot(request, parsed, year, env)))
    let ai = null
    if (analyze) ai = await analyzeSlots(parsed, slots.filter(slot => slot.status === 'ready'), env)
    return jsonResponse({
      service: analyze ? 'terra-terrain-study-analysis-v1' : 'terra-terrain-study-v1',
      generated_at_utc: new Date().toISOString(),
      mode: 'study',
      requested_years: parsed.years,
      season: parsed.season,
      cloud_standard_percent: CLEAR_CLOUD_THRESHOLD,
      slots,
      ai_analysis: ai,
      policy: 'Terrain-study images must satisfy <=10% scene cloud metadata or use a clearly labelled Sentinel-2 MAXCC<=10 cloud-minimized mosaic. Original observations are preserved separately with clouds unchanged.',
    }, 200, origin, env, analyze ? 'no-store' : 'public, max-age=300')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Terrain study failed safely.'
    return jsonResponse({ error: message }, message.startsWith('OpenAI') ? 502 : 400, origin, env)
  }
}

export function handleTerrainStudy(request, env = {}) {
  return handleStudy(request, env, false)
}

export function handleTerrainStudyAnalyze(request, env = {}) {
  return handleStudy(request, env, true)
}
