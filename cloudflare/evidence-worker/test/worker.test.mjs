import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PUBLIC_CASES,
  allowedOrigins,
  buildOpenAIRequest,
  extractOutputText,
  handleRequest,
  isAllowedOrigin,
  loadPublishedCase,
  validateExplainPayload,
  validateExplanation,
} from '../src/index.js'

test('public endpoint exposes only registered case IDs', () => {
  assert.deepEqual(Object.keys(PUBLIC_CASES), ['vistula-test-014'])
  assert.deepEqual(validateExplainPayload({ case_id: 'vistula-test-014' }), {
    ok: true,
    caseId: 'vistula-test-014',
  })
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

test('OpenAI request uses server-side model and strict structured output', () => {
  const request = buildOpenAIRequest({ case_id: 'vistula-test-014', evidence: {} }, { OPENAI_MODEL: 'gpt-5.6-luna' })
  assert.equal(request.model, 'gpt-5.6-luna')
  assert.equal(request.text.format.type, 'json_schema')
  assert.equal(request.text.format.strict, true)
  assert.deepEqual(request.text.format.schema.required, ['summary', 'why_it_matters', 'uncertainty', 'next_checks'])
  assert.match(request.instructions, /not environmental ground truth/i)
})

test('OpenAI output parsing accepts Responses API nested output text', () => {
  const text = JSON.stringify({
    summary: 'Published satellite records and training artifacts are available.',
    why_it_matters: 'They support reproducible follow-up research.',
    uncertainty: 'No water-loss magnitude or physical cause is established by these artifacts alone.',
    next_checks: 'Run matched-season water and channel measurements, then compare hydrological data.',
  })
  const parsedText = extractOutputText({ output: [{ content: [{ type: 'output_text', text }] }] })
  assert.equal(parsedText, text)
  assert.equal(validateExplanation(JSON.parse(parsedText)).uncertainty.includes('No water-loss'), true)
})

test('health route never returns the OpenAI secret', async () => {
  const response = await handleRequest(new Request('https://worker.example/health'), {
    OPENAI_API_KEY: 'test-secret-not-real',
  })
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(body, /"openai_configured":true/)
  assert.match(body, /"evidence_mode":"bundled-fixed-published-snapshot"/)
  assert.equal(body.includes('test-secret-not-real'), false)
})

test('root route is a human-readable backend status page', async () => {
  const response = await handleRequest(new Request('https://worker.example/'), {
    OPENAI_API_KEY: 'test-secret-not-real',
  })
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /text\/html/)
  assert.match(body, /Terra Observation Evidence API/)
  assert.match(body, /Open Terra Observation System/)
  assert.match(body, /BACKEND READY/)
  assert.equal(body.includes('test-secret-not-real'), false)
})

test('published evidence case is bundled and keeps scientific claim flags false', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('network access should not be needed to load bundled evidence')
  }
  try {
    const bundle = await loadPublishedCase('vistula-test-014')
    assert.equal(bundle.evidence_snapshot, 'bundled-at-deploy-time')
    assert.equal(bundle.evidence.real_data_test.environmental_finding_claim, false)
    assert.equal(bundle.evidence.real_data_test.water_loss_claim, false)
    assert.equal(bundle.evidence.real_data_test.causal_claim, false)
    assert.equal(bundle.evidence.l4_training_2.claims.ground_truth_claim, false)
    assert.equal(bundle.evidence.l4_training_3.ground_truth_claim, false)
    assert.equal(bundle.evidence.l4_training_3.coverage.line_count, 200016)
    assert.equal(bundle.provenance.repository, 'Terraforming-Planet/Polar-Sun-Moon-Analysis')
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
