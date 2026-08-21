import {
  SATELLITE_TIME_MATCH_EVENT,
  readSatelliteTimeSelection,
  requestedSatelliteDateTimeUtc,
  type SatelliteTimeMatch,
  type SatelliteTimeSelection,
} from '../satelliteTimeSelection'

export type EvidenceExplanation = {
  summary: string
  why_it_matters: string
  uncertainty: string
  next_checks: string
}

export type EvidenceHealth = {
  service: string
  status: 'ready' | 'degraded'
  openai_configured: boolean
  supported_case_ids: string[]
  evidence_mode?: string
}

export type EvidenceCaseSummary = {
  case_id: string
  short_label: string
  title: string
  category: string
  public_page: string
  evidence_class: string
  record_count?: number
  accepted_count?: number
  temporal_scope?: string
}

export type TrainingContextSummary = {
  training_id: string
  short_label: string
  title: string
  public_page: string
  evidence_class: string
  gpu: string
  summary: string
}

export type EvidenceCasesResponse = {
  service: string
  cases: EvidenceCaseSummary[]
  training_context: TrainingContextSummary[]
}

export type EvidenceResponse = {
  case_id: string
  case_title: string
  evidence_source: string
  generated_at_utc: string
  explanation: EvidenceExplanation
}

export type GeocodeResult = {
  display_name: string
  latitude: number
  longitude: number
  type: string
  category: string
}

export type AreaAnalysisResult = {
  headline: string
  what_is_visible: string
  change_over_time: string
  water_assessment: string
  notable_features: string[]
  confidence: { level: 'low' | 'medium' | 'high'; reason: string }
  limitations: string[]
  recommended_next_step: string
}

export type AreaAnalysisResponse = {
  service: string
  generated_at_utc: string
  area: {
    place_name: string | null
    latitude: number
    longitude: number
    radius_km: number
  }
  period: { start_date: string; end_date: string }
  depth: 'quick' | 'deep'
  preview_images: Array<{ date: string; source: string; url: string }>
  ai_visual_image_count: number
  landsat_catalog: {
    matched: number
    returned: number
    scenes: Array<{ id: string; date: string | null; platform: string | null; cloud_cover: number | null }>
    query_url: string | null
    full_catalog_url: string | null
    warning?: string
  }
  analysis: AreaAnalysisResult
  evidence_policy: string
}

export type ElevationDataset = {
  name: string
  release: string
  nominal_horizontal_resolution_m: number
  elevation_reference: string
  source_agency: string
  delivery_service: string
  delivery_note: string
  official_dataset_url: string
}

export type ElevationPoint = {
  latitude: number
  longitude: number
  label: string
  elevation_m: number
  sample_method: string
  exact_surveyed_point: boolean
  nominal_cell_size_m: number
  location_uncertainty_note: string
}

export type ElevationResponse = {
  service: string
  generated_at_utc: string
  dataset: ElevationDataset
  points: ElevationPoint[]
}

export type ResearchModel = 'gpt-5.6-luna' | 'gpt-5.6-terra' | 'gpt-5.6-sol'
export type ResearchChatMessage = { role: 'user' | 'assistant'; text: string }
export type ResearchAttachmentPayload = {
  kind: 'image' | 'file'
  name: string
  mime_type: string
  data_url: string
}
export type ResearchChatResponse = {
  service: string
  generated_at_utc: string
  model: ResearchModel
  answer: string
  attachment_count: number
  attachment_images: number
  attachment_files: number
  attachment_bytes: number
  attachment_names: string[]
  evidence_policy: string
}

