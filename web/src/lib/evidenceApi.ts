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
