import { handleAreaAnalysisV2 } from './areaAnalysisV2.js'
import { buildUsGsLandsatUrl } from './landsatProxy.js'

const MAX_BROWSE_IMAGES = 60
const MAX_QUERY_FEATURES = 25
const MAX_YEARLY_QUERIES = 36
const CLEAR_CLOUD_THRESHOLD = 20
const GIBS_START = '2000-02-24'
const CANONICAL_FIELDS = new Set(['latitude', 'longitude', 'radius_km', 'start_date', 'end_date', 'depth', 'place_name'])
const SEASON_REFERENCE = {
  spring: '04-15',
  summer: '07-15',
  autumn: '10-15',
  winter: '01-15',
}
const SEASON_WINDOWS = {
  spring: ['03-01', '05-31'],
  summer: ['06-01', '08-31'],
  autumn: ['09-01', '11-30'],
  winter: ['01-01', '02-28'],
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
  if (lowerKey.includes('thumbnail')) score += 120
  if (lowerKey.includes('browse')) score += 110
  if (lowerKey.includes('preview')) score += 100
  if (roles.includes('thumbnail')) score += 90
  if (roles.includes('overview')) score += 80
  if (title.includes('full resolution browse')) score += 75
  if (title.includes('browse')) score += 65
  if (title.includes('thumbnail')) score += 60
  if (type === 'image/jpeg' || type === 'image/jpg') score += 55
  if (type === 'image/png' || type === 'image/webp') score += 45
  return score
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
      if (score > 0) candidates.push({ href, score })
    }
  }
  if (Array.isArray(item.links)) {
    for (const link of item.links) {
      const rel = String(link?.rel ?? '').toLowerCase()
      if (!['preview', 'thumbnail'].includes(rel)) continue
      const href = safeRasterImageUrl(link?.href)
      if (href) candidates.push({ href, score: rel === 'thumbnail' ? 95 : 85 })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  const selected = candidates[0]
  if (!selected) return null

  const platform = typeof item?.properties?.platform === 'string' ? item.properties.platform : 'Landsat'
  const cloudCover = typeof item?.properties?.['eo:cloud_cover'] === 'number' ? item.properties['eo:cloud_cover'] : null
  return {
    date,
    source: `USGS Landsat Collection 2 · ${platform} · Full Resolution Browse`,
    url: selected.href,
    original_url: selected.href,
    scene_id: id,
    cloud_cover: cloudCover,
    provenance_note: `Official USGS STAC browse/thumbnail for scene ${id}; intended for image selection and visual interpretation.`,
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

function seasonalYears(body) {
  const startYear = Number(body?.start_year)
  const endYear = Number(body?.end_year)
  const season = String(body?.season ?? '')
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || !SEASON_WINDOWS[season] || startYear > endYear) return []
  const count = Math.min(MAX_BROWSE_IMAGES, endYear - startYear + 1)
  return Array.from({ length: count }, (_, index) => startYear + index)
}

function selectedQueryYears(years) {
  if (years.length <= MAX_YEARLY_QUERIES) return years
  const selected = new Set([years[0], years[years.length - 1]])
  for (let index = 0; index < MAX_YEARLY_QUERIES; index += 1) {
    selected.add(years[Math.round(index * (years.length - 1) / Math.max(1, MAX_YEARLY_QUERIES - 1))])
  }
  return [...selected].sort((a, b) => a - b).slice(0, MAX_YEARLY_QUERIES)
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
  const response = await fetch(upstreamUrl, { headers: { Accept: 'application/geo+json,application/json' } })
  if (!response.ok) return []
  return extractLandsatBrowseImages(await response.json(), MAX_QUERY_FEATURES)
}

async function fetchSeasonalBrowseImages(body) {
  const years = seasonalYears(body)
  if (!years.length) return { images: [], years: [], missingYears: [] }
  const cloudMode = body?.cloud_mode === 'any' ? 'any' : 'clear'
  const queryYears = new Set(selectedQueryYears(years))
  const selected = await Promise.all(years.map(async year => {
    if (!queryYears.has(year)) return null
    try {
      const images = await fetchYearBrowseImages(body, year)
      const chosen = chooseYearBrowseImage(images, year, String(body.season), cloudMode)
      if (!chosen) return null
      return {
        ...chosen,
        year,
        cloud_preference_met: Number.isFinite(chosen.cloud_cover) ? chosen.cloud_cover <= CLEAR_CLOUD_THRESHOLD : false,
      }
    } catch {
      return null
    }
  }))
  const images = selected.filter(Boolean)
  const foundYears = new Set(images.map(image => image.year))
  return { images, years, missingYears: years.filter(year => !foundYears.has(year)) }
}

async function fetchBulkBrowseImages(body) {
  const latitude = Number(body?.latitude)
  const longitude = Number(body?.longitude)
  const radiusKm = Number(body?.radius_km ?? 25)
  const start = typeof body?.start_date === 'string' ? body.start_date : ''
  const end = typeof body?.end_date === 'string' ? body.end_date : ''
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radiusKm) || !start || !end) return []
  const bounds = researchBounds(latitude, longitude, radiusKm)
  const upstreamUrl = buildUsGsLandsatUrl({ bbox: [bounds.west, bounds.south, bounds.east, bounds.north], start, end, limit: MAX_QUERY_FEATURES })
  const response = await fetch(upstreamUrl, { headers: { Accept: 'application/geo+json,application/json' } })
  if (!response.ok) return []
  return extractLandsatBrowseImages(await response.json(), MAX_BROWSE_IMAGES)
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
  const source = recentViirs ? 'NASA GIBS · Suomi NPP VIIRS True Color · seasonal fallback' : 'NASA GIBS · Terra MODIS True Color · seasonal fallback'
  const params = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: layer, STYLES: '',
    FORMAT: 'image/jpeg', TRANSPARENT: 'FALSE', SRS: 'EPSG:4326',
    BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    WIDTH: '1400', HEIGHT: '1400', TIME: date,
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
    provenance_note: 'NASA GIBS fallback date for a year where a browser-renderable Landsat browse image was not returned. GIBS does not provide the same per-scene cloud-cover metadata.',
  }
}