export function normalizeEvidenceApiUrl(value?: string) {
  return (value ?? '').trim().replace(/\/+$/, '')
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { error?: unknown } & T
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`
    throw new Error(message)
  }
  return payload
}

function dispatchTimeMatch(detail: SatelliteTimeMatch | null) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<SatelliteTimeMatch | null>(SATELLITE_TIME_MATCH_EVENT, { detail }))
}

function sceneTimestamp(feature: unknown) {
  const item = feature as { id?: unknown; properties?: { datetime?: unknown; start_datetime?: unknown; platform?: unknown } }
  const raw = typeof item?.properties?.datetime === 'string'
    ? item.properties.datetime
    : typeof item?.properties?.start_datetime === 'string'
      ? item.properties.start_datetime
      : ''
  const timestamp = Date.parse(raw)
  if (!raw || !Number.isFinite(timestamp)) return null
  return {
    id: typeof item.id === 'string' ? item.id : '',
    datetime: new Date(timestamp).toISOString(),
    timestamp,
    platform: typeof item.properties?.platform === 'string' ? item.properties.platform : '',
  }
}

async function resolveNearestLandsatTime(result: AreaAnalysisResponse, selection: SatelliteTimeSelection) {
  const requestedUtc = requestedSatelliteDateTimeUtc(selection)
  if (!requestedUtc) {
    dispatchTimeMatch(null)
    return
  }
  const requestedMs = Date.parse(requestedUtc)
  const catalogUrl = result.landsat_catalog.full_catalog_url
  if (!catalogUrl || !Number.isFinite(requestedMs)) {
    dispatchTimeMatch({ status: 'unavailable', requestedUtc, reason: 'Brak adresu katalogu Landsat dla tego zapytania.' })
    return
  }

  try {
    const url = new URL(catalogUrl)
    url.searchParams.set('datetime', `${selection.exactDate}T00:00:00Z/${selection.exactDate}T23:59:59Z`)
    url.searchParams.set('limit', '100')
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/geo+json,application/json' },
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`USGS Landsat STAC HTTP ${response.status}`)
    const payload = await response.json() as { features?: unknown[] }
    const scenes = (Array.isArray(payload.features) ? payload.features : [])
      .map(sceneTimestamp)
      .filter((item): item is NonNullable<typeof item> => item !== null)
    if (!scenes.length) {
      dispatchTimeMatch({ status: 'unavailable', requestedUtc, reason: 'Tego dnia katalog nie zwrócił sceny z dokładnym timestampem.' })
      return
    }
    const nearest = scenes.reduce((best, item) => Math.abs(item.timestamp - requestedMs) < Math.abs(best.timestamp - requestedMs) ? item : best)
    dispatchTimeMatch({
      status: 'matched',
      requestedUtc,
      nearestUtc: nearest.datetime,
      differenceMinutes: Math.abs(nearest.timestamp - requestedMs) / 60_000,
      sceneId: nearest.id || undefined,
      platform: nearest.platform || undefined,
    })
  } catch (reason) {
    dispatchTimeMatch({
      status: 'unavailable',
      requestedUtc,
      reason: reason instanceof Error ? reason.message : 'Nie udało się sprawdzić dokładnego czasu sceny.',
    })
  }
}

export async function checkEvidenceApiHealth(apiUrl: string, signal?: AbortSignal) {
  const url = normalizeEvidenceApiUrl(apiUrl)
  if (!url) throw new Error('Evidence API URL is not configured.')
  const response = await fetch(`${url}/health`, { cache: 'no-store', signal })
  return readJson<EvidenceHealth>(response)
}

export async function listPublishedCases(apiUrl: string, signal?: AbortSignal) {
  const url = normalizeEvidenceApiUrl(apiUrl)
  if (!url) throw new Error('Evidence API URL is not configured.')
  const response = await fetch(`${url}/cases`, { cache: 'no-store', signal })
  return readJson<EvidenceCasesResponse>(response)
}

export async function explainPublishedCase(apiUrl: string, caseId: string, signal?: AbortSignal) {
  const url = normalizeEvidenceApiUrl(apiUrl)
  if (!url) throw new Error('Evidence API URL is not configured.')
  const response = await fetch(`${url}/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_id: caseId }),
    signal,
  })
  return readJson<EvidenceResponse>(response)
}

export async function searchResearchPlace(apiUrl: string, query: string, signal?: AbortSignal) {
  const url = normalizeEvidenceApiUrl(apiUrl)
  if (!url) throw new Error('Evidence API URL is not configured.')
  const response = await fetch(`${url}/research/geocode?q=${encodeURIComponent(query.trim())}`, {
    cache: 'no-store',
    signal,
  })
  return readJson<{ query: string; results: GeocodeResult[]; source: string; source_url: string }>(response)
}

export async function analyzeResearchArea(apiUrl: string, input: {
  latitude: number
  longitude: number
  radiusKm?: number
  startDate: string
  endDate: string
  placeName?: string
  depth?: 'quick' | 'deep'
}, signal?: AbortSignal) {
  const url = normalizeEvidenceApiUrl(apiUrl)
  if (!url) throw new Error('Evidence API URL is not configured.')
  const timeSelection = readSatelliteTimeSelection()
  const response = await fetch(`${url}/research/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      latitude: input.latitude,
      longitude: input.longitude,
      radius_km: input.radiusKm ?? 25,
      start_date: timeSelection.startDate || input.startDate,
      end_date: timeSelection.endDate || input.endDate,
      place_name: input.placeName ?? '',
      depth: input.depth ?? 'quick',
    }),
    signal,
  })
  const result = await readJson<AreaAnalysisResponse>(response)
  void resolveNearestLandsatTime(result, timeSelection)
  return result
}

export async function fetchResearchElevations(apiUrl: string, points: Array<{ latitude: number; longitude: number; label?: string }>, signal?: AbortSignal) {
  const url = normalizeEvidenceApiUrl(apiUrl)
  if (!url) throw new Error('Evidence API URL is not configured.')
  const response = await fetch(`${url}/research/elevation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
    signal,
  })
  return readJson<ElevationResponse>(response)
}

export async function sendResearchChat(apiUrl: string, input: {
  model: ResearchModel
  messages: ResearchChatMessage[]
  context: unknown
  attachments?: ResearchAttachmentPayload[]
  reportMode?: boolean
}, signal?: AbortSignal) {
  const url = normalizeEvidenceApiUrl(apiUrl)
  if (!url) throw new Error('Evidence API URL is not configured.')
  const response = await fetch(`${url}/research/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      context: input.context,
      attachments: input.attachments ?? [],
      report_mode: input.reportMode ?? false,
    }),
    signal,
  })
  return readJson<ResearchChatResponse>(response)
}
