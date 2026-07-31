export type HazardMarker = {
  id?: string
  category?: string
  longitude: number
  latitude: number
  color?: number
  radius?: number
}

const CATEGORY_LIMITS: Record<string, number> = {
  fire: 320,
  flood: 120,
  storm: 100,
  earthquake: 100,
  volcano: 60,
  landslide: 50,
  drought: 40,
  ice: 40,
  air_quality: 40,
  other: 30,
}

function categoryOf(marker: HazardMarker): string {
  const value = (marker.category || 'other').toLowerCase()
  return value in CATEGORY_LIMITS ? value : 'other'
}

export function isValidHazardMarker(marker: HazardMarker): boolean {
  return (
    Number.isFinite(marker.latitude) &&
    Number.isFinite(marker.longitude) &&
    marker.latitude >= -90 &&
    marker.latitude <= 90 &&
    marker.longitude >= -180 &&
    marker.longitude <= 180
  )
}

export function prepareGpuHazardMarkers(
  markers: HazardMarker[],
  totalLimit = 900,
): HazardMarker[] {
  const grouped = new Map<string, HazardMarker[]>()

  for (const marker of markers) {
    if (!isValidHazardMarker(marker)) continue
    const category = categoryOf(marker)
    const bucket = grouped.get(category) ?? []
    if (bucket.length < CATEGORY_LIMITS[category]) bucket.push(marker)
    grouped.set(category, bucket)
  }

  const categories = [...grouped.keys()].sort()
  const selected: HazardMarker[] = []
  let index = 0

  while (selected.length < totalLimit && categories.length > 0) {
    const category = categories[index % categories.length]
    const bucket = grouped.get(category)
    const marker = bucket?.shift()
    if (marker) selected.push(marker)
    if (!bucket || bucket.length === 0) {
      grouped.delete(category)
      categories.splice(index % categories.length, 1)
      if (categories.length === 0) break
      index %= categories.length
    } else {
      index += 1
    }
  }

  return selected
}
