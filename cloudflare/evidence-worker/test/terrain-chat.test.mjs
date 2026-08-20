import assert from 'node:assert/strict'
import test from 'node:test'

import { ELEVATION_PATH, handleElevationProxy } from '../src/elevationProxy.js'
import { RESEARCH_CHAT_PATH, handleResearchChat } from '../src/researchChat.js'
import { handleWorkerRequest } from '../src/entry.js'

const allowedOrigin = 'https://terraforming-planet.github.io'
const env = { OPENAI_API_KEY: 'test-secret-not-real' }

test('elevation proxy returns Copernicus GLO-90 provenance and preserves requested points', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async url => {
    const target = String(url)
    assert.match(target, /^https:\/\/api\.open-meteo\.com\/v1\/elevation\?/)
    return new Response(JSON.stringify({ elevation: [1786, 381] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const response = await handleElevationProxy(new Request(`https://worker.example${ELEVATION_PATH}`, {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: [
        { latitude: 12, longitude: 37.25, label: 'Lake Tana' },
        { latitude: 15.6031, longitude: 32.5265, label: 'Khartoum' },
      ] }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.dataset.name, 'Copernicus DEM GLO-90')
    assert.equal(payload.dataset.nominal_horizontal_resolution_m, 90)
    assert.match(payload.dataset.delivery_note, /raster/)
    assert.equal(payload.points[0].elevation_m, 1786)
    assert.equal(payload.points[0].exact_surveyed_point, false)
    assert.equal(payload.points[1].label, 'Khartoum')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('research chat allows only the named GPT-5.6 family and returns an exact attachment receipt', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses')
    const body = JSON.parse(options.body)
    assert.equal(body.model, 'gpt-5.6-sol')
    assert.match(body.instructions, /Never invent elevation values/)
    assert.match(body.instructions, /Raw user prompts and conversation text are transient/i)
    assert.match(body.instructions, /archive outputs must omit the user's prompt text/i)
    const latest = body.input.at(-1)
    const image = latest.content.find(item => item.type === 'input_image')
    const file = latest.content.find(item => item.type === 'input_file')
    assert.ok(image)
    assert.equal(image.detail, 'high')
    assert.ok(file)
    assert.ok(latest.content.some(item => item.type === 'input_text' && item.text.includes('RESEARCH_CONTEXT')))
    return new Response(JSON.stringify({ output_text: 'Raport testowy bez wymyślonych pomiarów.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const tinyImage = 'data:image/png;base64,aGVsbG8='
    const tinyFile = 'data:text/plain;base64,d29ybGQ='
    const response = await handleResearchChat(new Request(`https://worker.example${RESEARCH_CHAT_PATH}`, {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6-sol',
        messages: [{ role: 'user', text: 'Przeanalizuj flagi.' }],
        context: { flags: [{ number: 1, elevation_m: 100 }] },
        attachments: [
          { kind: 'image', name: 'map.png', mime_type: 'image/png', data_url: tinyImage },
          { kind: 'file', name: 'notes.txt', mime_type: 'text/plain', data_url: tinyFile },
        ],
        report_mode: true,
      }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.model, 'gpt-5.6-sol')
    assert.equal(payload.attachment_count, 2)
    assert.equal(payload.attachment_images, 1)
    assert.equal(payload.attachment_files, 1)
    assert.deepEqual(payload.attachment_names, ['map.png', 'notes.txt'])
    assert.ok(payload.attachment_bytes > 0)
    assert.match(payload.answer, /Raport testowy/)
    assert.match(payload.evidence_policy, /raw user prompts/i)
    assert.equal(JSON.stringify(payload).includes('test-secret-not-real'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('research chat rejects more than five images and router exposes both new endpoints', async () => {
  const images = Array.from({ length: 6 }, (_, index) => ({
    kind: 'image',
    name: `image-${index}.png`,
    mime_type: 'image/png',
    data_url: 'data:image/png;base64,aA==',
  }))
  const rejected = await handleResearchChat(new Request(`https://worker.example${RESEARCH_CHAT_PATH}`, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-5.6-luna', messages: [{ role: 'user', text: 'test' }], attachments: images }),
  }), env)
  assert.equal(rejected.status, 400)
  assert.match((await rejected.json()).error, /Maximum 5 images/)

  const originalFetch = globalThis.fetch
  globalThis.fetch = async url => {
    if (String(url).startsWith('https://api.open-meteo.com/')) return new Response(JSON.stringify({ elevation: [12] }), { status: 200 })
    throw new Error(`unexpected upstream ${url}`)
  }
  try {
    const elevation = await handleWorkerRequest(new Request(`https://worker.example${ELEVATION_PATH}`, {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: [{ latitude: 0, longitude: 0 }] }),
    }), env)
    assert.equal(elevation.status, 200)
  } finally {
    globalThis.fetch = originalFetch
  }
})
