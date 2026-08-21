import { extractLandsatBrowseImages } from './areaAnalysisWithLandsatBrowse.js'
import { isAllowedOrigin } from './index.js'
import { buildUsGsLandsatUrl } from './landsatProxy.js'

export const OBSERVATION_VIEW_PATH = '/research/observation-view'
export const MIN_VIEW_HEIGHT_KM = 1
export const MAX_VIEW_HEIGHT_KM = 25_000

const EARTH_RADIUS_KM = 6371.0088
const HALF_FOV_RADIANS = Math.PI / 6
const GIBS_START = '2000-02-24'
const SENTINEL2_START = '2015-06-23'
const LANDSAT_START = '1972-07-23'
const DEFAULT_CDSE_INSTANCE = 'd708f736-b553-4328-9b5e-39bdb444790c'
const MAX_BODY_BYTES = 2048
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ALLOWED_FIELDS = new Set(['latitude', 'longitude', 'view_height_km', 'date', 'cloud_mode'])

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

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function observationFootprintRadiusKm(viewHeightKm) {
  const height = clamp(Number(viewHeightKm), MIN_VIEW_HEIGHT_KM, MAX_VIEW_HEIGHT_KM)
  const lensRadius = height * Math.tan(HALF_FOV_RADIANS)
  const horizonAngle = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + height))
  const horizonRadius = EARTH_RADIUS_KM * horizonAngle
  return Math.max(1, Math.min(lensRadius, horizonRadius))
}

export function recommendedAnalysisRadiusKm(viewHeightKm) {
  return Math.min(500, Math.max(1, observationFootprintRadiusKm(viewHeightKm)))
}

function sphericalBounds(latitude, longitude, radiusKm) {
  const angular = Math.min(Math.PI, Math.max(0, radiusKm) / EARTH_RADIUS_KM)
  const lat = latitude * Math.PI / 180
  const minLat = Math.max(-Math.PI / 2, lat - angular)
  const maxLat = Math.min(Math.PI / 2, lat + angular)
  let west = -180
  let east = 180
  if (minLat > -Math.PI / 2 && maxLat < Math.PI / 2) {
    const ratio = Math.sin(angular) / Math.max(1e-9, Math.cos(lat))
    if (Math.abs(ratio) < 1) {
      const delta = Math.asin(ratio) * 180 / Math.PI
      west = Math.max(-180, longitude - delta)
      east = Math.min(180, longitude + delta)
    }
  }
  return {
    west,
    south: minLat * 180 / Math.PI,
    east,
    north: maxLat * 180 / Math.PI,
  }
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function parsePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Request body must be one JSON object.')
  for (const key of Object.keys(value)) if (!ALLOWED_FIELDS.has(key)) throw new Error(`Unexpected field: ${key}.`)
  const latitude = Number(value.latitude)
  const longitude = Number(value.longitude)
  const viewHeightKm = Number(value.view_height_km)
  const date = String(value.date ?? '')
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('latitude is outside WGS84 bounds.')
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('longitude is outside WGS84 bounds.')
  if (!Number.isFinite(viewHeightKm) || viewHeightKm < MIN_VIEW_HEIGHT_KM || viewHeightKm > MAX_VIEW_HEIGHT_KM) {
    throw new Error(`view_height_km must be from ${MIN_VIEW_HEIGHT_KM} to ${MAX_VIEW_HEIGHT_KM}.`)
  }
  if (!DATE_PATTERN.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) throw new Error('date must use YYYY-MM-DD.')
  if (date < LANDSAT_START || date > todayUtc()) throw new Error(`date must be from ${LANDSAT_START} to today.`)
  return {
    latitude,
    longitude,
    viewHeightKm,
    date,
    cloudMode: value.cloud_mode === 'any' ? 'any' : 'clear',
    footprintRadiusKm: observationFootprintRadiusKm(viewHeightKm),
  }
}

