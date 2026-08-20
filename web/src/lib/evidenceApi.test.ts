import { describe, expect, it, vi } from 'vitest'

import { checkEvidenceApiHealth, explainPublishedCase, normalizeEvidenceApiUrl } from './evidenceApi'

describe('normalizeEvidenceApiUrl', () => {
  it('removes whitespace and trailing slashes', () => {
    expect(normalizeEvidenceApiUrl(' https://worker.example/// ')).toBe('https://worker.example')
    expect(normalizeEvidenceApiUrl()).toBe('')
  })
})

describe('evidence API client', () => {
  it('checks health without sending secrets', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      service: 'terra-observation-evidence-explainer',
      status: 'ready',
      openai_configured: true,
      supported_case_ids: ['vistula-test-014'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const result = await checkEvidenceApiHealth('https://worker.example/')

    expect(result.openai_configured).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('https://worker.example/health', expect.objectContaining({ cache: 'no-store' }))
    fetchMock.mockRestore()
  })

  it('sends only the registered case id shape to explain endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      case_id: 'vistula-test-014',
      case_title: 'Vistula Test 014',
      evidence_source: 'canonical-public-repository-artifacts',
      generated_at_utc: '2026-08-20T10:00:00Z',
      explanation: {
        summary: 'Real research records are available.',
        why_it_matters: 'They support reproducible follow-up analysis.',
        uncertainty: 'No water-loss magnitude or cause is established yet.',
        next_checks: 'Run matched-season water and channel measurements.',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await explainPublishedCase('https://worker.example', 'vistula-test-014')

    const [, options] = fetchMock.mock.calls[0]
    expect(options?.body).toBe(JSON.stringify({ case_id: 'vistula-test-014' }))
    expect(JSON.stringify(options)).not.toContain('OPENAI_API_KEY')
    fetchMock.mockRestore()
  })
})
