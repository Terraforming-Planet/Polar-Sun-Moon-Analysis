export type ResearchSelectedPlace = {
  label: string
  latitude: number
  longitude: number
}

type Listener = (place: ResearchSelectedPlace | null) => void

let currentPlace: ResearchSelectedPlace | null = null
const listeners = new Set<Listener>()

export function publishResearchSelectedPlace(place: ResearchSelectedPlace | null) {
  currentPlace = place ? { ...place } : null
  for (const listener of listeners) listener(currentPlace ? { ...currentPlace } : null)
}

export function getResearchSelectedPlace() {
  return currentPlace ? { ...currentPlace } : null
}

export function subscribeResearchSelectedPlace(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