function proxiedUrl(request, originalUrl) {
  const params = new URLSearchParams({ url: originalUrl })
  return `${new URL(request.url).origin}/research/image?${params.toString()}`
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function nasaObservation(request, parsed) {
  if (parsed.date < GIBS_START) return null
  const bounds = sphericalBounds(parsed.latitude, parsed.longitude, parsed.footprintRadiusKm)
  const viirs = parsed.date >= '2012-01-19'
  const layer = viirs ? 'VIIRS_SNPP_CorrectedReflectance_TrueColor' : 'MODIS_Terra_CorrectedReflectance_TrueColor'
  const source = viirs ? 'NASA GIBS · Suomi NPP VIIRS True Color' : 'NASA GIBS · Terra MODIS True Color'
  const params = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: layer, STYLES: '',
    FORMAT: 'image/jpeg', TRANSPARENT: 'FALSE', SRS: 'EPSG:4326',
    BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    WIDTH: '1600', HEIGHT: '1600', TIME: parsed.date,
  })
  const originalUrl = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`
  return {
    source,
    source_class: viirs ? 'wide-global-viirs' : 'wide-global-modis',
    date: parsed.date,
    url: proxiedUrl(request, originalUrl),
    original_url: originalUrl,
    cloud_screening: 'Daily true-colour wide view; clouds can remain visible. The clear/cloud preference cannot guarantee a cloud-free global frame.',
    provenance_note: 'Official NASA GIBS daily true-colour layer rendered for the requested virtual observation footprint.',
  }
}

function sentinelObservation(request, parsed, env) {
  if (parsed.date < SENTINEL2_START || parsed.viewHeightKm > 250) return null
  const bounds = sphericalBounds(parsed.latitude, parsed.longitude, Math.min(parsed.footprintRadiusKm, 250))
  const instance = typeof env.CDSE_INSTANCE_ID === 'string' && env.CDSE_INSTANCE_ID.trim() ? env.CDSE_INSTANCE_ID.trim() : DEFAULT_CDSE_INSTANCE
  const layer = typeof env.CDSE_TRUE_COLOR_LAYER === 'string' && env.CDSE_TRUE_COLOR_LAYER.trim() ? env.CDSE_TRUE_COLOR_LAYER.trim() : 'NATURAL-COLOR'
  const start = addDays(parsed.date, -14)
  const maxCloud = parsed.cloudMode === 'clear' ? '20' : '80'
  const params = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: layer, STYLES: '',
    FORMAT: 'image/jpeg', TRANSPARENT: 'FALSE', SRS: 'EPSG:4326',
    BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    WIDTH: '1800', HEIGHT: '1800', TIME: `${start}/${parsed.date}`, MAXCC: maxCloud, SHOWLOGO: 'false',
  })
  const originalUrl = `https://sh.dataspace.copernicus.eu/ogc/wms/${instance}?${params.toString()}`
  return {
    source: 'Copernicus Data Space · Sentinel-2 L2A true-colour WMS',
    source_class: 'local-high-detail-sentinel-2',
    date: parsed.date,
    url: proxiedUrl(request, originalUrl),
    original_url: originalUrl,
    cloud_screening: `Requested WMS window ${start}..${parsed.date} with MAXCC=${maxCloud}%. It may be a mosaic/latest usable scene, not an asserted exact sensing moment.`,
    provenance_note: 'Official Copernicus Data Space Sentinel-2 L2A WMS selected for a local/high-detail virtual camera height.',
  }
}

