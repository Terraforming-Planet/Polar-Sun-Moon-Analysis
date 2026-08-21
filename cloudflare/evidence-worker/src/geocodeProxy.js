import { isAllowedOrigin } from './index.js'

export const GEOCODE_PATH = '/research/geocode'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const MAX_QUERY_LENGTH = 120
const MAX_RESULTS = 10

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

function normalizeSearchText(value) {
  return value.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim()
}

export function geocodeQueryVariants(query) {
  const variants = [normalizeSearchText(query)]
  const withoutAdministrativeWords = normalizeSearchText(query
    .replace(/\b(gmina|gm\.?|powiat|województwo|woj\.?)\b/giu, ' '))
  if (withoutAdministrativeWords && !variants.includes(withoutAdministrativeWords)) variants.push(withoutAdministrativeWords)

  const hasCountryHint = /\b(polska|poland|niemcy|germany|czechy|czechia|słowacja|slovakia|ukraine|litwa|lithuania|usa|canada|france|spain|italy|egypt|brazil|india|china|japan)\b/iu.test(query)
  const looksPolish = /[ąćęłńóśźż]/iu.test(query) || /\b(gmina|powiat|województwo|wieś|jezioro|rzeka)\b/iu.test(query)
  if (!hasCountryHint && looksPolish) variants.push(`${normalizeSearchText(query)}, Polska`)

  return [...new Set(variants)].slice(0, 3)
}

function mapNominatimItem(item) {
  return {
    display_name: String(item?.display_name ?? '').slice(0, 240),
    latitude: Number(item?.lat),
    longitude: Number(item?.lon),
    type: String(item?.type ?? ''),
    category: String(item?.category ?? ''),
    importance: Number.isFinite(Number(item?.importance)) ? Number(item.importance) : 0,
  }
}

function dedupeResults(items) {
  const seen = new Set()
  const results = []
  for (const item of items) {
    if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude) || !item.display_name) continue
    const key = `${item.latitude.toFixed(5)}:${item.longitude.toFixed(5)}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push(item)
  }
  return results.sort((a, b) => b.importance - a.importance).slice(0, MAX_RESULTS)
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function requestNominatim(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: String(MAX_RESULTS),
    addressdetails: '1',
    namedetails: '1',
    dedupe: '1',
    'accept-language': 'pl,en',
  })
  const url = `${NOMINATIM_URL}?${params.toString()}`
  let lastStatus = 0
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const upstream = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/',
        'User-Agent': 'TerraObservationResearch/1.1 (public environmental research UI)',
      },
    })
    lastStatus = upstream.status
    if (upstream.ok) {
      const payload = await upstream.json()
      return Array.isArray(payload) ? payload.map(mapNominatimItem) : []
    }
    if (![429, 500, 502, 503, 504].includes(upstream.status) || attempt === 2) break
    await sleep(250 * attempt)
  }
  throw new Error(`Nominatim HTTP ${lastStatus || 'network error'}`)
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

  try {
    const variants = geocodeQueryVariants(query)
    const collected = []
    const attempted = []
    let upstreamFailed = false

    for (const variant of variants) {
      attempted.push(variant)
      try {
        const matches = await requestNominatim(variant)
        collected.push(...matches)
        if (dedupeResults(collected).length >= 5) break
      } catch {
        upstreamFailed = true
      }
    }

    const results = dedupeResults(collected)
    if (!results.length && upstreamFailed) {
      return jsonResponse({ error: 'OpenStreetMap search is temporarily unavailable. Try again in a moment or enter WGS84 coordinates.' }, 502, origin, env)
    }

    return jsonResponse({
      query,
      attempted_queries: attempted,
      results,
      source: 'OpenStreetMap Nominatim',
      source_url: 'https://nominatim.openstreetmap.org/',
    }, 200, origin, env, 'public, max-age=3600')
  } catch {
    return jsonResponse({ error: 'OpenStreetMap search failed safely. Try again or enter WGS84 coordinates.' }, 502, origin, env)
  }
}
