import { handleAreaAnalysisV2 } from './areaAnalysisV2.js'
import { isAllowedOrigin } from './index.js'
import { buildUsGsLandsatUrl } from './landsatProxy.js'

export const YEARLY_GALLERY_PATH = '/research/yearly-gallery'

const MAX_BROWSE_IMAGES = 60
const MAX_QUERY_FEATURES = 25
const MAX_GALLERY_BATCH_YEARS = 6
const CLEAR_CLOUD_THRESHOLD = 20
const GIBS_START = '2000-02-24'
const HLS_L30_START = '2013-03-22'
const LANDSAT_START_YEAR = 1972
const UPSTREAM_TIMEOUT_MS = 6500
const BROWSE_PREFLIGHT_TIMEOUT_MS = 4000
const BROWSER_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const CANONICAL_FIELDS = new Set(['latitude', 'longitude', 'radius_km', 'start_date', 'end_date', 'depth', 'place_name', 'season'])
const GALLERY_FIELDS = new Set(['latitude', 'longitude', 'radius_km', 'years', 'season', 'cloud_mode'])
const SEASON_REFERENCE = {
  all: '07-15',
  spring: '04-15',
  summer: '07-15',
  autumn: '10-15',
  winter: '01-15',
}
const SEASON_WINDOWS = {
  all: ['01-01', '12-31'],
  spring: ['03-01', '05-31'],
  summer: ['06-01', '08-31'],
  autumn: ['09-01', '11-30'],
  winter: ['01-01', '02-28'],
}
const WELD_MONTHLY_YEARS = new Set([1984, 1985, 1986, 1989, 1990, 1991, 1999, 2000, 2001])

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

function imageAssetScore(key, asset) {
  const lowerKey = String(key ?? '').toLowerCase()
  const type = String(asset?.type ?? '').toLowerCase()
  const title = String(asset?.title ?? '').toLowerCase()
  const roles = Array.isArray(asset?.roles) ? asset.roles.map(role => String(role).toLowerCase()) : []
  let score = 0
  if (title.includes('full resolution browse')) score += 320
  if (lowerKey.includes('browse')) score += 220
  if (title.includes('browse')) score += 180
  if (roles.includes('overview')) score += 140
  if (lowerKey.includes('preview')) score += 110
  if (lowerKey.includes('thumbnail')) score += 45
  if (roles.includes('thumbnail')) score += 35
  if (title.includes('thumbnail')) score += 25
  if (type === 'image/jpeg' || type === 'image/jpg') score += 55
  if (type === 'image/png' || type === 'image/webp') score += 45
  return score
}

function imageAssetKind(key, asset) {
  const lowerKey = String(key ?? '').toLowerCase()
  const title = String(asset?.title ?? '').toLowerCase()
  const roles = Array.isArray(asset?.roles) ? asset.roles.map(role => String(role).toLowerCase()) : []
  if (lowerKey.includes('thumbnail') || title.includes('thumbnail') || roles.includes('thumbnail')) return 'CATALOGUE_THUMBNAIL'
  if (title.includes('full resolution browse') || lowerKey.includes('browse') || title.includes('browse') || roles.includes('overview')) return 'FULL_RESOLUTION_BROWSE'
  return 'CATALOGUE_THUMBNAIL'
}

function safeRasterImageUrl(value) {
  if (typeof value !== 'string') return null
  const url = value.trim()
  if (!url.startsWith('https://')) return null
  if (/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)) return url
  return null
}