async function landsatObservation(request, parsed) {
  const localRadius = Math.min(500, Math.max(1, parsed.footprintRadiusKm))
  const bounds = sphericalBounds(parsed.latitude, parsed.longitude, localRadius)
  const start = addDays(parsed.date, -45)
  const end = addDays(parsed.date, 45) > todayUtc() ? todayUtc() : addDays(parsed.date, 45)
  const upstreamUrl = buildUsGsLandsatUrl({
    bbox: [bounds.west, bounds.south, bounds.east, bounds.north],
    start,
    end,
    limit: 25,
  })
  const upstream = await fetch(upstreamUrl, { headers: { Accept: 'application/geo+json,application/json' } })
  if (!upstream.ok) return null
  const images = extractLandsatBrowseImages(await upstream.json(), 25)
  if (!images.length) return null
  const target = Date.parse(`${parsed.date}T12:00:00Z`)
  const selected = [...images].sort((a, b) => {
    const aCloud = Number.isFinite(a.cloud_cover) ? a.cloud_cover : 101
    const bCloud = Number.isFinite(b.cloud_cover) ? b.cloud_cover : 101
    const aDistance = Math.abs(Date.parse(`${a.date}T12:00:00Z`) - target)
    const bDistance = Math.abs(Date.parse(`${b.date}T12:00:00Z`) - target)
    return parsed.cloudMode === 'clear' ? aCloud - bCloud || aDistance - bDistance : aDistance - bDistance || aCloud - bCloud
  })[0]
  return {
    source: selected.source,
    source_class: parsed.viewHeightKm > 250 ? 'historical-local-landsat-fallback' : 'local-landsat',
    date: selected.date,
    url: proxiedUrl(request, selected.original_url ?? selected.url),
    original_url: selected.original_url ?? selected.url,
    cloud_screening: Number.isFinite(selected.cloud_cover) ? `USGS scene cloud cover metadata: ${selected.cloud_cover.toFixed(1)}%.` : 'USGS scene did not expose cloud-cover metadata.',
    provenance_note: parsed.viewHeightKm > 250
      ? 'Historical Landsat browse is a local fallback. A single pre-2000 Landsat scene cannot honestly represent the full requested very-wide footprint.'
      : 'Official USGS Landsat Collection 2 browse/thumbnail selected near the requested date.',
  }
}

async function selectObservation(request, parsed, env) {
  if (parsed.viewHeightKm <= 250) {
    const sentinel = sentinelObservation(request, parsed, env)
    if (sentinel) return sentinel
    try {
      const landsat = await landsatObservation(request, parsed)
      if (landsat) return landsat
    } catch {
      // Continue to NASA fallback when available.
    }
  }
  const nasa = nasaObservation(request, parsed)
  if (nasa) return nasa
  try {
    return await landsatObservation(request, parsed)
  } catch {
    return null
  }
}

export async function handleObservationView(request, env = {}) {
  const origin = request.headers.get('Origin') ?? ''
  if (request.method === 'OPTIONS') {
    if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)
    return new Response(null, { status: 204, headers: corsHeaders(origin, env) })
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin, env)
  if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, origin, env)

  let parsed
  try {
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('Request is too large.')
    parsed = parsePayload(JSON.parse(text))
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid observation-view request.' }, 400, origin, env)
  }

  const image = await selectObservation(request, parsed, env)
  if (!image) {
    return jsonResponse({
      service: 'terra-observation-view-v1',
      generated_at_utc: new Date().toISOString(),
      requested_height_km: parsed.viewHeightKm,
      footprint_radius_km: Number(parsed.footprintRadiusKm.toFixed(1)),
      analysis_radius_recommendation_km: Number(recommendedAnalysisRadiusKm(parsed.viewHeightKm).toFixed(1)),
      status: 'missing',
      reason: 'No browser-renderable official image was available for this date/scale. Nothing was generated or substituted.',
    }, 200, origin, env)
  }

  return jsonResponse({
    service: 'terra-observation-view-v1',
    generated_at_utc: new Date().toISOString(),
    status: 'image',
    requested_height_km: parsed.viewHeightKm,
    footprint_radius_km: Number(parsed.footprintRadiusKm.toFixed(1)),
    analysis_radius_recommendation_km: Number(recommendedAnalysisRadiusKm(parsed.viewHeightKm).toFixed(1)),
    wide_context_only: parsed.footprintRadiusKm > 500,
    image,
    policy: 'The slider represents a virtual camera height/field of view, not a command that changes a satellite orbit. Source selection switches between official Copernicus Sentinel-2, USGS Landsat and NASA GIBS according to scale/date availability.',
  }, 200, origin, env, 'public, max-age=300')
}
