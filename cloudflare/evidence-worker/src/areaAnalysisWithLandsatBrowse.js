import { handleAreaAnalysisV2 } from './areaAnalysisV2.js'
import { buildUsGsLandsatUrl } from './landsatProxy.js'

const MAX_BROWSE_IMAGES = 6
const MAX_QUERY_FEATURES = 40

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

  const selected = []
  const seenDates = new Set()
  for (const image of images) {
    if (seenDates.has(image.date) && selected.length >= Math.ceil(limit / 2)) continue
    seenDates.add(image.date)
    selected.push(image)
    if (selected.length >= limit) break
  }
  return selected.sort((a, b) => a.date.localeCompare(b.date))
}

async function fetchHistoricalBrowseImages(body) {
  const latitude = Number(body?.latitude)
  const longitude = Number(body?.longitude)
  const radiusKm = Number(body?.radius_km ?? 25)
  const start = typeof body?.start_date === 'string' ? body.start_date : ''
  const end = typeof body?.end_date === 'string' ? body.end_date : ''
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radiusKm) || !start || !end) return []

  const bounds = researchBounds(latitude, longitude, radiusKm)
  const upstreamUrl = buildUsGsLandsatUrl({
    bbox: [bounds.west, bounds.south, bounds.east, bounds.north],
    start,
    end,
    limit: MAX_QUERY_FEATURES,
  })
  const response = await fetch(upstreamUrl, { headers: { Accept: 'application/geo+json,application/json' } })
  if (!response.ok) return []
  const payload = await response.json()
  return extractLandsatBrowseImages(payload)
}

function mergePreviewImages(existing, landsat) {
  const merged = []
  const seen = new Set()
  for (const image of [...landsat, ...(Array.isArray(existing) ? existing : [])]) {
    if (!image?.url || !image?.date || !image?.source) continue
    const key = `${image.date}|${image.url}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push({ date: image.date, source: image.source, url: image.url })
  }
  return merged.sort((a, b) => a.date.localeCompare(b.date)).slice(-16)
}

export async function handleAreaAnalysisWithLandsatBrowse(request, env = {}) {
  let body = null
  try {
    body = await request.clone().json()
  } catch {
    // The canonical V2 handler owns request validation and its error response.
  }

  const response = await handleAreaAnalysisV2(request, env)
  if (!response.ok || !body) return response

  let landsatBrowse = []
  try {
    landsatBrowse = await fetchHistoricalBrowseImages(body)
  } catch {
    landsatBrowse = []
  }
  if (!landsatBrowse.length) return response

  const payload = await response.json()
  payload.preview_images = mergePreviewImages(payload.preview_images, landsatBrowse)
  payload.landsat_browse_images = landsatBrowse.map(image => ({
    date: image.date,
    source: image.source,
    url: image.url,
    scene_id: image.scene_id,
    cloud_cover: image.cloud_cover,
  }))
  payload.evidence_policy = `${payload.evidence_policy}; official USGS Landsat Full Resolution Browse/thumbnail images when STAC exposes a browser-renderable asset`

  const headers = new Headers(response.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(payload), { status: response.status, headers })
}
