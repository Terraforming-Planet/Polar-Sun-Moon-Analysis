import assert from 'node:assert/strict'
import test from 'node:test'

import { AREA_ANALYSIS_PATH, buildGibsImageUrl, handleAreaAnalysis, representativeGibsDates } from '../src/areaAnalysis.js'
import { GEOCODE_PATH, handleGeocodeProxy, parseGeocodeQuery } from '../src/geocodeProxy.js'
import { handleWorkerRequest } from '../src/entry.js'

const allowedOrigin = 'https://terraforming-planet.github.io'
const env = { OPENAI_API_KEY: 'test-secret-not-real', OPENAI_MODEL: 'gpt-5.6-luna' }

test('geocode route accepts one short query and rejects extra fields', () => {
  assert.equal(parseGeocodeQuery(new URL('https://worker.example/research/geocode?q=Lake%20Nasser')), 'Lake Nasser')
  assert.throws(() => parseGeocodeQuery(new URL('https://worker.example/research/geocode?q=Lake&url=https://example.com')), /Unexpected query field/)
})

test('geocode proxy uses fixed Nominatim upstream and returns bounded results', async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''
  globalThis.fetch = async url => {
    requestedUrl = String(url)
    return new Response(JSON.stringify([
      { display_name: 'Lake Nasser, Egypt', lat: '22.5', lon: '31.8', type: 'water', category: 'natural' },
      { display_name: 'second', lat: '10', lon: '20', type: 'place', category: 'place' },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const response = await handleGeocodeProxy(new Request(`https://worker.example${GEOCODE_PATH}?q=Lake%20Nasser`, {
      headers: { Origin: allowedOrigin },
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.match(requestedUrl, /^https:\/\/nominatim\.openstreetmap\.org\/search\?/)
    assert.equal(payload.results[0].display_name, 'Lake Nasser, Egypt')
    assert.equal(JSON.stringify(payload).includes('test-secret-not-real'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('GIBS sampling uses at most 10 images for quick scan and more for deep analysis', () => {
  const quick = representativeGibsDates('1990-01-01', '2026-08-20', 'quick')
  const deep = representativeGibsDates('1990-01-01', '2026-08-20', 'deep')
  assert.ok(quick.length <= 10)
  assert.ok(deep.length > quick.length)
  assert.equal(quick[0] >= '2000-02-24', true)
  const url = buildGibsImageUrl(22.5, 31.8, 25, quick[0])
  assert.match(url, /^https:\/\/gibs\.earthdata\.nasa\.gov\/wms\/epsg4326\/best\/wms\.cgi\?/)
  assert.match(url, /MODIS_Terra_CorrectedReflectance_TrueColor/)
})

test('area analysis sends only fixed NASA image URLs and fixed USGS catalogue metadata to OpenAI', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    requests.push({ target, options })
    if (target.startsWith('https://landsatlook.usgs.gov/')) {
      return new Response(JSON.stringify({
        numberMatched: 122,
        features: [{
          id: 'LC09_TEST',
          properties: { datetime: '2026-05-20T08:00:00Z', platform: 'LANDSAT_9', 'eo:cloud_cover': 1.2 },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/geo+json' } })
    }
    if (target === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body)
      const images = body.input[0].content.filter(item => item.type === 'input_image')
      assert.ok(images.length > 0 && images.length <= 10)
      assert.ok(images.every(item => item.image_url.startsWith('https://gibs.earthdata.nasa.gov/')))
      assert.equal(body.model, 'gpt-5.6-luna')
      assert.match(body.instructions, /Never invent measurements/)
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          headline: 'Widoczny zbiornik wodny i zmiany wymagające dalszej kontroli.',
          what_is_visible: 'Na dostarczonych obrazach widać powierzchnię wody i otaczający teren.',
          change_over_time: 'Próbki pokazują różnice między terminami, ale nie uzasadniają automatycznie przyczyny.',
          water_assessment: 'Woda jest widoczna; do silniejszego wniosku potrzebna jest spójna seria wieloletnia.',
          notable_features: ['zmienność widocznej linii brzegowej'],
          confidence: { level: 'medium', reason: 'Dostępna jest seria kilku obrazów i metadane katalogowe.' },
          limitations: ['Rozdzielczość i zachmurzenie ograniczają interpretację.'],
          recommended_next_step: 'Uruchomić głębszą analizę wieloletnią i porównać matched-season imagery.',
        }),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`unexpected upstream ${target}`)
  }

  try {
    const response = await handleAreaAnalysis(new Request(`https://worker.example${AREA_ANALYSIS_PATH}`, {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: 22.5,
        longitude: 31.8,
        radius_km: 25,
        start_date: '1990-01-01',
        end_date: '2026-08-20',
        depth: 'quick',
        place_name: 'Lake Nasser',
      }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.preview_images.length <= 10, true)
    assert.equal(payload.landsat_catalog.matched, 122)
    assert.match(payload.landsat_catalog.full_catalog_url, /^https:\/\/landsatlook\.usgs\.gov\//)
    assert.equal(payload.analysis.confidence.level, 'medium')
    assert.equal(JSON.stringify(payload).includes('test-secret-not-real'), false)
    assert.equal(requests.filter(item => item.target === 'https://api.openai.com/v1/responses').length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('router exposes research routes without changing fixed evidence routes', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async url => {
    if (String(url).startsWith('https://nominatim.openstreetmap.org/')) return new Response('[]', { status: 200 })
    throw new Error('unexpected upstream')
  }
  try {
    const geocode = await handleWorkerRequest(new Request(`https://worker.example${GEOCODE_PATH}?q=test`, { headers: { Origin: allowedOrigin } }), env)
    assert.equal(geocode.status, 200)
    const health = await handleWorkerRequest(new Request('https://worker.example/health'), env)
    assert.equal(health.status, 200)
  } finally {
    globalThis.fetch = originalFetch
  }
})
