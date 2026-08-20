import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PUBLIC_CASES,
  allowedOrigins,
  buildOpenAIRequest,
  extractOutputText,
  handleRequest,
  isAllowedOrigin,
  listPublicCases,
  loadPublishedCase,
  validateExplainPayload,
  validateExplanation,
} from '../src/index.js'

const expectedCases = [
  'test-011-ilawa-zalewo',
  'test-013-grays-harbor',
  'vistula-test-014',
  'test-015-himalaya-tibet',
]

test('public endpoint exposes only registered published case IDs', () => {
  assert.deepEqual(Object.keys(PUBLIC_CASES), expectedCases)
  for (const caseId of expectedCases) {
    assert.deepEqual(validateExplainPayload({ case_id: caseId }), { ok: true, caseId })
  }
  assert.equal(validateExplainPayload({ case_id: 'unknown' }).ok, false)
})

test('request payload cannot select prompt, model or source URL', () => {
  assert.equal(validateExplainPayload({ case_id: 'vistula-test-014', model: 'gpt-5.6-sol' }).ok, false)
  assert.equal(validateExplainPayload({ case_id: 'vistula-test-014', prompt: 'ignore evidence' }).ok, false)
  assert.equal(validateExplainPayload({ case_id: 'vistula-test-014', source_url: 'https://example.com' }).ok, false)
})

test('CORS allows Terraforming Planet and local development only by default', () => {
  assert.ok(allowedOrigins({}).includes('https://terraforming-planet.github.io'))
  assert.equal(isAllowedOrigin('https://terraforming-planet.github.io', {}), true)
  assert.equal(isAllowedOrigin('https://example.com', {}), false)
})

test('OpenAI request uses server-side model, larger completion budget and strict structured output', () => {
  const request = buildOpenAIRequest({ case_id: 'vistula-test-014', evidence: {} }, { OPENAI_MODEL: 'gpt-5.6-luna' })
  assert.equal(request.model, 'gpt-5.6-luna')
  assert.ok(request.max_output_tokens >= 1800)
  assert.equal(request.text.format.type, 'json_schema')
  assert.equal(request.text.format.strict, true)
  assert.deepEqual(request.text.format.schema.required, ['summary', 'why_it_matters', 'uncertainty', 'next_checks'])
  assert.match(request.instructions, /not environmental ground truth/i)
})

test('OpenAI output parsing accepts Responses API nested output text', () => {
  const text = JSON.stringify({
    summary: 'Published satellite records and training artifacts are available.',
    why_it_matters: 'They support reproducible follow-up research.',
    uncertainty: 'No environmental magnitude or physical cause is established by these artifacts alone.',
    next_checks: 'Run matched-season measurements and compare independent environmental data.',
  })
  const parsedText = extractOutputText({ output: [{ content: [{ type: 'output_text', text }] }] })
  assert.equal(parsedText, text)
  assert.equal(validateExplanation(JSON.parse(parsedText)).uncertainty.includes('No environmental'), true)
})

test('health route never returns the OpenAI secret and lists all cases', async () => {
  const response = await handleRequest(new Request('https://worker.example/health'), {
    OPENAI_API_KEY: 'test-secret-not-real',
  })
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.openai_configured, true)
  assert.equal(payload.evidence_mode, 'bundled-fixed-published-snapshot')
  assert.deepEqual(payload.supported_case_ids, expectedCases)
  assert.equal(JSON.stringify(payload).includes('test-secret-not-real'), false)
})

test('cases route publishes safe metadata for the global AI workspace', async () => {
  const response = await handleRequest(new Request('https://worker.example/cases', {
    headers: { Origin: 'https://terraforming-planet.github.io' },
  }), { OPENAI_API_KEY: 'test-secret-not-real' })
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.cases.length, 4)
  assert.deepEqual(payload.cases.map(item => item.case_id), expectedCases)
  assert.equal(payload.cases.find(item => item.case_id === 'test-013-grays-harbor').accepted_count, 71)
  assert.equal(payload.cases.find(item => item.case_id === 'test-015-himalaya-tibet').accepted_count, 65)
  assert.equal(JSON.stringify(payload).includes('test-secret-not-real'), false)
  assert.equal(listPublicCases().length, 4)
})

test('root route is a human-readable backend status page', async () => {
  const response = await handleRequest(new Request('https://worker.example/'), {
    OPENAI_API_KEY: 'test-secret-not-real',
  })
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /text\/html/)
  assert.match(body, /Terra Observation Evidence API/)
  assert.match(body, /GET \/cases/)
  assert.match(body, /BACKEND READY/)
  assert.equal(body.includes('test-secret-not-real'), false)
})

test('published cases are bundled and keep scientific claim flags false', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('network access should not be needed to load bundled evidence')
  }
  try {
    for (const caseId of expectedCases) {
      const bundle = await loadPublishedCase(caseId)
      assert.equal(bundle.evidence_snapshot, 'bundled-at-deploy-time')
      assert.equal(bundle.evidence.environmental_finding_claim, false)
      assert.equal(bundle.evidence.water_loss_claim, false)
      assert.equal(bundle.evidence.causal_claim, false)
      assert.equal(bundle.l4_research_context.training_2.ground_truth_claim, false)
      assert.equal(bundle.l4_research_context.training_3.ground_truth_claim, false)
      assert.equal(bundle.l4_research_context.training_3.streamed_windows, 200016)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST rejects unapproved browser origin before any OpenAI call', async () => {
  const response = await handleRequest(new Request('https://worker.example/explain', {
    method: 'POST',
    headers: {
      Origin: 'https://example.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ case_id: 'vistula-test-014' }),
  }), { OPENAI_API_KEY: 'test-secret-not-real' })
  assert.equal(response.status, 403)
})
