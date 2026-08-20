export type ParsedResearchLocation = {
  latitude: number
  longitude: number
}

function validLocation(latitude: number, longitude: number): ParsedResearchLocation | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}

export function parseResearchLocation(value: string): ParsedResearchLocation | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(value.trim())
    } catch {
      return value.trim()
    }
  })()

  const patterns = [
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:query|q)=(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
    /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/,
  ]

  for (const pattern of patterns) {
    const match = decoded.match(pattern)
    if (!match) continue
    const parsed = validLocation(Number(match[1]), Number(match[2]))
    if (parsed) return parsed
  }
  return null
}

export function googleMapsSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export function googleMapsCoordinateUrl(latitude: number, longitude: number) {
  return googleMapsSearchUrl(`${latitude.toFixed(6)},${longitude.toFixed(6)}`)
}
