import assert from 'node:assert/strict'
import test from 'node:test'

import { handleWorkerRequest } from '../src/entry.js'

const allowedOrigin = 'https://terraforming-planet.github.io'
const env = { OPENAI_API_KEY: 'test-secret-not-real' }
const imageResponse = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
  status: 200,
  headers: { 'Content-Type': 'image/jpeg' },
})
const pngResponse = () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
  status: 200,
  headers: { 'Content-Type': 'image/png' },
})

function cmrResponseFor(target, { empty = false } = {}) {
  const temporal = new URL(target).searchParams.get('temporal') ?? ''
  const date = temporal.slice(0, 10)
  const year = Number(date.slice(0, 4))
  return new Response(JSON.stringify({
    feed: {
      entry: empty ? [] : [{
        producer_granule_id: `HLS.S30.TEST.${year}`,
        time_start: `${date}T10:00:00Z`,
        cloud_cover: '3',
        id: `G-${year}-TEST`,
      }],
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function validAnalysis() {
  return {
    headline: 'Detailed test terrain analysis.',
    what_is_visible: 'The supplied images show terrain, water and differences in surface cover.',
    change_over_time: 'Dated NASA samples show differences between years; HLS provides newer higher-detail context.',
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
    regional_patrol_assessment: {
      status: 'NOT_REQUESTED',
      overview: 'Regional patrol was not requested.',
      inspected_tile_ids: [],
      tiles_with_visible_open_water: [],
      tiles_with_wetland_or_wet_soil: [],
      tiles_with_possible_channel: [],
      tiles_with_cloud_shadow_or_no_data: [],
      tile_findings: [],
      limitations: [],
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
    if (target.startsWith('https://cmr.earthdata.nasa.gov/')) return cmrResponseFor(target)
    if (target.startsWith('https://gibs.earthdata.nasa.gov/')) {
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
      assert.ok(body.text.format.schema.required.includes('regional_patrol_assessment'))
      assert.ok(body.text.format.schema.properties.hydrology_screening.required.includes('visible_water_extrema'))
      const metadataText = body.input[0].content.find(item => item.type === 'input_text').text
      assert.match(metadataText, /unique_real_scientific_pairs/)
      assert.match(metadataText, /AUDIT_PROTOCOL_ONLY_NOT_RUNTIME_CHECKPOINT/)
      assert.match(metadataText, /ORIGINAL_OFFICIAL_SATELLITE_PRODUCTS_ONLY/)
      assert.match(metadataText, /"derived_model_inputs":0/)
      assert.match(metadataText, /"ai_generated_model_inputs":0/)
      const images = body.input[0].content.filter(item => item.type === 'input_image')
      assert.ok(images.length >= 2)
      assert.ok(images.length <= 4)
      assert.ok(images.every(item => /^data:image\/(?:jpeg|png);base64,/.test(item.image_url)))
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
    assert.ok(payload.preview_images.some(item => item.source.includes('HLS S30')))
    assert.ok(payload.preview_images.some(item => item.source.includes('WELD')))
    assert.ok(payload.analysis_images.every(item => item.image_authenticity === 'ORIGINAL_OFFICIAL_SATELLITE_PRODUCT'))
    assert.ok(payload.analysis_images.every(item => item.ai_generated === false && item.used_as_model_input === true))
    assert.ok(payload.derived_images.every(item => item.image_authenticity === 'DERIVED_ANALYTICAL_PRODUCT'))
    assert.ok(payload.derived_images.every(item => item.ai_generated === false && item.used_as_model_input === false))
    assert.equal(payload.imagery_authenticity_policy.original_model_input_count, payload.ai_visual_image_count)
    assert.equal(payload.imagery_authenticity_policy.derived_model_input_count, 0)
    assert.equal(payload.imagery_authenticity_policy.ai_generated_model_input_count, 0)
    assert.match(payload.evidence_policy, /original official satellite products only/i)
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
      const highResolution = /^(?:HLS_S30|Landsat_WELD|OPERA_L3)/.test(parsed.searchParams.get('LAYERS') ?? '')
      assert.equal(parsed.searchParams.get('WIDTH'), highResolution ? '1500' : '1400')
      assert.equal(parsed.searchParams.get('HEIGHT'), highResolution ? '1500' : '1400')
    }
    const cmrRequests = upstreams.filter(item => item.startsWith('https://cmr.earthdata.nasa.gov/'))
    assert.equal(cmrRequests.length, 2)
    assert.ok(cmrRequests.every(item => new URL(item).searchParams.get('short_name') === 'HLSS30'))
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
    if (target.startsWith('https://cmr.earthdata.nasa.gov/')) return cmrResponseFor(target)
    if (target.startsWith('https://gibs.earthdata.nasa.gov/')) return imageResponse()
    if (target === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body)
      assert.equal(body.max_output_tokens, 7000)
      const images = body.input[0].content.filter(item => item.type === 'input_image')
      assert.equal(images.length, 8)
      assert.ok(images.every(item => item.detail === 'high'))
      assert.ok(images.every(item => /^data:image\/(?:jpeg|png);base64,/.test(item.image_url)))
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
    assert.ok(payload.analysis_images.every(item => item.image_authenticity === 'ORIGINAL_OFFICIAL_SATELLITE_PRODUCT'))
    assert.equal(payload.imagery_authenticity_policy.derived_model_input_count, 0)
    assert.ok(payload.preview_images.length <= 8)
    const cmrRequests = upstreams.filter(item => item.startsWith('https://cmr.earthdata.nasa.gov/'))
    assert.equal(cmrRequests.length, 4)
    const highResolutionRequests = upstreams.filter(item => {
      if (!item.startsWith('https://gibs.earthdata.nasa.gov/')) return false
      const parsed = new URL(item)
      return /^(?:HLS_S30|Landsat_WELD|OPERA_L3)/.test(parsed.searchParams.get('LAYERS') ?? '')
    })
    assert.equal(highResolutionRequests.length, 6)
    for (const item of highResolutionRequests) {
      const parsed = new URL(item)
      assert.equal(parsed.searchParams.get('WIDTH'), '1800')
      assert.equal(parsed.searchParams.get('HEIGHT'), '1800')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('regional patrol adds twenty truthful 1 km samples without claiming full 20 km AOI coverage', async () => {
  const originalFetch = globalThis.fetch
  const upstreams = []
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    upstreams.push(target)
    if (target.startsWith('https://landsatlook.usgs.gov/')) return new Response(JSON.stringify({ numberMatched: 120, features: [] }), { status: 200 })
    if (target.startsWith('https://cmr.earthdata.nasa.gov/')) return cmrResponseFor(target)
    if (target.startsWith('https://gibs.earthdata.nasa.gov/')) return imageResponse()
    if (target === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body)
      const metadataText = body.input[0].content.find(item => item.type === 'input_text').text
      const images = body.input[0].content.filter(item => item.type === 'input_image')
      assert.equal(body.max_output_tokens, 9000)
      assert.equal(images.length, 24)
      assert.match(metadataText, /regional_patrol_request/)
      assert.match(metadataText, /REGIONAL_PATROL_TILE/)
      assert.match(metadataText, /"patrol_tile_id":"P20"/)
      assert.match(body.instructions, /do not clear uninspected gaps/i)
      const analysis = validAnalysis()
      const tileIds = Array.from({ length: 20 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`)
      analysis.regional_patrol_assessment = {
        status: 'COMPLETE_TILE_REVIEW',
        overview: 'All twenty supplied sparse patrol samples were reviewed.',
        inspected_tile_ids: tileIds,
        tiles_with_visible_open_water: ['P01'],
        tiles_with_wetland_or_wet_soil: ['P02'],
        tiles_with_possible_channel: ['P01', 'P02'],
        tiles_with_cloud_shadow_or_no_data: [],
        tile_findings: tileIds.map((tileId, index) => ({
          tile_id: tileId,
          surface_class: index === 0 ? 'OPEN_WATER' : 'VEGETATION',
          hydrology_feature: index === 0 ? 'MAIN_WATERBODY' : 'NONE_VISIBLE',
          observation: `${tileId} contains a visually screened surface sample.`,
          confidence: 'medium',
        })),
        limitations: ['One-date sparse screening only.'],
      }
      return new Response(JSON.stringify({ output_text: JSON.stringify(analysis) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`unexpected upstream ${target}`)
  }

  try {
    const response = await handleWorkerRequest(new Request('https://worker.example/research/analyze', {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: 12.775,
        longitude: 17.564,
        radius_km: 20,
        start_date: '2000-01-01',
        end_date: '2026-08-20',
        depth: 'deep',
        place_name: 'Lake Fitri',
        spatial_mode: 'regional-patrol',
        patrol_tile_count: 20,
        patrol_frame_width_km: 1,
      }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.regional_patrol.status, 'COMPLETE_SPARSE_SCREENING')
    assert.equal(payload.regional_patrol.requested_tiles, 20)
    assert.equal(payload.regional_patrol.inspected_tiles, 20)
    assert.equal(payload.regional_patrol.frame_width_km, 1)
    assert.equal(payload.regional_patrol.aoi_area_km2, 1256.64)
    assert.equal(payload.regional_patrol.nominal_coverage_upper_bound_percent, 1.59)
    assert.equal(payload.regional_patrol.full_coverage, false)
    assert.equal(payload.regional_patrol.temporal_change_supported_by_patrol_alone, false)
    assert.equal(payload.analysis.regional_patrol_assessment.status, 'COMPLETE_TILE_REVIEW')
    assert.equal(payload.analysis.regional_patrol_assessment.tile_findings.length, 20)
    assert.equal(payload.regional_patrol.tile_manifest.length, 20)
    assert.ok(payload.regional_patrol.tile_manifest.every(item => item.status === 'INSPECTED_BY_MODEL'))
    assert.equal(payload.analysis_images.filter(item => item.evidence_role === 'REGIONAL_PATROL_TILE').length, 20)
    assert.ok(payload.analysis_images.every(item => item.image_authenticity === 'ORIGINAL_OFFICIAL_SATELLITE_PRODUCT'))
    assert.equal(payload.imagery_authenticity_policy.ai_generated_model_input_count, 0)

    const patrolRequests = upstreams.filter(item => {
      if (!item.startsWith('https://gibs.earthdata.nasa.gov/')) return false
      const parsed = new URL(item)
      return parsed.searchParams.get('WIDTH') === '640' && parsed.searchParams.get('LAYERS') === 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance'
    })
    assert.equal(patrolRequests.length, 20)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('failed NASA CMR HLS discovery is reported without breaking coarse NASA fallback analysis', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    if (target.startsWith('https://landsatlook.usgs.gov/')) return new Response(JSON.stringify({ numberMatched: 0, features: [] }), { status: 200 })
    if (target.startsWith('https://cmr.earthdata.nasa.gov/')) return new Response('temporarily unavailable', { status: 503 })
    if (target.startsWith('https://gibs.earthdata.nasa.gov/')) return imageResponse()
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
    assert.ok(payload.visual_preflight_warnings.some(item => item.includes('NASA CMR HLS')))
    assert.equal(payload.preview_images.some(item => item.source.includes('HLS S30')), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('TP26 gate refuses small-waterbody extrema when high-resolution years are unavailable', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    if (target.startsWith('https://landsatlook.usgs.gov/')) return new Response(JSON.stringify({ numberMatched: 10, features: [] }), { status: 200 })
    if (target.startsWith('https://cmr.earthdata.nasa.gov/')) return cmrResponseFor(target, { empty: true })
    if (target.startsWith('https://gibs.earthdata.nasa.gov/')) return imageResponse()
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
    if (target.startsWith('https://cmr.earthdata.nasa.gov/')) return cmrResponseFor(target, { empty: true })
    if (target.startsWith('https://gibs.earthdata.nasa.gov/')) return imageResponse()
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
      body: JSON.stringify({ latitude: 53.5914, longitude: 19.010717, radius_km: 12, start_date: '2000-09-01', end_date: '2026-09-01', depth: 'deep', season: 'autumn', place_name: 'TEST 001' }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.analysis.hydrology_screening.visible_water_extrema.status, 'INSUFFICIENT_EVIDENCE')
    assert.equal(payload.analysis.hydrology_screening.visible_water_extrema.most_visible_water_year, null)
    assert.equal(payload.analysis.hydrology_screening.visible_water_extrema.least_visible_water_year, null)
    assert.deepEqual(payload.analysis.hydrology_screening.visible_water_extrema.compared_years, [2000])
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
    if (target.startsWith('https://cmr.earthdata.nasa.gov/')) return cmrResponseFor(target)
    if (target.startsWith('https://gibs.earthdata.nasa.gov/')) return imageResponse()
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

test('HLS Sentinel-2 sampling omits a 2015 spring window that predates HLS S30 coverage', async () => {
  const originalFetch = globalThis.fetch
  const cmrRequests = []
  globalThis.fetch = async (url) => {
    const target = String(url)
    if (target.startsWith('https://landsatlook.usgs.gov/')) return new Response(JSON.stringify({ numberMatched: 10, features: [] }), { status: 200 })
    if (target.startsWith('https://cmr.earthdata.nasa.gov/')) {
      cmrRequests.push(target)
      return cmrResponseFor(target)
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
    assert.equal(cmrRequests.length, 1)
    assert.match(new URL(cmrRequests[0]).searchParams.get('temporal'), /^2016-/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('TEST 001 uses the corrected 500 m frame and pins the same-target evidence pair', async () => {
  const originalFetch = globalThis.fetch
  const upstreams = []
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    upstreams.push(target)
    if (target.startsWith('https://landsatlook.usgs.gov/')) {
      return new Response(JSON.stringify({ numberMatched: 73, features: [] }), { status: 200 })
    }
    if (target.startsWith('https://cmr.earthdata.nasa.gov/')) return cmrResponseFor(target, { empty: true })
    if (target.startsWith('https://gibs.earthdata.nasa.gov/')) return imageResponse()
    if (target.startsWith('https://raw.githubusercontent.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/')) return pngResponse()
    if (target === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body)
      const metadataText = body.input[0].content.find(item => item.type === 'input_text').text
      assert.match(metadataText, /EXACT corrected forest-pond target/i)
      assert.doesNotMatch(metadataText, /CURATED_TEST001_FIXED_CROP_HISTORICAL_OVERLAY/)
      assert.match(metadataText, /ORIGINAL_OFFICIAL_SATELLITE_PRODUCTS_ONLY/)
      assert.match(metadataText, /NEAR_TOTAL_HISTORICAL_OPEN_WATER_STATE_TRANSITION_STRONGLY_SUPPORTED/)
      const images = body.input[0].content.filter(item => item.type === 'input_image')
      assert.ok(images.length >= 2)
      assert.ok(images.length <= 8)
      return new Response(JSON.stringify({ output_text: JSON.stringify(validAnalysis()) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`unexpected upstream ${target}`)
  }

  try {
    const response = await handleWorkerRequest(new Request('https://worker.example/research/analyze', {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: 53.5914,
        longitude: 19.010717,
        radius_km: 2,
        focus_latitude: 53.594595,
        focus_longitude: 19.00014,
        focus_radius_km: 0.25,
        case_id: 'test-001-forest-pond-kuchnia',
        start_date: '1990-09-01',
        end_date: '2026-09-01',
        depth: 'deep',
        season: 'autumn',
        place_name: 'TEST 001',
      }),
    }), env)
    const payload = await response.json()
    assert.equal(response.status, 200, JSON.stringify(payload))
    assert.deepEqual(payload.visual_focus, {
      latitude: 53.594595,
      longitude: 19.00014,
      radius_km: 0.25,
      frame_width_m: 500,
      purpose: 'EXACT_TEST001_POND_REGISTRATION',
      native_resolution_unchanged: true,
    })
    assert.equal(payload.test001_focus_evidence.historical_visible_footprint.central_ha, 1.7722)
    assert.equal(payload.test001_focus_evidence.recorded_year_ranking.most_visible_historical_component_year, 2008)
    assert.equal(payload.test001_focus_evidence.recorded_year_ranking.least_visible_endpoint_year, 2026)
    assert.equal(payload.test001_focus_evidence.state_change.exact_2026_open_water_area_m2, null)
    assert.equal(payload.test001_focus_evidence.state_change.cause_status, 'NOT_ESTABLISHED')
    assert.match(payload.analysis.headline, /near-total disappearance/i)
    assert.equal(payload.analysis.hydrology_screening.water_change_state, 'VISIBLE_WATER_REDUCTION_CANDIDATE')
    assert.ok(payload.analysis_images.every(item => item.image_authenticity === 'ORIGINAL_OFFICIAL_SATELLITE_PRODUCT'))
    assert.ok(payload.analysis_images.every(item => !String(item.evidence_role).startsWith('CURATED_TEST001_FIXED_CROP')))
    assert.ok(payload.derived_images.some(item => item.evidence_role === 'CURATED_TEST001_FIXED_CROP_HISTORICAL_OVERLAY'))
    assert.ok(payload.derived_images.some(item => item.evidence_role === 'CURATED_TEST001_FIXED_CROP_RECENT_OVERLAY'))
    assert.ok(payload.derived_images.every(item => item.used_as_model_input === false))
    assert.equal(payload.imagery_authenticity_policy.derived_model_input_count, 0)
    assert.equal(payload.imagery_authenticity_policy.ai_generated_model_input_count, 0)
    assert.equal(payload.test001_focus_evidence.source_original_images.length, 2)
    assert.ok(payload.test001_focus_evidence.source_original_images.every(item => item.image_authenticity === 'ORIGINAL_OFFICIAL_SATELLITE_PRODUCT'))
    assert.ok(payload.test001_focus_evidence.comparison_images.every(item => item.image_authenticity === 'DERIVED_ANALYTICAL_PRODUCT'))
    assert.equal(upstreams.filter(item => item.includes('2000_historical_consensus_overlay.png')).length, 0)
    assert.equal(upstreams.filter(item => item.includes('2026_historical_consensus_on_recent_basin.png')).length, 0)

    const detailedWmsRequests = upstreams.filter(item => {
      if (!item.startsWith('https://gibs.earthdata.nasa.gov/')) return false
      return /^(?:HLS_S30|Landsat_WELD|OPERA_L3)/.test(new URL(item).searchParams.get('LAYERS') ?? '')
    })
    assert.ok(detailedWmsRequests.length > 0)
    for (const item of detailedWmsRequests) {
      const [west, south, east, north] = (new URL(item).searchParams.get('BBOX') ?? '').split(',').map(Number)
      const widthKm = (east - west) * 111.32 * Math.cos(53.594595 * Math.PI / 180)
      const heightKm = (north - south) * 111.32
      assert.ok(Math.abs(widthKm - 0.5) < 0.01)
      assert.ok(Math.abs(heightKm - 0.5) < 0.01)
      assert.ok(Math.abs(((west + east) / 2) - 19.00014) < 0.000001)
      assert.ok(Math.abs(((south + north) / 2) - 53.594595) < 0.000001)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})
