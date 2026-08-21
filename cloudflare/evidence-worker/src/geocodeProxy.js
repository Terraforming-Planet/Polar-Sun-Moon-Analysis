import { isAllowedOrigin } from './index.js'

export const GEOCODE_PATH = '/research/geocode'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const MAX_QUERY_LENGTH = 160
const MAX_RESULTS = 10
const MAX_VARIANTS = 8

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
  return String(value ?? '')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[·•|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim()
}

function accentFold(value) {
  return normalizeSearchText(value)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
}

function searchKey(value) {
  return accentFold(value).toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function queryParts(query) {
  return normalizeSearchText(query).split(',').map(part => part.trim()).filter(Boolean)
}

function structuredHints(query) {
  const parts = queryParts(query)
  if (parts.length < 2) return null
  return {
    locality: parts[0],
    country: parts.at(-1),
  }
}

export function geocodeQueryVariants(query) {
  const original = normalizeSearchText(query)
  const variants = [original]
  const push = value => {
    const normalized = normalizeSearchText(value)
    if (normalized && !variants.some(item => searchKey(item) === searchKey(normalized))) variants.push(normalized)
  }

  const withoutAdministrativeWords = normalizeSearchText(original
    .replace(/\b(gmina|gm\.?|powiat|województwo|woj\.?|district|region|province|governorate|municipality)\b/giu, ' '))
  push(withoutAdministrativeWords)

  const folded = accentFold(original)
  push(folded)
  push(original.replace(/,/g, ' '))
  push(folded.replace(/,/g, ' '))

  const hints = structuredHints(original)
  if (hints) {
    push(`${hints.locality} ${hints.country}`)
    push(`${accentFold(hints.locality)} ${accentFold(hints.country)}`)
    push(hints.locality)
  }

  const hasCountryHint = /\b(polska|poland|niemcy|germany|czechy|czechia|słowacja|slovakia|ukraine|litwa|lithuania|usa|canada|france|spain|italy|egypt|brazil|india|china|japan|senegal|somalia)\b/iu.test(original)
  const looksPolish = /[ąćęłńóśźż]/iu.test(original) || /\b(gmina|powiat|województwo|wieś|jezioro|rzeka)\b/iu.test(original)
  if (!hasCountryHint && looksPolish) push(`${withoutAdministrativeWords || original}, Polska`)

  return variants.slice(0, MAX_VARIANTS)
}

function mapNominatimItem(item) {
  return {
    display_name: String(item?.display_name ?? '').slice(0, 300),
    latitude: Number(item?.lat),
    longitude: Number(item?.lon),
    type: String(item?.type ?? ''),
    category: String(item?.category ?? ''),
    importance: Number.isFinite(Number(item?.importance)) ? Number(item.importance) : 0,
    namedetails: item?.namedetails && typeof item.namedetails === 'object' ? item.namedetails : null,
  }
}

function resultScore(item, query) {
  const display = searchKey(item.display_name)
  const parts = queryParts(query)
  const locality = searchKey(parts[0] ?? query)
  const country = parts.length > 1 ? searchKey(parts.at(-1)) : ''
  let score = Number(item.importance ?? 0)
  if (locality && display.includes(locality)) score += 5
  if (country && display.includes(country)) score += 8
  const foldedLocality = searchKey(accentFold(parts[0] ?? query))
  if (foldedLocality && display.includes(foldedLocality)) score += 3
  if (['city', 'town', 'village', 'hamlet', 'municipality', 'administrative'].includes(String(item.type).toLowerCase())) score += 0.5
  return score
}

function dedupeResults(items, query) {
  const seen = new Set()
  const results = []
  for (const item of items) {
    if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude) || !item.display_name) continue
    const key = `${item.latitude.toFixed(5)}:${item.longitude.toFixed(5)}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push(item)
  }
  return results.sort((a, b) => resultScore(b, query) - resultScore(a, query)).slice(0, MAX_RESULTS)
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function requestNominatimFreeText(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: String(MAX_RESULTS),
    addressdetails: '1',
    namedetails: '1',
    dedupe: '1',
    'accept-language': 'pl,en',
  })
  return requestNominatimParams(params)
}

async function requestNominatimStructured(locality, country) {
  const params = new URLSearchParams({
    city: locality,
    country,
    format: 'jsonv2',
    limit: String(MAX_RESULTS),
    addressdetails: '1',
    namedetails: '1',
    dedupe: '1',
    'accept-language': 'pl,en',
  })
  return requestNominatimParams(params)
}

async function requestNominatimParams(params) {
  const url = `${NOMINATIM_URL}?${params.toString()}`
  let lastStatus = 0
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    try {
      const upstream = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Referer: 'https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/',
          'User-Agent': 'TerraObservationResearch/1.2 (public environmental research UI; contact: https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis)',
        },
      })
      lastStatus = upstream.status
      if (upstream.ok) {
        const payload = await upstream.json()
        return Array.isArray(payload) ? payload.map(mapNominatimItem) : []
      }
      if (![429, 500, 502, 503, 504].includes(upstream.status) || attempt === 2) break
    } finally {
      clearTimeout(timeout)
    }
    await sleep(350 * attempt)
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

    for (const variant of variants.slice(0, 4)) {
      attempted.push(variant)
      try {
        const matches = await requestNominatimFreeText(variant)
        collected.push(...matches)
        const ranked = dedupeResults(collected, query)
        if (ranked.length && resultScore(ranked[0], query) >= 5) break
      } catch {
        upstreamFailed = true
      }
    }

    if (!dedupeResults(collected, query).length) {
      const hints = structuredHints(query)
      if (hints) {
        attempted.push(`structured: city=${hints.locality}; country=${hints.country}`)
        try {
          collected.push(...await requestNominatimStructured(hints.locality, hints.country))
          if (!dedupeResults(collected, query).length) {
            const foldedLocality = accentFold(hints.locality)
            const foldedCountry = accentFold(hints.country)
            if (foldedLocality !== hints.locality || foldedCountry !== hints.country) {
              attempted.push(`structured-folded: city=${foldedLocality}; country=${foldedCountry}`)
              collected.push(...await requestNominatimStructured(foldedLocality, foldedCountry))
            }
          }
        } catch {
          upstreamFailed = true
        }
      }
    }

    const results = dedupeResults(collected, query)
    if (!results.length && upstreamFailed) {
      return jsonResponse({ error: 'OpenStreetMap search is temporarily unavailable. Try again in a moment or enter WGS84 coordinates.' }, 502, origin, env)
    }

    return jsonResponse({
      query,
      attempted_queries: attempted,
      results: results.map(({ namedetails: _namedetails, ...item }) => item),
      source: 'OpenStreetMap Nominatim',
      source_url: 'https://nominatim.openstreetmap.org/',
      note: 'Search uses exact, accent-folded and structured locality/country fallbacks for small or transliterated place names.',
    }, 200, origin, env, 'public, max-age=3600')
  } catch {
    return jsonResponse({ error: 'OpenStreetMap search failed safely. Try again or enter WGS84 coordinates.' }, 502, origin, env)
  }
}
