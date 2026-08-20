export type ResearchAnalysisKind = 'water-change' | 'hydrology' | 'terrain' | 'hazards' | 'multispectral'

export type ResearchAreaInput = {
  title: string
  latitude: number
  longitude: number
  radiusKm: number
  startDate: string
  endDate: string
  analyses: ResearchAnalysisKind[]
  notes?: string
}

export type ResearchManifest = {
  schema: 'terra-research-manifest/v1'
  id: string
  created_at_utc: string
  status: 'draft'
  title: string
  area: {
    type: 'point-radius'
    latitude: number
    longitude: number
    radius_km: number
  }
  temporal_scope: {
    start_date: string
    end_date: string
  }
  analyses: ResearchAnalysisKind[]
  evidence_policy: 'official-public-only'
  notes: string
}

export const LOCAL_RESEARCH_ARCHIVE_KEY = 'terra-ai-research-archive-v1'

function finiteNumber(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} musi być liczbą.`)
  return value
}

export function buildResearchManifest(input: ResearchAreaInput, now = new Date()): ResearchManifest {
  const latitude = finiteNumber(input.latitude, 'Szerokość geograficzna')
  const longitude = finiteNumber(input.longitude, 'Długość geograficzna')
  const radiusKm = finiteNumber(input.radiusKm, 'Promień')
  if (latitude < -90 || latitude > 90) throw new Error('Szerokość geograficzna musi mieścić się w zakresie -90…90°.')
  if (longitude < -180 || longitude > 180) throw new Error('Długość geograficzna musi mieścić się w zakresie -180…180°.')
  if (radiusKm <= 0 || radiusKm > 2500) throw new Error('Promień badania musi być większy od 0 i nie większy niż 2500 km.')
  if (!input.title.trim()) throw new Error('Podaj nazwę badania.')
  if (!input.startDate || !input.endDate) throw new Error('Podaj początek i koniec zakresu dat.')
  if (input.startDate > input.endDate) throw new Error('Data początkowa nie może być późniejsza niż końcowa.')
  if (!input.analyses.length) throw new Error('Wybierz przynajmniej jeden rodzaj analizy.')

  const stamp = now.toISOString()
  const idSuffix = stamp.replace(/[-:.TZ]/g, '').slice(0, 14)
  const coordinateSuffix = `${latitude.toFixed(4)}_${longitude.toFixed(4)}`.replace(/-/g, 'm').replace(/\./g, 'p')

  return {
    schema: 'terra-research-manifest/v1',
    id: `research-${idSuffix}-${coordinateSuffix}`,
    created_at_utc: stamp,
    status: 'draft',
    title: input.title.trim(),
    area: {
      type: 'point-radius',
      latitude,
      longitude,
      radius_km: radiusKm,
    },
    temporal_scope: {
      start_date: input.startDate,
      end_date: input.endDate,
    },
    analyses: [...new Set(input.analyses)],
    evidence_policy: 'official-public-only',
    notes: input.notes?.trim() ?? '',
  }
}

export function parseLocalResearchArchive(raw: string | null): ResearchManifest[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ResearchManifest => {
      if (!item || typeof item !== 'object') return false
      const candidate = item as Partial<ResearchManifest>
      return candidate.schema === 'terra-research-manifest/v1'
        && typeof candidate.id === 'string'
        && typeof candidate.title === 'string'
        && candidate.status === 'draft'
        && candidate.evidence_policy === 'official-public-only'
    })
  } catch {
    return []
  }
}

export function loadLocalResearchArchive(): ResearchManifest[] {
  if (typeof window === 'undefined') return []
  return parseLocalResearchArchive(window.localStorage.getItem(LOCAL_RESEARCH_ARCHIVE_KEY))
}

export function saveResearchManifestLocally(manifest: ResearchManifest) {
  if (typeof window === 'undefined') return
  const current = loadLocalResearchArchive().filter(item => item.id !== manifest.id)
  window.localStorage.setItem(LOCAL_RESEARCH_ARCHIVE_KEY, JSON.stringify([manifest, ...current]))
}

export function deleteResearchManifestLocally(id: string) {
  if (typeof window === 'undefined') return
  const next = loadLocalResearchArchive().filter(item => item.id !== id)
  window.localStorage.setItem(LOCAL_RESEARCH_ARCHIVE_KEY, JSON.stringify(next))
}

export function downloadResearchManifest(manifest: ResearchManifest) {
  if (typeof window === 'undefined') return
  const blob = new Blob([JSON.stringify(manifest, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${manifest.id}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
