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
    headline: 'Szczegółowa analiza testowa terenu.',
    what_is_visible: 'Na dostarczonych obrazach widać teren, wodę i różnice pokrycia powierzchni.',
    change_over_time: 'Datowane próbki pokazują różnice między scenami; dokładna przyczyna wymaga dodatkowych danych.',
    water_assessment: 'Widoczna woda wymaga porównania matched-season przed wnioskiem o trwałej zmianie.',
    notable_features: ['kanał wodny', 'odsłonięty osad', 'różnice roślinności'],
    confidence: { level: 'medium', reason: 'Dostępne są oficjalne obrazy i katalog Landsat, ale nie ma jeszcze pełnego matched-season szeregu.' },
    limitations: ['Optical imagery can be affected by cloud cover.', 'Sentinel WMS request window is not an asserted exact acquisition time.'],
    recommended_next_step: 'Porównać oryginalne sceny Sentinel-2/Landsat i profil DEM.',
  }
}

function landsatScene({ id, date, cloud, url }) {
  return {
    id,
    properties: {
      datetime: `${date}T08:00:00Z`,
      platform: 'LANDSAT_9',
      'eo:cloud_cover': cloud,
    },
    assets: {
      browse: {
        href: url,
        type: 'image/jpeg',
        title: 'Full Resolution Browse',
        roles: ['overview'],
      },
    },
  }
}

test('default research route uses low-cloud Landsat browse plus constrained Sentinel and caps previews at four', async () => {
  const originalFetch = globalThis.fetch
  const upstreams = []
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    upstreams.push(target)
    if (target.startsWith('https://landsatlook.usgs.gov/')) {
      return new Response(JSON.stringify({
        numberMatched: 777,
        features: [
          landsatScene({ id: 'LC09_CLEAR', date: '2026-08-14', cloud: 3.4, url: 'https://example.usgs.gov/clear.jpg' }),
          landsatScene({ id: 'LC09_CLOUDY', date: '2026-08-15', cloud: 54.0, url: 'https://example.usgs.gov/cloudy.jpg' }),
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/geo+json' } })
    }
    if (target === 'https://example.usgs.gov/clear.jpg' || target.startsWith('https://sh.dataspace.copernicus.eu/')) {
      return imageResponse()
    }
    if (target === 'https://example.usgs.gov/cloudy.jpg') throw new Error('cloudy scene must not be fetched in clear mode')
    if (target.startsWith('https://gibs.earthdata.nasa.gov/')) throw new Error('NASA GIBS must be opt-in in clear mode')
    if (target === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body)
      assert.equal(body.model, 'gpt-5.6-terra')
      assert.match(body.instructions, /default clear-imagery mode/i)
      const images = body.input[0].content.filter(item => item.type === 'input_image')
      assert.equal(images.length, 2)
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
        latitude: 54.09,
        longitude: 18.78,
        radius_km: 25,
        start_date: '1990-01-01',
        end_date: '2026-08-20',
        depth: 'quick',
        place_name: 'Tczew',
      }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.service, 'terra-observation-area-analysis-v2')
    assert.equal(payload.image_policy.mode, 'clear')
    assert.equal(payload.image_policy.max_cloud_cover, 10)
    assert.equal(payload.image_policy.preview_limit, 4)
    assert.ok(payload.preview_images.length <= 4)
    assert.ok(payload.preview_images.some(item => item.scene_id === 'LC09_CLEAR'))
    assert.equal(payload.preview_images.some(item => item.scene_id === 'LC09_CLOUDY'), false)
    assert.equal(payload.landsat_catalog.matched, 777)
    assert.match(payload.landsat_catalog.full_catalog_url, /landsatlook\.usgs\.gov/)
    assert.match(payload.landsat_catalog.all_years_catalog_url, /1972-01-01/)
    assert.match(payload.evidence_policy, /clear-imagery preference/)
    assert.equal(JSON.stringify(payload).includes('test-secret-not-real'), false)
    assert.equal(upstreams.filter(item => item === 'https://api.openai.com/v1/responses').length, 1)
    assert.equal(upstreams.some(item => item.startsWith('https://gibs.earthdata.nasa.gov/')), false)

    const sentinelRequest = upstreams.find(item => item.startsWith('https://sh.dataspace.copernicus.eu/ogc/wms/'))
    assert.ok(sentinelRequest)
    const sentinelUrl = new URL(sentinelRequest)
    assert.equal(sentinelUrl.searchParams.get('WIDTH'), '2048')
    assert.equal(sentinelUrl.searchParams.get('HEIGHT'), '2048')
    assert.equal(sentinelUrl.searchParams.get('MAXCC'), '10')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('all imagery mode keeps NASA temporal context but remains bounded', async () => {
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
      assert.ok(images.length > 4)
      assert.ok(images.length <= 8)
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
      body: JSON.stringify({
        latitude: 53.59,
        longitude: 19.01,
        radius_km: 25,
        start_date: '2000-01-01',
        end_date: '2026-08-20',
        depth: 'deep',
        place_name: 'test',
        image_mode: 'all',
        max_cloud_cover: 100,
        preview_limit: 4,
      }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.image_policy.mode, 'all')
    assert.ok(payload.preview_images.length <= 4)
    assert.ok(upstreams.some(item => item.startsWith('https://gibs.earthdata.nasa.gov/')))
    const sentinelRequest = upstreams.find(item => item.startsWith('https://sh.dataspace.copernicus.eu/ogc/wms/'))
    assert.ok(sentinelRequest)
    const parsed = new URL(sentinelRequest)
    assert.equal(parsed.searchParams.get('WIDTH'), '2048')
    assert.equal(parsed.searchParams.get('HEIGHT'), '2048')
    assert.equal(parsed.searchParams.get('MAXCC'), '100')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('invalid Copernicus response is skipped while a verified low-cloud Landsat browse still supports analysis', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    if (target.startsWith('https://landsatlook.usgs.gov/')) {
      return new Response(JSON.stringify({
        numberMatched: 1,
        features: [landsatScene({ id: 'LC09_VALID', date: '2026-08-10', cloud: 2.1, url: 'https://example.usgs.gov/valid.jpg' })],
      }), { status: 200 })
    }
    if (target === 'https://example.usgs.gov/valid.jpg') return imageResponse()
    if (target.startsWith('https://sh.dataspace.copernicus.eu/')) {
      return new Response('<ServiceException>Invalid instance</ServiceException>', { status: 200, headers: { 'Content-Type': 'text/xml' } })
    }
    if (target === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body)
      const images = body.input[0].content.filter(item => item.type === 'input_image')
      assert.equal(images.length, 1)
      assert.ok(images[0].image_url.startsWith('data:image/jpeg;base64,'))
      return new Response(JSON.stringify({ output_text: JSON.stringify(validAnalysis()) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`unexpected upstream ${target}`)
  }

  try {
    const response = await handleWorkerRequest(new Request('https://worker.example/research/analyze', {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 22.72438, longitude: 32.10533, radius_km: 25, start_date: '2025-01-01', end_date: '2026-08-20', depth: 'quick', place_name: 'Nil, Egipt' }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.ai_visual_image_count, 1)
    assert.ok(payload.visual_preflight_warnings.some(item => item.includes('Copernicus Data Space')))
    assert.equal(payload.preview_images.some(item => item.source.includes('Copernicus Data Space')), false)
    assert.ok(payload.preview_images.some(item => item.scene_id === 'LC09_VALID'))
  } finally {
    globalThis.fetch = originalFetch
  }
})
