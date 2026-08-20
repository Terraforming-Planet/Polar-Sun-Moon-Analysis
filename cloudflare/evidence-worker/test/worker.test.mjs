import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PUBLIC_CASES,
  allowedOrigins,
  buildOpenAIRequest,
  extractOutputText,
  handleRequest,
  isAllowedOrigin,
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
  assert.equal(body.includes('test-secret-not-real'), false)
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