export function extractLandsatBrowseImage(item) {
  if (!item || typeof item !== 'object') return null
  const date = typeof item?.properties?.datetime === 'string' ? item.properties.datetime.slice(0, 10) : null
  const id = String(item?.id ?? '').slice(0, 180)
  if (!date || !id) return null

  const candidates = []
  if (item.assets && typeof item.assets === 'object') {
    for (const [key, asset] of Object.entries(item.assets)) {
      const href = safeRasterImageUrl(asset?.href)
      if (!href) continue
      const score = imageAssetScore(key, asset)
      if (score > 0) candidates.push({ href, score, asset_kind: imageAssetKind(key, asset) })
    }
  }
  if (Array.isArray(item.links)) {
    for (const link of item.links) {
      const rel = String(link?.rel ?? '').toLowerCase()
      if (!['preview', 'thumbnail'].includes(rel)) continue
      const href = safeRasterImageUrl(link?.href)
      if (href) candidates.push({ href, score: rel === 'thumbnail' ? 40 : 100, asset_kind: 'CATALOGUE_THUMBNAIL' })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  const selected = candidates[0]
  if (!selected) return null

  const platform = typeof item?.properties?.platform === 'string' ? item.properties.platform : 'Landsat'
  const cloudCover = typeof item?.properties?.['eo:cloud_cover'] === 'number' ? item.properties['eo:cloud_cover'] : null
  const fullBrowse = selected.asset_kind === 'FULL_RESOLUTION_BROWSE'
  return {
    date,
    platform,
    source: `USGS Landsat Collection 2 · ${platform} · ${fullBrowse ? 'Full Resolution Browse' : 'Catalogue Thumbnail'}`,
    url: selected.href,
    original_url: selected.href,
    scene_id: id,
    cloud_cover: cloudCover,
    asset_kind: selected.asset_kind,
    render_kind: 'CATALOGUE_BROWSE',
    aoi_cropped: false,
    analysis_eligible: false,
    quality_note: fullBrowse
      ? 'Official full-scene browse. It is not an AOI crop and is catalogue context only.'
      : 'Official catalogue thumbnail; it may be only 300×300 and is not suitable for small-object interpretation.',
    provenance_note: `Official USGS STAC ${fullBrowse ? 'full-scene browse' : 'catalogue thumbnail'} for scene ${id}; catalogue context only, not an AOI analysis input.`,
  }
}

export function extractLandsatBrowseImages(payload, limit = MAX_BROWSE_IMAGES) {
  const features = Array.isArray(payload?.features) ? payload.features : []
  const images = features.map(extractLandsatBrowseImage).filter(Boolean)
  images.sort((a, b) => {
    const aCloud = Number.isFinite(a.cloud_cover) ? a.cloud_cover : 101
    const bCloud = Number.isFinite(b.cloud_cover) ? b.cloud_cover : 101
    return aCloud - bCloud || a.date.localeCompare(b.date)
  })
  return images.slice(0, limit)
}

function dateDistanceDays(date, reference) {
  return Math.abs(Date.parse(`${date}T12:00:00Z`) - Date.parse(`${reference}T12:00:00Z`)) / 86_400_000
}

export function chooseYearBrowseImage(images, year, season, cloudMode = 'clear') {
  const reference = `${year}-${SEASON_REFERENCE[season] ?? '07-15'}`
  const candidates = images.filter(image => Number(image.date.slice(0, 4)) === year)
  if (!candidates.length) return null
  return [...candidates].sort((a, b) => {
    const aCloud = Number.isFinite(a.cloud_cover) ? a.cloud_cover : 101
    const bCloud = Number.isFinite(b.cloud_cover) ? b.cloud_cover : 101
    const aDistance = dateDistanceDays(a.date, reference)
    const bDistance = dateDistanceDays(b.date, reference)
    if (cloudMode === 'any') return aDistance - bDistance || aCloud - bCloud
    return aCloud - bCloud || aDistance - bDistance
  })[0]
}

async function fetchWithTimeout(url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchYearBrowseImages(body, year) {
  const latitude = Number(body?.latitude)
  const longitude = Number(body?.longitude)
  const radiusKm = Number(body?.radius_km ?? 25)
  const season = String(body?.season ?? '')
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radiusKm) || !SEASON_WINDOWS[season]) return []
  const [startSuffix, endSuffix] = SEASON_WINDOWS[season]
  const bounds = researchBounds(latitude, longitude, radiusKm)
  const upstreamUrl = buildUsGsLandsatUrl({
    bbox: [bounds.west, bounds.south, bounds.east, bounds.north],
    start: `${year}-${startSuffix}`,
    end: `${year}-${endSuffix}`,
    limit: MAX_QUERY_FEATURES,
  })
  const response = await fetchWithTimeout(upstreamUrl, { headers: { Accept: 'application/geo+json,application/json' } })
  if (!response.ok) return []
  return extractLandsatBrowseImages(await response.json(), MAX_QUERY_FEATURES)
}

async function preflightBrowseImage(image) {
  if (!image?.url) return false
  try {
    const response = await fetchWithTimeout(image.url, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8' },
    }, BROWSE_PREFLIGHT_TIMEOUT_MS)
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    return response.ok && BROWSER_IMAGE_TYPES.has(type)
  } catch {
    return false
  }
}

