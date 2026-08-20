import assert from 'node:assert/strict'
import test from 'node:test'

import { handleWorkerRequest } from '../src/entry.js'

const allowedOrigin = 'https://terraforming-planet.github.io'
const env = { OPENAI_API_KEY: 'test-secret-not-real' }

function validAnalysis() {
  return {
    headline: 'Szczegółowa analiza testowa terenu.',
    what_is_visible: 'Na dostarczonych obrazach widać teren, wodę i różnice pokrycia powierzchni.',
    change_over_time: 'Datowane próbki NASA pokazują różnice między latami; obraz Copernicus daje nowszy kontekst o wyższej szczegółowości.',
    water_assessment: 'Widoczna woda wymaga porównania matched-season przed wnioskiem o trwałej zmianie.',
    notable_features: ['kanał wodny', 'odsłonięty osad', 'różnice roślinności'],
    confidence: { level: 'medium', reason: 'Dostępne są obrazy z kilku dat i katalog Landsat, ale nie ma jeszcze pełnego matched-season szeregu.' },
    limitations: ['Optical imagery can be affected by cloud cover.', 'Sentinel WMS request window is not an asserted exact acquisition time.'],
    recommended_next_step: 'Porównać oryginalne sceny Sentinel-2/Landsat i profil DEM.',
  }
}

test('production research analyze route supplies square NASA imagery plus high-detail Sentinel context', async () => {
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
    if (target === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body)
      assert.equal(body.model, 'gpt-5.6-terra')
      assert.match(body.instructions, /substantially detailed answer/)
      assert.match(body.instructions, /three evidence classes/i)
      const images = body.input[0].content.filter(item => item.type === 'input_image')
      assert.ok(images.length >= 2)
      assert.ok(images.some(item => item.image_url.startsWith('https://sh.dataspace.copernicus.eu/ogc/wms/')))
      const nasa = images.filter(item => item.image_url.startsWith('https://gibs.earthdata.nasa.gov/'))
      assert.ok(nasa.length > 0)
      for (const item of nasa) {
        const parsed = new URL(item.image_url)
        assert.equal(parsed.searchParams.get('WIDTH'), '1400')
        assert.equal(parsed.searchParams.get('HEIGHT'), '1400')
        assert.equal(item.detail, 'auto')
      }
      const sentinel = images.find(item => item.image_url.startsWith('https://sh.dataspace.copernicus.eu/ogc/wms/'))
      const sentinelUrl = new URL(sentinel.image_url)
      assert.equal(sentinelUrl.searchParams.get('WIDTH'), '1600')
      assert.equal(sentinelUrl.searchParams.get('HEIGHT'), '1600')
      assert.match(sentinelUrl.searchParams.get('TIME'), /^2026-08-06\/2026-08-20$/)
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
    assert.ok(payload.preview_images.some(item => item.source.includes('Copernicus Data Space')))
    assert.match(payload.evidence_policy, /Sentinel-2/)
    assert.equal(JSON.stringify(payload).includes('test-secret-not-real'), false)
    assert.equal(upstreams.filter(item => item === 'https://api.openai.com/v1/responses').length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('deep analysis asks OpenAI for high-detail imagery and a larger output budget', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    if (target.startsWith('https://landsatlook.usgs.gov/')) return new Response(JSON.stringify({ numberMatched: 0, features: [] }), { status: 200 })
    if (target === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body)
      assert.equal(body.max_output_tokens, 7000)
      const images = body.input[0].content.filter(item => item.type === 'input_image')
      assert.ok(images.length > 7)
      assert.ok(images.every(item => item.detail === 'high'))
      const sentinel = images.find(item => item.image_url.startsWith('https://sh.dataspace.copernicus.eu/ogc/wms/'))
      assert.ok(sentinel)
      const parsed = new URL(sentinel.image_url)
      assert.equal(parsed.searchParams.get('WIDTH'), '2048')
      assert.equal(parsed.searchParams.get('HEIGHT'), '2048')
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
    assert.equal(response.status, 200)
  } finally {
    globalThis.fetch = originalFetch
  }
})
