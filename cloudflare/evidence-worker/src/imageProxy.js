import { isAllowedOrigin } from './index.js'

export const IMAGE_PROXY_PATH = '/research/image'
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const ALLOWED_HOSTS = new Set([
  'landsatlook.usgs.gov',
  'gibs.earthdata.nasa.gov',
  'sh.dataspace.copernicus.eu',
])
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

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

export function parseSatelliteImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('url is required.')
  let url
  try { url = new URL(value) } catch { throw new Error('url is invalid.') }
  if (url.protocol !== 'https:') throw new Error('Only HTTPS satellite images are allowed.')
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error('Satellite image host is not allowlisted.')
  return url
}

export async function handleSatelliteImageProxy(request, env = {}) {
  const origin = request.headers.get('Origin') ?? ''
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, env) })
  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed.' }, 405, origin, env)

  let upstreamUrl
  try {
    upstreamUrl = parseSatelliteImageUrl(new URL(request.url).searchParams.get('url'))
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid image URL.' }, 400, origin, env)
  }

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: { Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8' },
      cf: { cacheTtl: 86400, cacheEverything: true },
    })
    if (!upstream.ok) return jsonResponse({ error: `Satellite image upstream returned HTTP ${upstream.status}.` }, 502, origin, env)
    const type = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!ALLOWED_TYPES.has(type)) return jsonResponse({ error: `Unsupported satellite image type: ${type || 'unknown'}.` }, 415, origin, env)
    const length = Number(upstream.headers.get('content-length') ?? '0')
    if (Number.isFinite(length) && length > MAX_IMAGE_BYTES) return jsonResponse({ error: 'Satellite image exceeds proxy size limit.' }, 413, origin, env)

    const headers = new Headers({
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Terra-Source-Host': upstreamUrl.hostname,
      ...corsHeaders(origin, env),
    })
    return new Response(upstream.body, { status: 200, headers })
  } catch {
    return jsonResponse({ error: 'Satellite image proxy failed safely.' }, 502, origin, env)
  }
}
