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
  listTrainingContext,
  loadPublishedCase,
  validateExplainPayload,
  validateExplanation,
} from '../src/index.js'

const expectedCases = [
  'test-001-forest-pond-kuchnia',
  'test-011-ilawa-zalewo',
  'test-013-grays-harbor',
  'vistula-test-014',
  'test-015-himalaya-tibet',
]

const expectedTrainings = ['training_1', 'training_2', 'training_3', 'training_4']

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
  const request = buildOpenAIRequest({ case_id: 'test-001-forest-pond-kuchnia', evidence: {} }, { OPENAI_MODEL: 'gpt-5.6-luna' })
  assert.equal(request.model, 'gpt-5.6-luna')
  assert.ok(request.max_output_tokens >= 1800)
  assert.equal(request.text.format.type, 'json_schema')
  assert.equal(request.text.format.strict, true)
  assert.deepEqual(request.text.format.schema.required, ['summary', 'why_it_matters', 'uncertainty', 'next_checks'])
  assert.match(request.instructions, /not environmental ground truth/i)
  assert.match(request.instructions, /AUTHOR_FIELD_OBSERVATION/)
  assert.match(request.instructions, /Reported repairs, damaged wells, ditches or channels/)
})

test('OpenAI output parsing accepts Responses API nested output text', () => {
  const text = JSON.stringify({
    summary: 'Published satellite records, field context and training artifacts are available.',
    why_it_matters: 'They support reproducible follow-up research.',
    uncertainty: 'No unverified infrastructure report establishes hydrological causation.',
    next_checks: 'Obtain official records and compare matched-season environmental measurements.',
  })
  const parsedText = extractOutputText({ output: [{ content: [{ type: 'output_text', text }] }] })
  assert.equal(parsedText, text)
  assert.equal(validateExplanation(JSON.parse(parsedText)).uncertainty.includes('No unverified'), true)
})

test('health route never returns the OpenAI secret and lists all cases and trainings', async () => {
  const response = await handleRequest(new Request('https://worker.example/health'), {
    OPENAI_API_KEY: 'test-secret-not-real',
  })
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.openai_configured, true)
  assert.equal(payload.evidence_mode, 'bundled-fixed-published-snapshot')
  assert.deepEqual(payload.supported_case_ids, expectedCases)
  assert.deepEqual(payload.training_context_ids, expectedTrainings)
  assert.equal(JSON.stringify(payload).includes('test-secret-not-real'), false)
})

test('cases route publishes TEST 001 plus all four L4 training summaries', async () => {
  const response = await handleRequest(new Request('https://worker.example/cases', {
    headers: { Origin: 'https://terraforming-planet.github.io' },
  }), { OPENAI_API_KEY: 'test-secret-not-real' })
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.cases.length, 5)
  assert.deepEqual(payload.cases.map(item => item.case_id), expectedCases)
  assert.equal(payload.cases.find(item => item.case_id === 'test-001-forest-pond-kuchnia').record_count, 73)
  assert.equal(payload.cases.find(item => item.case_id === 'test-013-grays-harbor').accepted_count, 71)
  assert.equal(payload.cases.find(item => item.case_id === 'test-015-himalaya-tibet').accepted_count, 65)
  assert.equal(payload.training_context.length, 4)
  assert.deepEqual(payload.training_context.map(item => item.training_id), expectedTrainings)
  assert.match(payload.training_context[0].summary, /704,232 sampled patches/)
  assert.equal(JSON.stringify(payload).includes('test-secret-not-real'), false)
  assert.equal(listPublicCases().length, 5)
  assert.match(payload.training_context[3].summary, /95 real temporal pairs/)
  assert.match(payload.training_context[3].summary, /checkpoint not loaded by Worker/)
  assert.equal(listTrainingContext().length, 4)
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

test('TEST 001 preserves supported satellite state change but keeps field causation unverified', async () => {
  const bundle = await loadPublishedCase('test-001-forest-pond-kuchnia')
  assert.equal(bundle.evidence_snapshot, 'bundled-at-deploy-time')
  assert.equal(bundle.evidence.satellite_result.state_change_supported, true)
  assert.equal(bundle.evidence.satellite_result.historical_persistent_footprint_m2, 17722.2)
  assert.deepEqual(bundle.evidence.satellite_result.corrected_pond_seed_wgs84, { latitude: 53.594595, longitude: 19.00014 })
  assert.equal(bundle.evidence.satellite_result.fixed_evidence_crop_width_m, 468.75)
  assert.equal(bundle.evidence.satellite_result.largest_measured_historical_component.year, 2008)
  assert.equal(bundle.evidence.satellite_result.least_visible_recorded_endpoint_year, 2026)
  assert.equal(bundle.evidence.satellite_result.near_total_state_transition_supported, true)
  assert.equal(bundle.evidence.water_loss_claim, false)
  assert.equal(bundle.evidence.causal_claim, false)
  assert.equal(bundle.evidence.author_field_report.evidence_class, 'AUTHOR_FIELD_OBSERVATION')
  assert.equal(bundle.evidence.author_field_report.independently_verified, false)
  assert.equal(bundle.evidence.author_field_report.official_documentary_record_attached, false)
  assert.equal(bundle.evidence.author_field_report.repair_effect_claim, false)
  assert.match(bundle.evidence.author_field_report.observations.join(' '), /Starostwo Powiatowe in Kwidzyn/)
})

test('all published cases receive all four L4 contexts without turning training into ground truth', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('network access should not be needed to load bundled evidence')
  }
  try {
    for (const caseId of expectedCases) {
      const bundle = await loadPublishedCase(caseId)
      assert.equal(bundle.evidence_snapshot, 'bundled-at-deploy-time')
      assert.equal(bundle.l4_research_context.training_1.ground_truth_claim, false)
      assert.equal(bundle.l4_research_context.training_1.source_images, 66)
      assert.equal(bundle.l4_research_context.training_1.samples_seen, 704232)
      assert.equal(bundle.l4_research_context.training_2.ground_truth_claim, false)
      assert.equal(bundle.l4_research_context.training_3.ground_truth_claim, false)
      assert.equal(bundle.l4_research_context.training_3.streamed_windows, 200016)
      assert.equal(bundle.l4_research_context.training_4.ground_truth_claim, false)
      assert.equal(bundle.l4_research_context.training_4.unique_real_scientific_pairs, 95)
      assert.equal(bundle.l4_research_context.training_4.validation_pairs, 9)
      assert.equal(bundle.l4_research_context.training_4.steps, 9561)
      assert.equal(bundle.l4_research_context.training_4.checkpoint_loaded_by_worker, false)
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
    body: JSON.stringify({ case_id: 'test-001-forest-pond-kuchnia' }),
  }), { OPENAI_API_KEY: 'test-secret-not-real' })
  assert.equal(response.status, 403)
})
