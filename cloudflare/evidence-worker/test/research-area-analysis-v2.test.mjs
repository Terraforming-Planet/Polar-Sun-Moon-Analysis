import assert from 'node:assert/strict'
import test from 'node:test'

import { handleWorkerRequest } from '../src/entry.js'

const allowedOrigin = 'https://terraforming-planet.github.io'
const env = { OPENAI_API_KEY: 'test-secret-not-real' }
const imageResponse = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
  status: 200,
  headers: { 'Content-Type': 'image/jpeg' },
})

function validAnalysis() {
  return {
    headline: 'Detailed test terrain analysis.',
    what_is_visible: 'The supplied images show terrain, water and differences in surface cover.',
    change_over_time: 'Dated NASA samples show differences between years; Copernicus provides newer higher-detail context.',
    water_assessment: 'Visible water requires matched-season comparison before claiming a persistent change.',
    notable_features: ['water channel', 'exposed sediment', 'vegetation differences'],
    confidence: { level: 'medium', reason: 'Several dated images and the Landsat catalogue are available, but a complete matched-season series is not.' },
    limitations: ['Optical imagery can be affected by cloud cover.', 'Sentinel WMS request window is not an asserted exact acquisition time.'],
    recommended_next_step: 'Compare original Sentinel-2/Landsat scenes and a DEM profile.',
  }
}

