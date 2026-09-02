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
    hydrology_screening: {
      water_change_state: 'INSUFFICIENT_EVIDENCE',
      temporal_basis: 'The supplied dates are not a complete matched-season series.',
      inflow_outflow_status: 'VISIBLE_CANDIDATES',
      candidate_features: ['water channel candidate near the visible waterbody'],
      main_and_tributary_context: 'The main waterbody is visible, but tributary connectivity and flow direction are not established.',
      required_checks: ['Verify official hydrography and DEM flow direction.', 'Measure inlet and outlet discharge in the field.'],
      cause_status: 'NOT_ESTABLISHED_FROM_SUPPLIED_EVIDENCE',
      visible_water_extrema: {
        status: 'INSUFFICIENT_EVIDENCE',
        most_visible_water_year: null,
        least_visible_water_year: null,
        compared_years: [],
        method: 'QUALITATIVE_VISUAL_RANKING_OF_SUPPLIED_IMAGES',
        basis: 'The supplied dates are not sufficiently comparable to rank visible water.',
      },
    },
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
      assert.match(body.instructions, /main channel or waterbody together with side tributaries/i)
      assert.match(body.instructions, /most and least visible open-water extent/i)
      assert.match(body.instructions, /TP26 is the project's multisensor evidence-orchestration protocol/i)
      assert.ok(body.text.format.schema.required.includes('hydrology_screening'))
      assert.ok(body.text.format.schema.properties.hydrology_screening.required.includes('visible_water_extrema'))
      const metadataText = body.input[0].content.find(item => item.type === 'input_text').text
      assert.match(metadataText, /unique_real_scientific_pairs/)
      assert.match(metadataText, /AUDIT_PROTOCOL_ONLY_NOT_RUNTIME_CHECKPOINT/)
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
    assert.equal(payload.analysis.hydrology_screening.cause_status, 'NOT_ESTABLISHED_FROM_SUPPLIED_EVIDENCE')
    assert.equal(payload.analysis.hydrology_screening.visible_water_extrema.status, 'INSUFFICIENT_EVIDENCE')
    assert.equal(payload.tp26_protocol.schema, 'tp26-multisensor-water-extrema-v1')
    assert.equal(payload.tp26_protocol.source_ladder.find(item => item.source.includes('Sentinel-1')).runtime_state, 'RECOMMENDED_CROSS_CHECK_NOT_FETCHED_BY_THIS_ROUTE')
    assert.equal(payload.analysis_protocol.training_4.unique_real_scientific_pairs, 95)
    assert.equal(payload.analysis_protocol.training_4.checkpoint_loaded_by_worker, false)
    assert.equal(JSON.stringify(payload).includes('test-secret-not-real'), false)
    assert.equal(upstreams.filter(item => item === 'https://api.openai.com/v1/responses').length, 1)

    const nasaRequests = upstreams.filter(item => item.startsWith('https://gibs.earthdata.nasa.gov/'))
    assert.ok(nasaRequests.length > 0)
    for (const item of nasaRequests) {
      const parsed = new URL(item)
      assert.equal(parsed.searchParams.get('WIDTH'), '1400')
      assert.equal(parsed.searchParams.get('HEIGHT'), '1400')
    }
    const sentinelRequests = upstreams.filter(item => item.startsWith('https://sh.dataspace.copernicus.eu/ogc/wms/'))
    assert.equal(sentinelRequests.length, 2)
    assert.ok(sentinelRequests.some(item => new URL(item).searchParams.get('TIME') === '2026-08-06/2026-08-20'))
    for (const item of sentinelRequests) {
      const sentinelUrl = new URL(item)
      assert.equal(sentinelUrl.searchParams.get('WIDTH'), '1600')
      assert.equal(sentinelUrl.searchParams.get('HEIGHT'), '1600')
    }
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
    const sentinelRequests = upstreams.filter(item => item.startsWith('https://sh.dataspace.copernicus.eu/ogc/wms/'))
    assert.equal(sentinelRequests.length, 4)
    for (const item of sentinelRequests) {
      const parsed = new URL(item)
      assert.equal(parsed.searchParams.get('WIDTH'), '2048')
      assert.equal(parsed.searchParams.get('HEIGHT'), '2048')
    }
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

test('TP26 gate refuses small-waterbody extrema when high-resolution years are unavailable', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    if (target.startsWith('https://landsatlook.usgs.gov/')) return new Response(JSON.stringify({ numberMatched: 10, features: [] }), { status: 200 })
    if (target.startsWith('https://gibs.earthdata.nasa.gov/')) return imageResponse()
    if (target.startsWith('https://sh.dataspace.copernicus.eu/')) {
      return new Response('<ServiceException>Authentication required</ServiceException>', { status: 200, headers: { 'Content-Type': 'text/xml' } })
    }
    if (target === 'https://api.openai.com/v1/responses') {
      const analysis = validAnalysis()
      analysis.hydrology_screening.visible_water_extrema = {
        status: 'ESTABLISHED',
        most_visible_water_year: 2020,
        least_visible_water_year: 2025,
        compared_years: [2020, 2025],
        method: 'QUALITATIVE_VISUAL_RANKING_OF_SUPPLIED_IMAGES',
        basis: 'The coarse images appear different.',
      }
      return new Response(JSON.stringify({ output_text: JSON.stringify(analysis) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`unexpected upstream ${target}`)
  }

  try {
    const response = await handleWorkerRequest(new Request('https://worker.example/research/analyze', {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 53.5914, longitude: 19.010717, radius_km: 2, start_date: '2020-09-01', end_date: '2026-09-01', depth: 'quick', place_name: 'TEST 001' }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.water_extrema_readiness.status, 'INSUFFICIENT_RANKING_ELIGIBLE_YEARS')
    assert.equal(payload.analysis.hydrology_screening.visible_water_extrema.status, 'INSUFFICIENT_EVIDENCE')
    assert.equal(payload.analysis.hydrology_screening.visible_water_extrema.most_visible_water_year, null)
    assert.equal(payload.analysis.hydrology_screening.visible_water_extrema.least_visible_water_year, null)
    assert.match(payload.analysis.hydrology_screening.visible_water_extrema.basis, /TP26 gate/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('TP26 gate refuses a coarse-image year regardless of the selected AOI radius', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const target = String(url)
    if (target.startsWith('https://landsatlook.usgs.gov/')) return new Response(JSON.stringify({ numberMatched: 10, features: [] }), { status: 200 })
    if (target.startsWith('https://gibs.earthdata.nasa.gov/') || target.startsWith('https://sh.dataspace.copernicus.eu/')) return imageResponse()
    if (target === 'https://api.openai.com/v1/responses') {
      const analysis = validAnalysis()
      analysis.hydrology_screening.visible_water_extrema = {
        status: 'ESTABLISHED',
        most_visible_water_year: 2000,
        least_visible_water_year: 2026,
        compared_years: [2000, 2015, 2026],
        method: 'QUALITATIVE_VISUAL_RANKING_OF_SUPPLIED_IMAGES',
        basis: 'The model included a coarse continuity year.',
      }
      return new Response(JSON.stringify({ output_text: JSON.stringify(analysis) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`unexpected upstream ${target}`)
  }

  try {
    const response = await handleWorkerRequest(new Request('https://worker.example/research/analyze', {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 53.5914, longitude: 19.010717, radius_km: 12, start_date: '2000-09-01', end_date: '2026-09-01', depth: 'deep', place_name: 'TEST 001' }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.analysis.hydrology_screening.visible_water_extrema.status, 'INSUFFICIENT_EVIDENCE')
    assert.equal(payload.analysis.hydrology_screening.visible_water_extrema.most_visible_water_year, null)
    assert.equal(payload.analysis.hydrology_screening.visible_water_extrema.least_visible_water_year, null)
    assert.ok(payload.analysis.hydrology_screening.visible_water_extrema.compared_years.every(year => year >= 2015))
    assert.match(payload.analysis.hydrology_screening.visible_water_extrema.basis, /Coarse MODIS\/VIIRS/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('TP26 gate retains a valid ranking from two high-resolution AOI years', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const target = String(url)
    if (target.startsWith('https://landsatlook.usgs.gov/')) return new Response(JSON.stringify({ numberMatched: 10, features: [] }), { status: 200 })
    if (target.startsWith('https://gibs.earthdata.nasa.gov/') || target.startsWith('https://sh.dataspace.copernicus.eu/')) return imageResponse()
    if (target === 'https://api.openai.com/v1/responses') {
      const analysis = validAnalysis()
      analysis.hydrology_screening.visible_water_extrema = {
        status: 'ESTABLISHED',
        most_visible_water_year: 2020,
        least_visible_water_year: 2026,
        compared_years: [2020, 2026],
        method: 'QUALITATIVE_VISUAL_RANKING_OF_SUPPLIED_IMAGES',
        basis: 'The same waterbody is interpretable in the two matched-season Sentinel-2 AOI images.',
      }
      return new Response(JSON.stringify({ output_text: JSON.stringify(analysis) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`unexpected upstream ${target}`)
  }

  try {
    const response = await handleWorkerRequest(new Request('https://worker.example/research/analyze', {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 53.5914, longitude: 19.010717, radius_km: 2, start_date: '2020-09-01', end_date: '2026-09-01', depth: 'quick', place_name: 'TEST 001' }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.water_extrema_readiness.status, 'MODEL_COMPARABILITY_GATE_APPLIED')
    assert.equal(payload.water_extrema_readiness.high_resolution_aoi_years, 2)
    assert.equal(payload.analysis.hydrology_screening.visible_water_extrema.status, 'ESTABLISHED')
    assert.equal(payload.analysis.hydrology_screening.visible_water_extrema.most_visible_water_year, 2020)
    assert.equal(payload.analysis.hydrology_screening.visible_water_extrema.least_visible_water_year, 2026)
    assert.deepEqual(payload.analysis.hydrology_screening.visible_water_extrema.compared_years, [2020, 2026])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Sentinel sampling omits a 2015 seasonal window that predates the mission', async () => {
  const originalFetch = globalThis.fetch
  const sentinelRequests = []
  globalThis.fetch = async (url) => {
    const target = String(url)
    if (target.startsWith('https://landsatlook.usgs.gov/')) return new Response(JSON.stringify({ numberMatched: 10, features: [] }), { status: 200 })
    if (target.startsWith('https://sh.dataspace.copernicus.eu/')) {
      sentinelRequests.push(target)
      return imageResponse()
    }
    if (target.startsWith('https://gibs.earthdata.nasa.gov/')) return imageResponse()
    if (target === 'https://api.openai.com/v1/responses') {
      return new Response(JSON.stringify({ output_text: JSON.stringify(validAnalysis()) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`unexpected upstream ${target}`)
  }

  try {
    const response = await handleWorkerRequest(new Request('https://worker.example/research/analyze', {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 53.5914, longitude: 19.010717, radius_km: 2, start_date: '2015-03-01', end_date: '2016-05-31', depth: 'quick', place_name: 'TEST 001' }),
    }), env)
    assert.equal(response.status, 200)
    assert.equal(sentinelRequests.length, 1)
    assert.match(new URL(sentinelRequests[0]).searchParams.get('TIME'), /^2016-/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
