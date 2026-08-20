import { isAllowedOrigin } from './index.js'

export const GEOCODE_PATH = '/research/geocode'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const MAX_QUERY_LENGTH = 120

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

export function parseGeocodeQuery(url) {
  for (const key of url.searchParams.keys()) {
    if (key !== 'q') throw new Error(`Unexpected query field: ${key}.`)
  }
  const query = (url.searchParams.get('q') ?? '').trim()
  if (!query) throw new Error('q is required.')
  if (query.length > MAX_QUERY_LENGTH) throw new Error(`q must be at most ${MAX_QUERY_LENGTH} characters.`)
  if(/[\u0000-\u001f\u007f]/.test(query)) throw new Error('q contains unsupported characters.')
  return query
}

export async function handleGeocodeProxy(request, env = {}) {
  const origin = request.headers.get('Origin') ?? ''
  if (request.method === 'OPTIONS') {
    if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)
    return new Response(null, { status: 204, headers: corsHeaders(origin, env) })
  }
  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed.' }, 405, origin, env)
  if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)

  let query
  try {
    query = parseGeocodeQuery(new URL(request.url))
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid geocode query.' }, 400, origin, env)
  }

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '5',
    addressdetails: '1',
    'accept-language': 'pl,en',
  })

  try {
    const upstream = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/',
        'User-Agent': 'TerraObservationResearch/1.0 (public environmental research UI)',
      },
    })
    if (!upstream.ok) return jsonResponse({ error: 'OpenStreetMap search is temporarily unavailable.' }, 502, origin, env)
    const payload = await upstream.json()
    const results = Array.isArray(payload) ? payload.slice(0, 5).map(item => ({
      display_name: String(item.display_name ?? '').slice(0, 240),
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      type: String(item.type ?? ''),
      category: String(item.category ?? ''),
    })).filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) : []

    return jsonResponse({
      query,
      results,
      source: 'OpenStreetMap Nominatim',
      source_url: 'https://nominatim.openstreetmap.org/',
    }, 200, origin, env, 'public, max-age=3600')
  } catch {
    return jsonResponse({ error: 'OpenStreetMap search failed safely.' }, 502, origin, env)
  }
}
