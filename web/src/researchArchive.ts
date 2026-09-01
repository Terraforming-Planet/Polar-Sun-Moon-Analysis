import type { AreaAnalysisResponse } from './lib/evidenceApi'
import type { ResearchAreaShape } from './researchGeometry'
import type { ResearchTemporalPreset } from './researchTime'
import { readSatelliteTimeSelection, requestedSatelliteDateTimeUtc } from './satelliteTimeSelection'

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
    requested_datetime_utc?: string | null
    satellite_time_preset?: string
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

export type ResearchAssistantAnswerRecord = {
  schema: 'terra-assistant-answer/v1'
  id: string
  saved_at_utc: string
  place: {
    label: string
    latitude: number
    longitude: number
  } | null
  model: string
  answer: string
  privacy_note: 'user-prompt-not-stored'
}

export const LOCAL_RESEARCH_ARCHIVE_KEY = 'terra-ai-research-archive-v1'
export const LOCAL_RESEARCH_FINDINGS_KEY = 'terra-ai-research-findings-v1'
export const LOCAL_ASSISTANT_ANSWERS_KEY = 'terra-ai-assistant-answers-v1'

const ASSISTANT_ANSWER_KEYS = new Set(['schema', 'id', 'saved_at_utc', 'place', 'model', 'answer', 'privacy_note'])
const ASSISTANT_PLACE_KEYS = new Set(['label', 'latitude', 'longitude'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isFiniteNumber(value: unknown, minimum = Number.NEGATIVE_INFINITY, maximum = Number.POSITIVE_INFINITY) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

function isStringArray(value: unknown) {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isDateText(value: unknown) {
  return typeof value === 'string' && value.length >= 10 && Number.isFinite(Date.parse(value))
}

function isResearchArea(value: unknown) {
  if (!isRecord(value)) return false
  return (value.place_name === null || typeof value.place_name === 'string')
    && isFiniteNumber(value.latitude, -90, 90)
    && isFiniteNumber(value.longitude, -180, 180)
    && isFiniteNumber(value.radius_km, 0, 2500)
}

function isPeriod(value: unknown) {
  return isRecord(value)
    && isDateText(value.start_date)
    && isDateText(value.end_date)
    && String(value.start_date) <= String(value.end_date)
}

function isAnalysisConclusion(value: unknown) {
  if (!isRecord(value) || !isRecord(value.confidence)) return false
  const hydrology = value.hydrology_screening
  const hydrologyValid = hydrology === undefined || (
    isRecord(hydrology)
    && ['VISIBLE_WATER_REDUCTION_CANDIDATE', 'VISIBLE_WATER_INCREASE_CANDIDATE', 'NO_VISIBLE_CHANGE_ESTABLISHED', 'INSUFFICIENT_EVIDENCE'].includes(String(hydrology.water_change_state))
    && typeof hydrology.temporal_basis === 'string'
    && ['VISIBLE_CANDIDATES', 'NO_CANDIDATE_VISIBLE', 'INSUFFICIENT_EVIDENCE'].includes(String(hydrology.inflow_outflow_status))
    && isStringArray(hydrology.candidate_features)
    && typeof hydrology.main_and_tributary_context === 'string'
    && isStringArray(hydrology.required_checks)
    && hydrology.cause_status === 'NOT_ESTABLISHED_FROM_SUPPLIED_EVIDENCE'
  )
  return hydrologyValid
    && typeof value.headline === 'string'
    && typeof value.what_is_visible === 'string'
    && typeof value.change_over_time === 'string'
    && typeof value.water_assessment === 'string'
    && isStringArray(value.notable_features)
    && ['low', 'medium', 'high'].includes(String(value.confidence.level))
    && typeof value.confidence.reason === 'string'
    && isStringArray(value.limitations)
    && typeof value.recommended_next_step === 'string'
}

function isSourceImage(value: unknown) {
  return isRecord(value)
    && isDateText(value.date)
    && typeof value.source === 'string'
    && typeof value.url === 'string'
    && /^https:\/\//.test(value.url)
}

function isLandsatScene(value: unknown) {
  return isRecord(value)
    && typeof value.id === 'string'
    && (value.date === null || isDateText(value.date))
    && (value.platform === null || typeof value.platform === 'string')
    && (value.cloud_cover === null || isFiniteNumber(value.cloud_cover, 0, 100))
}

function isLandsatArchive(value: unknown) {
  return isRecord(value)
    && isFiniteNumber(value.matched, 0)
    && Array.isArray(value.scenes)
    && value.scenes.every(isLandsatScene)
    && (value.full_catalog_url === null || (typeof value.full_catalog_url === 'string' && /^https:\/\//.test(value.full_catalog_url)))
}

function safeLocalStorageRead(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalStorageWrite(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    throw new Error('Local research archive is unavailable, blocked or full.')
  }
}

function finiteNumber(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a number.`)
  return value
}

export function buildResearchManifest(input: ResearchAreaInput, now = new Date()): ResearchManifest {
  const latitude = finiteNumber(input.latitude, 'Latitude')
  const longitude = finiteNumber(input.longitude, 'Longitude')
  const radiusKm = finiteNumber(input.radiusKm, 'Radius')
  const sharedTime = typeof window !== 'undefined' ? readSatelliteTimeSelection() : null
  const startDate = sharedTime?.startDate ?? input.startDate
  const endDate = sharedTime?.endDate ?? input.endDate
  if (latitude < -90 || latitude > 90) throw new Error('Latitude must be within -90…90°.')
  if (longitude < -180 || longitude > 180) throw new Error('Longitude must be within -180…180°.')
  if (radiusKm <= 0 || radiusKm > 2500) throw new Error('Research radius must be greater than 0 and no more than 2500 km.')
  if (!input.title.trim()) throw new Error('Enter a research title.')
  if (!startDate || !endDate) throw new Error('Enter the start and end dates.')
  if (startDate > endDate) throw new Error('The start date cannot be later than the end date.')
  if (!input.analyses.length) throw new Error('Select at least one analysis type.')

  const shape = input.shape ?? 'circle'
  const temporalPreset = sharedTime ? 'custom' : (input.temporalPreset ?? 'custom')
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
      start_date: startDate,
      end_date: endDate,
      mode: temporalPreset,
      ...(sharedTime ? {
        requested_datetime_utc: requestedSatelliteDateTimeUtc(sharedTime),
        satellite_time_preset: sharedTime.preset,
      } : {}),
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
    title: analysis.area.place_name || `Research ${analysis.area.latitude.toFixed(4)}, ${analysis.area.longitude.toFixed(4)}`,
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
      ...(analysis.analysis.hydrology_screening ? {
        hydrology_screening: {
          ...analysis.analysis.hydrology_screening,
          candidate_features: [...analysis.analysis.hydrology_screening.candidate_features],
          required_checks: [...analysis.analysis.hydrology_screening.required_checks],
        },
      } : {}),
    },
    evidence_policy: analysis.evidence_policy,
    privacy_note: 'raw-chat-not-included',
  }
}

export function buildAssistantAnswerRecord(input: {
  answer: string
  model: string
  place: { label: string; latitude: number; longitude: number } | null
}, now = new Date()): ResearchAssistantAnswerRecord {
  const answer = input.answer.trim()
  if (!answer) throw new Error('There is no assistant answer to save.')
  const stamp = now.toISOString()
  return {
    schema: 'terra-assistant-answer/v1',
    id: `assistant-answer-${stamp.replace(/[-:.TZ]/g, '').slice(0, 14)}`,
    saved_at_utc: stamp,
    place: input.place ? {
      label: input.place.label,
      latitude: input.place.latitude,
      longitude: input.place.longitude,
    } : null,
    model: input.model,
    answer,
    privacy_note: 'user-prompt-not-stored',
  }
}

export function parseLocalResearchArchive(raw: string | null): ResearchManifest[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ResearchManifest => {
      if (!isRecord(item) || !isRecord(item.area) || !isRecord(item.temporal_scope)) return false
      return item.schema === 'terra-research-manifest/v1'
        && typeof item.id === 'string'
        && typeof item.created_at_utc === 'string'
        && typeof item.title === 'string'
        && item.status === 'draft'
        && item.evidence_policy === 'official-public-only'
        && item.area.type === 'point-radius'
        && isFiniteNumber(item.area.latitude, -90, 90)
        && isFiniteNumber(item.area.longitude, -180, 180)
        && isFiniteNumber(item.area.radius_km, 0, 2500)
        && isDateText(item.temporal_scope.start_date)
        && isDateText(item.temporal_scope.end_date)
        && String(item.temporal_scope.start_date) <= String(item.temporal_scope.end_date)
        && isStringArray(item.analyses)
        && typeof item.notes === 'string'
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
      if (!isRecord(item)) return false
      return item.schema === 'terra-research-finding/v1'
        && item.privacy_note === 'raw-chat-not-included'
        && typeof item.id === 'string'
        && isDateText(item.saved_at_utc)
        && typeof item.title === 'string'
        && isResearchArea(item.area)
        && isPeriod(item.period)
        && ['quick', 'deep'].includes(String(item.depth))
        && Array.isArray(item.source_images)
        && item.source_images.every(isSourceImage)
        && isLandsatArchive(item.landsat_catalog)
        && isAnalysisConclusion(item.conclusion)
        && typeof item.evidence_policy === 'string'
    })
  } catch {
    return []
  }
}

function validAssistantPlace(value: unknown): value is ResearchAssistantAnswerRecord['place'] {
  if (value === null) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (Object.keys(candidate).some(key => !ASSISTANT_PLACE_KEYS.has(key))) return false
  return typeof candidate.label === 'string'
    && typeof candidate.latitude === 'number'
    && Number.isFinite(candidate.latitude)
    && candidate.latitude >= -90
    && candidate.latitude <= 90
    && typeof candidate.longitude === 'number'
    && Number.isFinite(candidate.longitude)
    && candidate.longitude >= -180
    && candidate.longitude <= 180
}

export function parseLocalAssistantAnswers(raw: string | null): ResearchAssistantAnswerRecord[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ResearchAssistantAnswerRecord => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false
      const candidate = item as Record<string, unknown>
      if (Object.keys(candidate).some(key => !ASSISTANT_ANSWER_KEYS.has(key))) return false
      return candidate.schema === 'terra-assistant-answer/v1'
        && candidate.privacy_note === 'user-prompt-not-stored'
        && typeof candidate.id === 'string'
        && typeof candidate.saved_at_utc === 'string'
        && typeof candidate.answer === 'string'
        && typeof candidate.model === 'string'
        && validAssistantPlace(candidate.place)
    })
  } catch {
    return []
  }
}

export function loadLocalResearchArchive(): ResearchManifest[] {
  if (typeof window === 'undefined') return []
  return parseLocalResearchArchive(safeLocalStorageRead(LOCAL_RESEARCH_ARCHIVE_KEY))
}

export function loadLocalResearchFindings(): ResearchFindingRecord[] {
  if (typeof window === 'undefined') return []
  return parseLocalResearchFindings(safeLocalStorageRead(LOCAL_RESEARCH_FINDINGS_KEY))
}

export function loadLocalAssistantAnswers(): ResearchAssistantAnswerRecord[] {
  if (typeof window === 'undefined') return []
  return parseLocalAssistantAnswers(safeLocalStorageRead(LOCAL_ASSISTANT_ANSWERS_KEY))
}

export function saveResearchManifestLocally(manifest: ResearchManifest) {
  if (typeof window === 'undefined') return
  const current = loadLocalResearchArchive().filter(item => item.id !== manifest.id)
  safeLocalStorageWrite(LOCAL_RESEARCH_ARCHIVE_KEY, [manifest, ...current].slice(0, 50))
}

export function saveResearchFindingLocally(finding: ResearchFindingRecord) {
  if (typeof window === 'undefined') return
  const current = loadLocalResearchFindings().filter(item => item.id !== finding.id)
  safeLocalStorageWrite(LOCAL_RESEARCH_FINDINGS_KEY, [finding, ...current].slice(0, 30))
}

export function saveAssistantAnswerLocally(answer: ResearchAssistantAnswerRecord) {
  if (typeof window === 'undefined') return
  const current = loadLocalAssistantAnswers().filter(item => item.id !== answer.id)
  safeLocalStorageWrite(LOCAL_ASSISTANT_ANSWERS_KEY, [answer, ...current].slice(0, 50))
}

export function deleteResearchManifestLocally(id: string) {
  if (typeof window === 'undefined') return
  const next = loadLocalResearchArchive().filter(item => item.id !== id)
  safeLocalStorageWrite(LOCAL_RESEARCH_ARCHIVE_KEY, next)
}

export function deleteResearchFindingLocally(id: string) {
  if (typeof window === 'undefined') return
  const next = loadLocalResearchFindings().filter(item => item.id !== id)
  safeLocalStorageWrite(LOCAL_RESEARCH_FINDINGS_KEY, next)
}

export function deleteAssistantAnswerLocally(id: string) {
  if (typeof window === 'undefined') return
  const next = loadLocalAssistantAnswers().filter(item => item.id !== id)
  safeLocalStorageWrite(LOCAL_ASSISTANT_ANSWERS_KEY, next)
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

export function downloadAssistantAnswer(answer: ResearchAssistantAnswerRecord) {
  downloadJson(`${answer.id}.json`, answer)
}