function proxiedImage(request, image) {
  const workerOrigin = new URL(request.url).origin
  const originalUrl = image.original_url ?? image.url
  const params = new URLSearchParams({ url: originalUrl })
  return { ...image, original_url: originalUrl, url: `${workerOrigin}/research/image?${params.toString()}` }
}

function buildSeasonalGallery(request, body, seasonalResult) {
  const byYear = new Map(seasonalResult.images.map(image => [image.year, image]))
  const gallery = []
  const missingYears = []
  for (const year of seasonalResult.years) {
    const selected = byYear.get(year) ?? nasaFallbackImage(body, year)
    if (!selected) {
      missingYears.push(year)
      continue
    }
    gallery.push(proxiedImage(request, selected))
  }
  return { gallery, missingYears }
}

function mergePreviewImages(request, existing, landsat) {
  const merged = []
  const seen = new Set()
  for (const image of [...landsat, ...(Array.isArray(existing) ? existing : [])]) {
    if (!image?.url || !image?.date || !image?.source) continue
    const originalUrl = image.original_url ?? image.url
    const key = `${image.date}|${originalUrl}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(proxiedImage(request, { ...image, original_url: originalUrl }))
  }
  return merged.sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_BROWSE_IMAGES)
}

function canonicalBody(body) {
  return Object.fromEntries(Object.entries(body ?? {}).filter(([key]) => CANONICAL_FIELDS.has(key)))
}

function requestForCanonicalHandler(request, body) {
  const headers = new Headers(request.headers)
  headers.set('Content-Type', 'application/json')
  return new Request(request.url, { method: request.method, headers, body: JSON.stringify(canonicalBody(body)) })
}

export async function handleAreaAnalysisWithLandsatBrowse(request, env = {}) {
  let body = null
  try {
    body = await request.clone().json()
  } catch {
    // The canonical V2 handler owns validation if the body cannot be parsed.
  }

  if (!body) return handleAreaAnalysisV2(request, env)
  const years = seasonalYears(body)
  const browsePromise = years.length ? fetchSeasonalBrowseImages(body) : fetchBulkBrowseImages(body)
  const response = await handleAreaAnalysisV2(requestForCanonicalHandler(request, body), env)
  if (!response.ok) return response

  let browseResult
  try {
    browseResult = await browsePromise
  } catch {
    browseResult = years.length ? { images: [], years, missingYears: years } : []
  }

  const payload = await response.json()
  if (years.length) {
    const seasonalResult = Array.isArray(browseResult) ? { images: browseResult, years, missingYears: [] } : browseResult
    const { gallery, missingYears } = buildSeasonalGallery(request, body, seasonalResult)
    if (gallery.length) payload.preview_images = gallery.map(image => ({
      date: image.date,
      source: image.source,
      url: image.url,
      original_url: image.original_url,
      scene_id: image.scene_id,
      cloud_cover: image.cloud_cover,
      cloud_preference_met: image.cloud_preference_met,
    }))
    payload.gallery_policy = {
      mode: 'one-image-per-selected-year',
      season: body.season,
      start_year: Number(body.start_year),
      end_year: Number(body.end_year),
      requested_year_count: years.length,
      returned_image_count: payload.preview_images.length,
      cloud_mode: body.cloud_mode === 'any' ? 'any' : 'clear',
      clear_cloud_threshold_percent: CLEAR_CLOUD_THRESHOLD,
      missing_years: missingYears,
      note: 'Clear mode chooses the lowest-cloud browser-renderable Landsat scene found for each queried year. If none is returned and NASA GIBS covers that year, a dated GIBS fallback is used and is labelled as not cloud-screened.',
    }
    payload.landsat_browse_images = seasonalResult.images.map(image => ({
      year: image.year,
      date: image.date,
      source: image.source,
      url: proxiedImage(request, image).url,
      original_url: image.original_url,
      scene_id: image.scene_id,
      cloud_cover: image.cloud_cover,
      cloud_preference_met: image.cloud_preference_met,
    }))
  } else {
    const landsat = Array.isArray(browseResult) ? browseResult : browseResult.images
    if (landsat.length) {
      payload.preview_images = mergePreviewImages(request, payload.preview_images, landsat).map(image => ({
        date: image.date,
        source: image.source,
        url: image.url,
        original_url: image.original_url,
        scene_id: image.scene_id,
        cloud_cover: image.cloud_cover,
      }))
      payload.landsat_browse_images = landsat.map(image => ({
        date: image.date,
        source: image.source,
        url: proxiedImage(request, image).url,
        original_url: image.original_url,
        scene_id: image.scene_id,
        cloud_cover: image.cloud_cover,
      }))
    }
  }

  payload.evidence_policy = `${payload.evidence_policy}; yearly low-cloud USGS Landsat browse selection when seasonal mode is requested; allowlisted Worker image proxy for browser reliability`
  const headers = new Headers(response.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(payload), { status: response.status, headers })
}