function nasaFallbackImage(body, year) {
  if (year < Number(GIBS_START.slice(0, 4))) return null
  const season = String(body?.season ?? '')
  const reference = SEASON_REFERENCE[season]
  if (!reference) return null
  const date = `${year}-${reference}`
  if (date < GIBS_START) return null
  const latitude = Number(body?.latitude)
  const longitude = Number(body?.longitude)
  const radiusKm = Number(body?.radius_km ?? 25)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radiusKm)) return null
  const bounds = researchBounds(latitude, longitude, Math.max(radiusKm, 2))
  const recentViirs = date >= '2012-01-19'
  const layer = recentViirs ? 'VIIRS_SNPP_CorrectedReflectance_TrueColor' : 'MODIS_Terra_CorrectedReflectance_TrueColor'
  const source = recentViirs ? 'NASA GIBS · Suomi NPP VIIRS True Color · yearly fallback' : 'NASA GIBS · Terra MODIS True Color · yearly fallback'
  const params = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: layer, STYLES: '',
    FORMAT: 'image/jpeg', TRANSPARENT: 'FALSE', SRS: 'EPSG:4326',
    BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    WIDTH: '1100', HEIGHT: '1100', TIME: date,
  })
  const url = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`
  return {
    year,
    date,
    source,
    url,
    original_url: url,
    cloud_cover: null,
    cloud_preference_met: false,
    asset_kind: 'NASA_GIBS_AOI_FALLBACK',
    render_kind: 'NATURAL_COLOR_RGB',
    aoi_cropped: true,
    analysis_eligible: false,
    quality_note: '1100×1100 AOI rendering for human catalogue comparison; it is not claimed as a model input.',
    provenance_note: 'NASA GIBS fallback for a year where a browser-renderable Landsat browse image was not returned. GIBS does not provide the same per-scene cloud-cover metadata.',
  }
}

function gibsGalleryUrl(body, layer, date) {
  const latitude = Number(body?.latitude)
  const longitude = Number(body?.longitude)
  const radiusKm = Number(body?.radius_km ?? 25)
  const bounds = researchBounds(latitude, longitude, Math.max(radiusKm, 2))
  const params = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: layer, STYLES: '',
    FORMAT: 'image/jpeg', TRANSPARENT: 'FALSE', SRS: 'EPSG:4326',
    BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    WIDTH: '1100', HEIGHT: '1100', TIME: date,
  })
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`
}

function weldGalleryImage(body, year) {
  if (!WELD_MONTHLY_YEARS.has(year)) return null
  const reference = SEASON_REFERENCE[String(body?.season ?? '')]
  if (!reference) return null
  const date = `${year}-${reference.slice(0, 2)}-01`
  const url = gibsGalleryUrl(body, 'Landsat_WELD_CorrectedReflectance_TrueColor_Global_Monthly', date)
  return {
    year,
    date,
    source: 'NASA GIBS · Landsat WELD monthly true colour · 30 m',
    url,
    original_url: url,
    scene_id: null,
    cloud_cover: null,
    cloud_preference_met: false,
    asset_kind: 'NASA_WELD_30M_AOI',
    render_kind: 'NATURAL_COLOR_RGB',
    aoi_cropped: true,
    analysis_eligible: false,
    quality_note: 'Official 30 m monthly AOI composite for human comparison. It is not one exact acquisition and was not automatically inspected by the model.',
    provenance_note: `NASA GIBS Global WELD monthly 30 m AOI rendering for ${date.slice(0, 7)}.`,
  }
}

function hlsL30GalleryImage(body, chosen) {
  if (!chosen || chosen.date < HLS_L30_START || !/^LANDSAT_[89]$/.test(chosen.platform ?? '')) return null
  const url = gibsGalleryUrl(body, 'HLS_L30_Nadir_BRDF_Adjusted_Reflectance', chosen.date)
  return {
    year: Number(chosen.date.slice(0, 4)),
    date: chosen.date,
    source: `NASA HLS L30 · ${chosen.platform} · 30 m NBAR RGB`,
    url,
    original_url: url,
    scene_id: chosen.scene_id,
    cloud_cover: chosen.cloud_cover,
    cloud_preference_met: Number.isFinite(chosen.cloud_cover) ? chosen.cloud_cover <= CLEAR_CLOUD_THRESHOLD : false,
    asset_kind: 'NASA_HLS_L30_AOI',
    render_kind: 'NATURAL_COLOR_RGB',
    aoi_cropped: true,
    analysis_eligible: false,
    quality_note: 'Official 30 m HLS AOI rendering selected from Landsat catalogue metadata. This gallery image remains separate from model-inspected inputs.',
    provenance_note: `NASA GIBS HLS L30 rendering for USGS scene metadata ${chosen.scene_id} on ${chosen.date}.`,
  }
}

