import { handleTerrainStudy } from './terrainStudy.js'
import { observationFootprintRadiusKm } from './observationView.js'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5.6-terra'
const CLEAR_CLOUD_THRESHOLD = 10
const SENTINEL2_START = '2015-06-23'
const DEFAULT_CDSE_INSTANCE = 'd708f736-b553-4328-9b5e-39bdb444790c'
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_VISUAL_BYTES = 24 * 1024 * 1024
const SEASON_WINDOWS = {
  all: ['01-01', '12-31'],
  spring: ['03-01', '05-31'],
  summer: ['06-01', '08-31'],
  autumn: ['09-01', '11-30'],
  winter: ['01-01', '02-28'],
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function bounds(latitude, longitude, radiusKm) {
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

function proxyUrl(request, url) {
  return `${new URL(request.url).origin}/research/image?${new URLSearchParams({ url }).toString()}`
}

function scalePayload(body) {
  const viewHeightKm = Number(body?.view_height_km)
  if (!Number.isFinite(viewHeightKm)) return null
  if (viewHeightKm < 1 || viewHeightKm > 25_000) throw new Error('view_height_km must be from 1 to 25000.')
  const footprintRadiusKm = observationFootprintRadiusKm(viewHeightKm)
  return {
    requestedScaleKm: viewHeightKm,
    footprintRadiusKm,
    queryRadiusKm: Math.min(500, Math.max(1, footprintRadiusKm)),
  }
}

function forwardedRequest(request, body, scale) {
  const next = { ...body }
  delete next.view_height_km
  next.radius_km = scale ? Number(scale.queryRadiusKm.toFixed(2)) : Number(body?.radius_km ?? 25)
  const headers = new Headers(request.headers)
  headers.set('Content-Type', 'application/json')
  return new Request(request.url, { method: request.method, headers, body: JSON.stringify(next) })
}

function sentinelScaleLockedImage(request, body, year, scale, env) {
  if (!scale || scale.requestedScaleKm > 250) return null
  const season = SEASON_WINDOWS[body?.season] ? body.season : 'all'
  const [startSuffix, endSuffix] = SEASON_WINDOWS[season]
  const start = `${year}-${startSuffix}`
  let end = `${year}-${endSuffix}`
  if (end < SENTINEL2_START || start > todayUtc()) return null
  if (end > todayUtc()) end = todayUtc()
  const region = bounds(Number(body.latitude), Number(body.longitude), scale.footprintRadiusKm)
  const instance = typeof env.CDSE_INSTANCE_ID === 'string' && env.CDSE_INSTANCE_ID.trim() ? env.CDSE_INSTANCE_ID.trim() : DEFAULT_CDSE_INSTANCE
  const layer = typeof env.CDSE_TRUE_COLOR_LAYER === 'string' && env.CDSE_TRUE_COLOR_LAYER.trim() ? env.CDSE_TRUE_COLOR_LAYER.trim() : 'NATURAL-COLOR'
  const build = size => {
    const params = new URLSearchParams({
      SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: layer, STYLES: '',
      FORMAT: 'image/jpeg', TRANSPARENT: 'FALSE', SRS: 'EPSG:4326',
      BBOX: `${region.west},${region.south},${region.east},${region.north}`,
      WIDTH: String(size), HEIGHT: String(size), TIME: `${start}/${end}`,
      MAXCC: String(CLEAR_CLOUD_THRESHOLD), SHOWLOGO: 'false',
    })
    return `https://sh.dataspace.copernicus.eu/ogc/wms/${instance}?${params.toString()}`
  }
  const thumbnail = build(420)
  const full = build(1800)
  return {
    scene_id: null,
    date: end,
    datetime_utc: null,
    platform: 'Sentinel-2 L2A',
    source: 'Copernicus Data Space · Sentinel-2 L2A · scale-locked cloud-minimized study mosaic',
    kind: 'scale-locked-cloud-minimized-mosaic',
    cloud_cover: null,
    threshold: CLEAR_CLOUD_THRESHOLD,
    thumbnail_url: proxyUrl(request, thumbnail),
    full_url: proxyUrl(request, full),
    original_thumbnail_url: thumbnail,
    original_full_url: full,
    requested_scale_km: scale.requestedScaleKm,
    actual_scale_km: scale.requestedScaleKm,
    footprint_radius_km: Number(scale.footprintRadiusKm.toFixed(2)),
    scale_locked: true,
    note: `Official Sentinel-2 L2A WMS rendered with one locked virtual-camera scale for the whole study. TIME=${start}/${end}; MAXCC=${CLEAR_CLOUD_THRESHOLD}. It may be a mosaic rather than one exact sensing moment.`,
  }
}

function appendWarning(existing, next) {
  return existing ? `${existing} ${next}` : next
}

function applyScaleLock(request, body, payload, scale, env) {
  if (!scale || !payload || typeof payload !== 'object') return payload
  payload.requested_scale_km = scale.requestedScaleKm
  payload.footprint_radius_km = Number(scale.footprintRadiusKm.toFixed(2))
  payload.scale_locked = body?.mode !== 'exact'

  if (body?.mode === 'exact' || payload.mode === 'exact') {
    payload.scale_locked = false
    payload.policy = `${payload.policy ?? ''} Exact-time mode keeps the original acquisition unaltered; the scale lock is intentionally not applied to the native original scene.`.trim()
    return payload
  }

  payload.slots = (Array.isArray(payload.slots) ? payload.slots : []).map(slot => {
    const locked = sentinelScaleLockedImage(request, body, Number(slot.year), scale, env)
    if (locked && slot.status === 'ready') {
      return {
        ...slot,
        selection_evidence: slot.analysis_image ?? null,
        analysis_image: locked,
        standard: `Sentinel-2 MAXCC <= ${CLEAR_CLOUD_THRESHOLD}% · locked scale ${scale.requestedScaleKm} km`,
        warning: appendWarning(slot.warning, `Display/AI image uses the same ${scale.requestedScaleKm} km virtual-camera scale as every other study year.`),
      }
    }
    return {
      ...slot,
      analysis_image: slot.analysis_image ? {
        ...slot.analysis_image,
        requested_scale_km: scale.requestedScaleKm,
        actual_scale_km: null,
        footprint_radius_km: Number(scale.footprintRadiusKm.toFixed(2)),
        scale_locked: false,
      } : slot.analysis_image,
      warning: appendWarning(slot.warning, `A scale-locked cloud-minimized render is not available for this year/source; the native original framing is preserved instead of pretending it matches ${scale.requestedScaleKm} km.`),
    }
  })
  payload.policy = `${payload.policy ?? ''} When Sentinel-2 is available, every terrain-study display/AI image is rendered at one locked virtual-camera scale from the slider. Native-source originals remain separate evidence.`.trim()
  return payload
}

async function preflightImage(url) {
  const response = await fetch(url, { headers: { Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8' } })
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
  throw new Error('OpenAI scale-locked terrain response did not contain output text.')
}

async function analyzeScaleLocked(body, payload, env) {
  if (!env.OPENAI_API_KEY) throw new Error('OpenAI is not configured.')
  const inputs = []
  const metadata = []
  let totalBytes = 0
  for (const slot of Array.isArray(payload.slots) ? payload.slots : []) {
    const image = slot?.analysis_image
    if (!image?.scale_locked || !image?.original_full_url) continue
    try {
      const prepared = await preflightImage(image.original_full_url)
      if (totalBytes + prepared.bytes.byteLength > MAX_VISUAL_BYTES) continue
      totalBytes += prepared.bytes.byteLength
      inputs.push({ type: 'input_image', image_url: `data:${prepared.mime};base64,${bytesToBase64(prepared.bytes)}`, detail: 'high' })
      metadata.push({ year: slot.year, date: image.date, source: image.source, requested_scale_km: image.requested_scale_km, footprint_radius_km: image.footprint_radius_km, scale_locked: true })
    } catch {
      // A failed image preflight remains excluded rather than being replaced with invented evidence.
    }
  }
  if (!inputs.length) return { text: 'Brak obrazów, które jednocześnie spełniają standard zachmurzenia i blokadę wspólnej skali dla tej paczki.', inspected: 0 }
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: typeof env.OPENAI_MODEL === 'string' && env.OPENAI_MODEL.trim() ? env.OPENAI_MODEL.trim() : DEFAULT_MODEL,
      instructions: 'You are Terra Observation terrain-study AI. Respond in Polish. Analyze only the supplied official satellite images. All supplied study images share one locked virtual-camera scale. Compare terrain, water bodies/channels, exposed sediment, vegetation and visible land-cover changes across years. Distinguish observations from hypotheses. Mention years and sources actually inspected. Never invent measurements or causes.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: `Obszar: ${body.place_name || 'wybrany punkt'}; WGS84 ${body.latitude}, ${body.longitude}. Wspólna skala: ${payload.requested_scale_km} km. Metadane: ${JSON.stringify(metadata)}` }, ...inputs] }],
      max_output_tokens: 3500,
    }),
  })
  if (!response.ok) throw new Error(`OpenAI scale-locked terrain analysis HTTP ${response.status}.`)
  return { text: extractOutputText(await response.json()), inspected: inputs.length }
}

async function readBody(request) {
  try { return await request.clone().json() } catch { return null }
}

async function handle(request, env, analyze) {
  const body = await readBody(request)
  if (!body || request.method !== 'POST') return handleTerrainStudy(request, env)
  let scale = null
  try { scale = scalePayload(body) } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid scale lock.' }), { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }
  const upstream = await handleTerrainStudy(forwardedRequest(request, body, scale), env)
  if (!upstream.ok) return upstream
  const payload = applyScaleLock(request, body, await upstream.json(), scale, env)
  if (analyze && body.mode !== 'exact') {
    try { payload.ai_analysis = await analyzeScaleLocked(body, payload, env) }
    catch (error) { return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Scale-locked AI analysis failed.' }), { status: 502, headers: upstream.headers }) }
  }
  const headers = new Headers(upstream.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', analyze ? 'no-store' : 'public, max-age=300')
  return new Response(JSON.stringify(payload), { status: 200, headers })
}

export function handleScaleLockedTerrainStudy(request, env = {}) {
  return handle(request, env, false)
}

export function handleScaleLockedTerrainStudyAnalyze(request, env = {}) {
  return handle(request, env, true)
}
