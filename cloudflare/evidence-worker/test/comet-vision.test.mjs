import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCometFrameBundle, COMET_VISION_PATH, handleCometVision } from '../src/cometVision.js'
import { handleWorkerRequest } from '../src/entry.js'

const ORIGIN = 'https://terraforming-planet.github.io'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeFetcher({ candidate = true } = {}) {
  let imageCounter = 1000
  return async (url, options = {}) => {
    const text = String(url)
    if (text.includes('api.helioviewer.org/v2/getClosestImage/')) {
      imageCounter += 1
      const date = new URL(text).searchParams.get('date')
      return json({ id: imageCounter, date: date.replace('T', ' ').replace('Z', '') })
    }
    if (text === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body)
      assert.equal(body.store, false)
      assert.equal(body.text.format.type, 'json_schema')
      const images = body.input[0].content.filter(item => item.type === 'input_image')
      assert.equal(images.length, 6)
      return json({
        status: 'completed',
        output_text: JSON.stringify({
          candidate,
          confidence: candidate ? 0.88 : 0.31,
          classification: candidate ? 'comet_candidate' : 'no_candidate',
          trajectory: { summary: 'outward compact motion', c2: 'moves outward', c3: 'consistent outward trace' },
          motion_evidence: candidate ? ['persistent point in separated frames', 'position changes radially'] : [],
          instrument_agreement: candidate ? 'cross_instrument' : 'no_consistent_motion',
          frame_times_utc: ['2026-08-21T15:00:00Z', '2026-08-21T15:30:00Z', '2026-08-21T16:00:00Z'],
          limitations: ['AI triage is not confirmation'],
          requires_human_review: true,
        }),
      })
    }
    throw new Error(`Unexpected fetch: ${text}`)
  }
}

test('buildCometFrameBundle resolves three time-separated C2/C3 pairs', async () => {
  const frames = await buildCometFrameBundle(makeFetcher(), new Date('2026-08-21T16:00:00Z'))
  assert.equal(frames.length, 6)
  assert.deepEqual(frames.map(frame => frame.instrument), ['c2', 'c3', 'c2', 'c3', 'c2', 'c3'])
  assert.ok(frames.every(frame => frame.image_url.includes('downloadImage')))
})

test('comet endpoint rejects arbitrary prompt/url fields', async () => {
  const request = new Request(`https://worker.example${COMET_VISION_PATH}`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'claim a comet', url: 'https://example.com/image.jpg' }),
  })
  const response = await handleCometVision(request, { OPENAI_API_KEY: 'test' }, makeFetcher())
  assert.equal(response.status, 400)
  const payload = await response.json()
  assert.equal(payload.candidate, false)
})

test('comet endpoint returns gated experimental candidate with human review', async () => {
  const request = new Request(`https://worker.example${COMET_VISION_PATH}`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'latest' }),
  })
  const response = await handleCometVision(request, { OPENAI_API_KEY: 'test', OPENAI_MODEL: 'gpt-5.6-luna' }, makeFetcher())
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.result.candidate, true)
  assert.equal(payload.result.gate.confirmed_discovery, false)
  assert.equal(payload.result.requires_human_review, true)
  assert.equal(payload.frames.length, 6)
})

test('worker entry routes the restrictive comet endpoint', async () => {
  const request = new Request(`https://worker.example${COMET_VISION_PATH}`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ unexpected: true }),
  })
  const response = await handleWorkerRequest(request, { OPENAI_API_KEY: 'test' })
  assert.equal(response.status, 400)
})