function proxiedImage(request, image) {
  const workerOrigin = new URL(request.url).origin
  const originalUrl = image.original_url ?? image.url
  const params = new URLSearchParams({ url: originalUrl })
  return { ...image, original_url: originalUrl, url: `${workerOrigin}/research/image?${params.toString()}` }
}

function canonicalBody(body) {
  return Object.fromEntries(Object.entries(body ?? {}).filter(([key]) => CANONICAL_FIELDS.has(key)))
}

function requestForCanonicalHandler(request, body) {
  const headers = new Headers(request.headers)
  headers.set('Content-Type', 'application/json')
  return new Request(request.url, { method: request.method, headers, body: JSON.stringify(canonicalBody(body)) })
}

function seasonalYearsFromLegacyBody(body) {
  const startYear = Number(body?.start_year)
  const endYear = Number(body?.end_year)
  const season = String(body?.season ?? '')
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || !SEASON_WINDOWS[season] || startYear > endYear) return []
  const count = Math.min(MAX_BROWSE_IMAGES, endYear - startYear + 1)
  return Array.from({ length: count }, (_, index) => startYear + index)
}

export async function handleAreaAnalysisWithLandsatBrowse(request, env = {}) {
  let body = null
  try {
    body = await request.clone().json()
  } catch {
    // Canonical handler owns malformed-request validation.
  }
  if (!body) return handleAreaAnalysisV2(request, env)

  const legacySeasonalYears = seasonalYearsFromLegacyBody(body)
  const response = await handleAreaAnalysisV2(requestForCanonicalHandler(request, body), env)
  if (!response.ok) return response

  const payload = await response.json()
  payload.gallery_policy = {
    ...(payload.gallery_policy ?? {}),
    historical_gallery_mode: 'progressive-separate-endpoint',
    requested_year_count: legacySeasonalYears.length || null,
    historical_gallery_note: 'Core OpenAI terrain analysis returns without waiting for annual catalogue requests. The browser loads one official image slot per requested year from /research/yearly-gallery in bounded batches.',
  }
  payload.evidence_policy = `${payload.evidence_policy}; annual historical gallery loads separately so long year ranges do not block the core AI analysis`
  const headers = new Headers(response.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(payload), { status: response.status, headers })
}

function parseGalleryPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Request body must be one JSON object.')
  for (const key of Object.keys(value)) if (!GALLERY_FIELDS.has(key)) throw new Error(`Unexpected field: ${key}.`)

  const latitude = Number(value.latitude)
  const longitude = Number(value.longitude)
  const radiusKm = Number(value.radius_km ?? 25)
  const season = String(value.season ?? '')
  const cloudMode = value.cloud_mode === 'any' ? 'any' : 'clear'
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('latitude is outside WGS84 bounds.')
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('longitude is outside WGS84 bounds.')
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 500) throw new Error('radius_km must be from 1 to 500.')
  if (!SEASON_WINDOWS[season]) throw new Error('season must be all, spring, summer, autumn or winter.')
  if (!Array.isArray(value.years) || value.years.length < 1 || value.years.length > MAX_GALLERY_BATCH_YEARS) {
    throw new Error(`years must contain 1 to ${MAX_GALLERY_BATCH_YEARS} years.`)
  }
  const currentYear = new Date().getUTCFullYear()
  const years = [...new Set(value.years.map(Number))]
  if (years.some(year => !Number.isInteger(year) || year < LANDSAT_START_YEAR || year > currentYear)) {
    throw new Error(`years must be integers from ${LANDSAT_START_YEAR} to ${currentYear}.`)
  }
  return { latitude, longitude, radius_km: radiusKm, season, cloud_mode: cloudMode, years }
}

