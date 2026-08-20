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
  const response = await fetch(`${url}/research/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      latitude: input.latitude,
      longitude: input.longitude,
      radius_km: input.radiusKm ?? 25,
      start_date: input.startDate,
      end_date: input.endDate,
      place_name: input.placeName ?? '',
      depth: input.depth ?? 'quick',
    }),
    signal,
  })
  return readJson<AreaAnalysisResponse>(response)
}
