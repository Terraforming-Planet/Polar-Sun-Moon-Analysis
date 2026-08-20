import type { AreaAnalysisResponse } from './lib/evidenceApi'
import type { ResearchAreaShape } from './researchGeometry'
import type { ResearchTemporalPreset } from './researchTime'

export type ResearchAnalysisKind = 'water-change' | 'hydrology' | 'terrain' | 'hazards' | 'multispectral'

export type ResearchAreaInput = {
  title: string
  latitude: number
  longitude: number
  radiusKm: number
  shape?: ResearchAreaShape
  startDate: string
  endDate: string
  temporalPreset?: ResearchTemporalPreset
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
    shape?: ResearchAreaShape
  }
  temporal_scope: {
    start_date: string
    end_date: string
    mode?: ResearchTemporalPreset
  }
  analyses: ResearchAnalysisKind[]
  evidence_policy: 'official-public-only'
  satellite_sources?: Array<'NASA_GIBS' | 'USGS_LANDSAT_STAC'>
  notes: string
}

export type ResearchFindingRecord = {
  schema: 'terra-research-finding/v1'
  id: string
  saved_at_utc: string
  title: string
  area: AreaAnalysisResponse['area']
  period: AreaAnalysisResponse['period']
  depth: AreaAnalysisResponse['depth']
  source_images: AreaAnalysisResponse['preview_images']
  landsat_catalog: {
    matched: number
    scenes: AreaAnalysisResponse['landsat_catalog']['scenes']
    full_catalog_url: string | null
  }
  conclusion: AreaAnalysisResponse['analysis']
  evidence_policy: string
  privacy_note: 'raw-chat-not-included'
}

export const LOCAL_RESEARCH_ARCHIVE_KEY = 'terra-ai-research-archive-v1'
export const LOCAL_RESEARCH_FINDINGS_KEY = 'terra-ai-research-findings-v1'

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

  const shape = input.shape ?? 'circle'
  const temporalPreset = input.temporalPreset ?? 'custom'
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
      shape,
    },
    temporal_scope: {
      start_date: input.startDate,
      end_date: input.endDate,
      mode: temporalPreset,
    },
    analyses: [...new Set(input.analyses)],
    evidence_policy: 'official-public-only',
    satellite_sources: ['NASA_GIBS', 'USGS_LANDSAT_STAC'],
    notes: input.notes?.trim() ?? '',
  }
}

export function buildResearchFindingRecord(analysis: AreaAnalysisResponse, now = new Date()): ResearchFindingRecord {
  const stamp = now.toISOString()
  const coordinateSuffix = `${analysis.area.latitude.toFixed(4)}_${analysis.area.longitude.toFixed(4)}`.replace(/-/g, 'm').replace(/\./g, 'p')
  return {
    schema: 'terra-research-finding/v1',
    id: `finding-${stamp.replace(/[-:.TZ]/g, '').slice(0, 14)}-${coordinateSuffix}`,
    saved_at_utc: stamp,
    title: analysis.area.place_name || `Badanie ${analysis.area.latitude.toFixed(4)}, ${analysis.area.longitude.toFixed(4)}`,
    area: { ...analysis.area },
    period: { ...analysis.period },
    depth: analysis.depth,
    source_images: analysis.preview_images.map(item => ({ ...item })),
    landsat_catalog: {
      matched: analysis.landsat_catalog.matched,
      scenes: analysis.landsat_catalog.scenes.map(item => ({ ...item })),
      full_catalog_url: analysis.landsat_catalog.full_catalog_url,
    },
    conclusion: {
      ...analysis.analysis,
      notable_features: [...analysis.analysis.notable_features],
      limitations: [...analysis.analysis.limitations],
      confidence: { ...analysis.analysis.confidence },
    },
    evidence_policy: analysis.evidence_policy,
    privacy_note: 'raw-chat-not-included',
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

export function parseLocalResearchFindings(raw: string | null): ResearchFindingRecord[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ResearchFindingRecord => {
      if (!item || typeof item !== 'object') return false
      const candidate = item as Partial<ResearchFindingRecord>
      return candidate.schema === 'terra-research-finding/v1'
        && candidate.privacy_note === 'raw-chat-not-included'
        && typeof candidate.id === 'string'
        && typeof candidate.title === 'string'
        && Array.isArray(candidate.source_images)
        && Boolean(candidate.conclusion)
    })
  } catch {
    return []
  }
}

export function loadLocalResearchArchive(): ResearchManifest[] {
  if (typeof window === 'undefined') return []
  return parseLocalResearchArchive(window.localStorage.getItem(LOCAL_RESEARCH_ARCHIVE_KEY))
}

export function loadLocalResearchFindings(): ResearchFindingRecord[] {
  if (typeof window === 'undefined') return []
  return parseLocalResearchFindings(window.localStorage.getItem(LOCAL_RESEARCH_FINDINGS_KEY))
}

export function saveResearchManifestLocally(manifest: ResearchManifest) {
  if (typeof window === 'undefined') return
  const current = loadLocalResearchArchive().filter(item => item.id !== manifest.id)
  window.localStorage.setItem(LOCAL_RESEARCH_ARCHIVE_KEY, JSON.stringify([manifest, ...current]))
}

export function saveResearchFindingLocally(finding: ResearchFindingRecord) {
  if (typeof window === 'undefined') return
  const current = loadLocalResearchFindings().filter(item => item.id !== finding.id)
  window.localStorage.setItem(LOCAL_RESEARCH_FINDINGS_KEY, JSON.stringify([finding, ...current].slice(0, 30)))
}

export function deleteResearchManifestLocally(id: string) {
  if (typeof window === 'undefined') return
  const next = loadLocalResearchArchive().filter(item => item.id !== id)
  window.localStorage.setItem(LOCAL_RESEARCH_ARCHIVE_KEY, JSON.stringify(next))
}

export function deleteResearchFindingLocally(id: string) {
  if (typeof window === 'undefined') return
  const next = loadLocalResearchFindings().filter(item => item.id !== id)
  window.localStorage.setItem(LOCAL_RESEARCH_FINDINGS_KEY, JSON.stringify(next))
}

function downloadJson(filename: string, value: unknown) {
  if (typeof window === 'undefined') return
  const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function downloadResearchManifest(manifest: ResearchManifest) {
  downloadJson(`${manifest.id}.json`, manifest)
}

export function downloadResearchFinding(finding: ResearchFindingRecord) {
  downloadJson(`${finding.id}.json`, finding)
}