async function gallerySlot(request, body, year) {
  try {
    const weld = weldGalleryImage(body, year)
    if (weld) {
      const proxiedWeld = proxiedImage(request, weld)
      return {
        year,
        status: 'image',
        image: {
          year,
          date: proxiedWeld.date,
          source: proxiedWeld.source,
          url: proxiedWeld.url,
          original_url: proxiedWeld.original_url,
          scene_id: null,
          cloud_cover: null,
          cloud_preference_met: false,
          asset_kind: proxiedWeld.asset_kind,
          render_kind: proxiedWeld.render_kind,
          aoi_cropped: true,
          analysis_eligible: false,
          quality_note: proxiedWeld.quality_note,
        },
      }
    }
    const images = await fetchYearBrowseImages(body, year)
    const hlsCandidate = chooseYearBrowseImage(images.filter(image => /^LANDSAT_[89]$/.test(image.platform ?? '')), year, body.season, body.cloud_mode)
    const hls = hlsL30GalleryImage(body, hlsCandidate)
    const chosen = chooseYearBrowseImage(images, year, body.season, body.cloud_mode)
    const chosenUsable = !hls && chosen ? await preflightBrowseImage(chosen) : false
    const selected = hls ?? (chosenUsable ? chosen : nasaFallbackImage(body, year))
    if (!selected) {
      return { year, status: 'missing', reason: chosen
        ? 'The official Landsat browse asset redirected or did not return an image, and no NASA GIBS fallback is available for this year.'
        : 'No browser-renderable Landsat image and no NASA GIBS fallback are available for this year.' }
    }
    const proxied = proxiedImage(request, {
      ...selected,
      year,
      cloud_preference_met: Number.isFinite(selected.cloud_cover) ? selected.cloud_cover <= CLEAR_CLOUD_THRESHOLD : false,
    })
    const slot = {
      year,
      status: 'image',
      image: {
        year,
        date: proxied.date,
        source: proxied.source,
        url: proxied.url,
        original_url: proxied.original_url,
        scene_id: proxied.scene_id ?? null,
        cloud_cover: proxied.cloud_cover ?? null,
        cloud_preference_met: proxied.cloud_preference_met,
        asset_kind: proxied.asset_kind,
        render_kind: proxied.render_kind,
        aoi_cropped: proxied.aoi_cropped,
        analysis_eligible: proxied.analysis_eligible,
        quality_note: proxied.quality_note,
      },
    }
    if (!hls && chosen && !chosenUsable) slot.warning = 'The Landsat browse asset was not directly renderable; NASA GIBS fallback used.'
    return slot
  } catch (error) {
    const fallback = nasaFallbackImage(body, year)
    if (fallback) {
      const proxied = proxiedImage(request, fallback)
      return {
        year,
        status: 'image',
        image: {
          year,
          date: proxied.date,
          source: proxied.source,
          url: proxied.url,
          original_url: proxied.original_url,
          scene_id: null,
          cloud_cover: null,
          cloud_preference_met: false,
          asset_kind: proxied.asset_kind,
          render_kind: proxied.render_kind,
          aoi_cropped: proxied.aoi_cropped,
          analysis_eligible: proxied.analysis_eligible,
          quality_note: proxied.quality_note,
        },
        warning: error instanceof Error && error.name === 'AbortError' ? 'USGS timeout; NASA GIBS fallback used.' : 'USGS query failed; NASA GIBS fallback used.',
      }
    }
    return { year, status: 'missing', reason: error instanceof Error && error.name === 'AbortError' ? 'USGS timeout and no NASA GIBS fallback.' : 'USGS query failed and no NASA GIBS fallback.' }
  }
}

export async function handleYearlyGallery(request, env = {}) {
  const origin = request.headers.get('Origin') ?? ''
  if (request.method === 'OPTIONS') {
    if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)
    return new Response(null, { status: 204, headers: corsHeaders(origin, env) })
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin, env)
  if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env)
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, origin, env)

  let body
  try {
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > 4096) throw new Error('Request is too large.')
    body = parseGalleryPayload(JSON.parse(text))
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid yearly gallery request.' }, 400, origin, env)
  }

  const slots = await Promise.all(body.years.map(year => gallerySlot(request, body, year)))
  return jsonResponse({
    service: 'terra-observation-yearly-gallery-v1',
    generated_at_utc: new Date().toISOString(),
    season: body.season,
    cloud_mode: body.cloud_mode,
    requested_years: body.years,
    returned_slots: slots.length,
    slots,
    policy: 'One slot per requested year. Prefer official NASA HLS/WELD 30 m AOI renderings when the supported dated source exists; otherwise use a verified USGS browse or clearly-labelled NASA GIBS coarse fallback. Missing years remain explicit.',
  }, 200, origin, env, 'public, max-age=300')
}