test('production research analyze route preflights official imagery and sends validated image bytes to OpenAI', async () => {
  const originalFetch = globalThis.fetch
  const upstreams = []
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    upstreams.push(target)
    if (target.startsWith('https://landsatlook.usgs.gov/')) {
      return new Response(JSON.stringify({
        numberMatched: 777,
        features: [{
          id: 'LC09_TEST_V2',
          properties: { datetime: '2026-08-14T08:00:00Z', platform: 'LANDSAT_9', 'eo:cloud_cover': 3.4 },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/geo+json' } })
    }
    if (target.startsWith('https://gibs.earthdata.nasa.gov/') || target.startsWith('https://sh.dataspace.copernicus.eu/')) {
      return imageResponse()
    }
    if (target === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body)
      assert.equal(body.model, 'gpt-5.6-terra')
      assert.match(body.instructions, /substantially detailed answer/)
      assert.match(body.instructions, /three evidence classes/i)
      assert.match(body.instructions, /Respond in English/)
      const images = body.input[0].content.filter(item => item.type === 'input_image')
      assert.ok(images.length >= 2)
      assert.ok(images.length <= 4)
      assert.ok(images.every(item => item.image_url.startsWith('data:image/jpeg;base64,')))
      assert.ok(images.every(item => item.detail === 'auto'))
      return new Response(JSON.stringify({ output_text: JSON.stringify(validAnalysis()) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`unexpected upstream ${target}`)
  }

  try {
    const response = await handleWorkerRequest(new Request('https://worker.example/research/analyze', {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: 12.0,
        longitude: 37.25,
        radius_km: 25,
        start_date: '1990-01-01',
        end_date: '2026-08-20',
        depth: 'quick',
        place_name: 'Lake Tana',
      }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.service, 'terra-observation-area-analysis-v2')
    assert.equal(payload.landsat_catalog.matched, 777)
    assert.ok(payload.ai_visual_image_count >= 2)
    assert.ok(payload.ai_visual_image_count <= 4)
    assert.ok(payload.preview_images.length <= 8)
    assert.ok(payload.preview_images.some(item => item.source.includes('Copernicus Data Space')))
    assert.match(payload.evidence_policy, /Worker image preflight/)
    assert.equal(payload.gallery_policy.simple_display_limit, 4)
    assert.equal(payload.gallery_policy.advanced_display_limit, 8)
    assert.equal(JSON.stringify(payload).includes('test-secret-not-real'), false)
    assert.equal(upstreams.filter(item => item === 'https://api.openai.com/v1/responses').length, 1)

    const nasaRequests = upstreams.filter(item => item.startsWith('https://gibs.earthdata.nasa.gov/'))
    assert.ok(nasaRequests.length > 0)
    for (const item of nasaRequests) {
      const parsed = new URL(item)
      assert.equal(parsed.searchParams.get('WIDTH'), '1400')
      assert.equal(parsed.searchParams.get('HEIGHT'), '1400')
    }
    const sentinelRequest = upstreams.find(item => item.startsWith('https://sh.dataspace.copernicus.eu/ogc/wms/'))
    assert.ok(sentinelRequest)
    const sentinelUrl = new URL(sentinelRequest)
    assert.equal(sentinelUrl.searchParams.get('WIDTH'), '1600')
    assert.equal(sentinelUrl.searchParams.get('HEIGHT'), '1600')
    assert.match(sentinelUrl.searchParams.get('TIME'), /^2026-08-06\/2026-08-20$/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('deep analysis keeps a bounded high-detail validated image set and larger output budget', async () => {
  const originalFetch = globalThis.fetch
  const upstreams = []
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    upstreams.push(target)
    if (target.startsWith('https://landsatlook.usgs.gov/')) return new Response(JSON.stringify({ numberMatched: 0, features: [] }), { status: 200 })
    if (target.startsWith('https://gibs.earthdata.nasa.gov/') || target.startsWith('https://sh.dataspace.copernicus.eu/')) return imageResponse()
    if (target === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body)
      assert.equal(body.max_output_tokens, 7000)
      const images = body.input[0].content.filter(item => item.type === 'input_image')
      assert.equal(images.length, 8)
      assert.ok(images.every(item => item.detail === 'high'))
      assert.ok(images.every(item => item.image_url.startsWith('data:image/jpeg;base64,')))
      return new Response(JSON.stringify({ output_text: JSON.stringify(validAnalysis()) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`unexpected upstream ${target}`)
  }
  try {
    const response = await handleWorkerRequest(new Request('https://worker.example/research/analyze', {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 53.59, longitude: 19.01, radius_km: 25, start_date: '2000-01-01', end_date: '2026-08-20', depth: 'deep', place_name: 'test' }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.ai_visual_image_count, 8)
    assert.ok(payload.preview_images.length <= 8)
    const sentinelRequest = upstreams.find(item => item.startsWith('https://sh.dataspace.copernicus.eu/ogc/wms/'))
    assert.ok(sentinelRequest)
    const parsed = new URL(sentinelRequest)
    assert.equal(parsed.searchParams.get('WIDTH'), '2048')
    assert.equal(parsed.searchParams.get('HEIGHT'), '2048')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('invalid Copernicus WMS content is skipped without breaking NASA-backed area analysis', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    if (target.startsWith('https://landsatlook.usgs.gov/')) return new Response(JSON.stringify({ numberMatched: 0, features: [] }), { status: 200 })
    if (target.startsWith('https://gibs.earthdata.nasa.gov/')) return imageResponse()
    if (target.startsWith('https://sh.dataspace.copernicus.eu/')) {
      return new Response('<ServiceException>Invalid instance</ServiceException>', { status: 200, headers: { 'Content-Type': 'text/xml' } })
    }
    if (target === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body)
      const images = body.input[0].content.filter(item => item.type === 'input_image')
      assert.ok(images.length > 0)
      assert.ok(images.every(item => item.image_url.startsWith('data:image/jpeg;base64,')))
      return new Response(JSON.stringify({ output_text: JSON.stringify(validAnalysis()) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`unexpected upstream ${target}`)
  }

  try {
    const response = await handleWorkerRequest(new Request('https://worker.example/research/analyze', {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 22.72438, longitude: 32.10533, radius_km: 25, start_date: '2025-01-01', end_date: '2026-08-20', depth: 'quick', place_name: 'Nile, Egypt' }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.ok(payload.ai_visual_image_count > 0)
    assert.ok(payload.visual_preflight_warnings.some(item => item.includes('Copernicus Data Space')))
    assert.equal(payload.preview_images.some(item => item.source.includes('Copernicus Data Space')), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
