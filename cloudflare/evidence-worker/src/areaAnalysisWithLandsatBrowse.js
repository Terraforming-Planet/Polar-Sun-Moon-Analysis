import { handleAreaAnalysisV2 } from './areaAnalysisV2.js'

// Compatibility helpers retained for the existing Worker tests and any downstream imports.
// The V2 handler now performs low-cloud Landsat browse selection before OpenAI analysis,
// so this wrapper must not append a second unfiltered gallery afterwards.
const MAX_BROWSE_IMAGES = 4

function imageAssetScore(key, asset) {
  const lowerKey = String(key ?? '').toLowerCase()
  const type = String(asset?.type ?? '').toLowerCase()
  const title = String(asset?.title ?? '').toLowerCase()
  const roles = Array.isArray(asset?.roles) ? asset.roles.map(role => String(role).toLowerCase()) : []
  let score = 0
  if (title.includes('full resolution browse')) score += 150
  if (lowerKey.includes('browse')) score += 130
  if (lowerKey.includes('preview')) score += 120
  if (lowerKey.includes('thumbnail')) score += 110
  if (roles.includes('overview')) score += 100
  if (roles.includes('thumbnail')) score += 90
  if (title.includes('browse')) score += 80
  if (type === 'image/jpeg' || type === 'image/jpg') score += 60
  if (type === 'image/png' || type === 'image/webp') score += 50
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
    if (seenDates.has(image.date)) continue
    seenDates.add(image.date)
    selected.push(image)
    if (selected.length >= limit) break
  }
  return selected.sort((a, b) => a.date.localeCompare(b.date))
}

export async function handleAreaAnalysisWithLandsatBrowse(request, env = {}) {
  return handleAreaAnalysisV2(request, env)
}
