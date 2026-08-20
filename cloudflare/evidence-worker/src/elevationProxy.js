import { isAllowedOrigin } from './index.js'

export const ELEVATION_PATH = '/research/elevation'

const MAX_POINTS = 200
const MAX_REQUEST_BYTES = 48_000
const OPEN_METEO_ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation'

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

function jsonResponse(payload, status, origin, env) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin, env),
    },
  })
}

async function readSmallJson(request) {
  const length = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) throw new Error('Request is too large.')
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) throw new Error('Request is too large.')
  return JSON.parse(text)
}

function validatePoint(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Point ${index + 1} is invalid.`)
  const latitude = Number(value.latitude)
  const longitude = Number(value.longitude)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error(`Point ${index + 1}: latitude is outside WGS84 bounds.`)
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error(`Point ${index + 1}: longitude is outside WGS84 bounds.`)
  const label = typeof value.label === 'string' ? value.label.trim().slice(0, 120) : ''
  return { latitude, longitude, label }
}

function parsePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Request body must be one JSON object.')
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] !== 'points') throw new Error('Only the points field is accepted.')
  if (!Array.isArray(value.points) || value.points.length < 1 || value.points.length > MAX_POINTS) {
    throw new Error(`points must contain from 1 to ${MAX_POINTS} coordinates.`)
  }
  return value.points.map(validatePoint)
}

async function fetchCopernicusDem(points) {
  const params = new URLSearchParams({
    latitude: points.map(point => point.latitude.toFixed(6)).join(','),
    longitude: points.map(point => point.longitude.toFixed(6)).join(','),
  })
  const response = await fetch(`${OPEN_METEO_ELEVATION_URL}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Elevation delivery service returned HTTP ${response.status}.`)
  const payload = await response.json()
  const elevations = Array.isArray(payload?.elevation) ? payload.elevation : []
  if (elevations.length !== points.length) throw new Error('Elevation service returned an incomplete point set.')
  return elevations
}

export async function handleElevationProxy(request, env = {}) {
  const origin = request.headers.get('Origin') ?? ''
  if (request.method === 'OPTIONS') {
    if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)
    return new Response(null, { status: 204, headers: corsHeaders(origin, env) })
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin, env)
  if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, origin, env)
  }

  try {
    const points = parsePayload(await readSmallJson(request))
    const elevations = await fetchCopernicusDem(points)
    return jsonResponse({
      service: 'terra-observation-elevation',
      generated_at_utc: new Date().toISOString(),
      dataset: {
        name: 'Copernicus DEM GLO-90',
        release: '2021',
        nominal_horizontal_resolution_m: 90,
        elevation_reference: 'dataset-provided elevation above mean sea level',
        source_agency: 'European Union Copernicus Programme',
        delivery_service: 'Open-Meteo Elevation API',
        delivery_note: 'Open-Meteo is used only as a read-only delivery proxy for the Copernicus DEM GLO-90 raster. Values are DEM raster samples, not surveyed spot heights.',
        official_dataset_url: 'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM',
      },
      points: points.map((point, index) => ({
        ...point,
        elevation_m: Number(elevations[index]),
        sample_method: 'nearest available DEM raster sample',
        exact_surveyed_point: false,
        nominal_cell_size_m: 90,
        location_uncertainty_note: 'The returned value represents the nearest available GLO-90 raster sample around the requested WGS84 coordinate; local terrain can vary inside one cell.',
      })),
    }, 200, origin, env)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Elevation lookup failed.'
    return jsonResponse({ error: message }, message.includes('HTTP') ? 502 : 400, origin, env)
  }
}
