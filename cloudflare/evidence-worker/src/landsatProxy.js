import { isAllowedOrigin } from './index.js'

export const LANDSAT_PROXY_PATH = '/research/landsat'
export const LANDSAT_COLLECTION = 'landsat-c2l2-sr'
export const LANDSAT_STAC_ITEMS_URL = `https://landsatlook.usgs.gov/stac-server/collections/${LANDSAT_COLLECTION}/items`

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_LIMIT = 25
const MAX_LONGITUDE_SPAN = 60
const MAX_LATITUDE_SPAN = 60
const ALLOWED_QUERY_KEYS = new Set(['bbox', 'start', 'end', 'limit'])

function corsHeaders(origin, env = {}) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
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

function parseDate(value, label) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) throw new Error(`${label} must use YYYY-MM-DD.`)
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(timestamp)) throw new Error(`${label} is not a valid date.`)
  return { value, timestamp }
}

function parseBbox(value) {
  if (typeof value !== 'string') throw new Error('bbox is required.')
  const parts = value.split(',').map(Number)
  if (parts.length !== 4 || parts.some(item => !Number.isFinite(item))) throw new Error('bbox must contain four finite numbers.')
  const [west, south, east, north] = parts
  if (west < -180 || east > 180 || south < -90 || north > 90) throw new Error('bbox is outside WGS84 bounds.')
  if (west >= east || south >= north) throw new Error('bbox bounds are not ordered correctly.')
  if (east - west > MAX_LONGITUDE_SPAN || north - south > MAX_LATITUDE_SPAN) throw new Error('bbox is too large for one interactive request.')
  return [west, south, east, north]
}

export function parseLandsatProxyQuery(url) {
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) throw new Error(`Unexpected query field: ${key}.`)
  }

  const bbox = parseBbox(url.searchParams.get('bbox'))
  const start = parseDate(url.searchParams.get('start'), 'start')
  const end = parseDate(url.searchParams.get('end'), 'end')
  if (start.timestamp > end.timestamp) throw new Error('start must not be later than end.')

  const requestedLimit = Number(url.searchParams.get('limit') ?? '12')
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_LIMIT) {
    throw new Error(`limit must be an integer from 1 to ${MAX_LIMIT}.`)
  }

  return {
    bbox,
    start: start.value,
    end: end.value,
    limit: requestedLimit,
  }
}

export function buildUsGsLandsatUrl(query) {
  const params = new URLSearchParams({
    bbox: query.bbox.join(','),
    datetime: `${query.start}T00:00:00Z/${query.end}T23:59:59Z`,
    limit: String(query.limit),
  })
  return `${LANDSAT_STAC_ITEMS_URL}?${params.toString()}`
}

export async function handleLandsatProxy(request, env = {}) {
  const origin = request.headers.get('Origin') ?? ''

  if (request.method === 'OPTIONS') {
    if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)
    return new Response(null, { status: 204, headers: corsHeaders(origin, env) })
  }

  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed.' }, 405, origin, env)
  if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)

  let query
  try {
    query = parseLandsatProxyQuery(new URL(request.url))
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid Landsat query.' }, 400, origin, env)
  }

  const upstreamUrl = buildUsGsLandsatUrl(query)
  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/geo+json,application/json',
      },
    })
    if (!upstream.ok) {
      return jsonResponse({
        error: 'USGS Landsat catalogue is temporarily unavailable.',
        upstream_status: upstream.status,
      }, 502, origin, env)
    }

    const payload = await upstream.json()
    return jsonResponse({
      ...payload,
      terra_source: {
        agency: 'USGS',
        service: 'Landsat Collection 2 STAC',
        collection: LANDSAT_COLLECTION,
        upstream_url: upstreamUrl,
        relayed_by: 'terra-observation-evidence-explainer',
      },
    }, 200, origin, env, 'public, max-age=300')
  } catch {
    return jsonResponse({ error: 'USGS Landsat catalogue request failed safely.' }, 502, origin, env)
  }
}
