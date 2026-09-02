import assert from 'node:assert/strict'
import test from 'node:test'

import { handleYearlyGallery, YEARLY_GALLERY_PATH } from '../src/areaAnalysisWithLandsatBrowse.js'

const origin = 'https://terraforming-planet.github.io'

function landsatScene(year, suffix, cloud) {
  return {
    id: `LT05_${year}_${suffix}`,
    properties: {
      datetime: `${year}-07-${suffix}T09:42:00Z`,
      platform: 'LANDSAT_5',
      'eo:cloud_cover': cloud,
    },
    assets: {
      thumbnail: {
        href: `https://landsatlook.usgs.gov/data/${year}-${suffix}.jpg`,
        type: 'image/jpeg',
        roles: ['thumbnail'],
      },
    },
  }
}

test('yearly gallery returns exactly one verified slot for every explicitly requested year', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, options = {}) => {
    if (options.method === 'HEAD') return new Response(null, { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
    const url = new URL(String(input))
    const match = url.searchParams.get('datetime')?.match(/(2005|2006)-/)
    const year = Number(match?.[1] ?? 2005)
    return new Response(JSON.stringify({
      features: [
        landsatScene(year, '10', 44),
        landsatScene(year, '22', 4),
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/geo+json' } })
  }

  try {
    const request = new Request(`https://worker.example${YEARLY_GALLERY_PATH}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: 7.98,
        longitude: 49.81,
        radius_km: 25,
        years: [2005, 2006],
        season: 'summer',
        cloud_mode: 'clear',
      }),
    })
    const response = await handleYearlyGallery(request)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(payload.requested_years, [2005, 2006])
    assert.equal(payload.slots.length, 2)
    assert.deepEqual(payload.slots.map(slot => slot.year), [2005, 2006])
    assert.ok(payload.slots.every(slot => slot.status === 'image'))
    assert.ok(payload.slots.every(slot => slot.image.cloud_cover === 4))
    assert.ok(payload.slots.every(slot => slot.image.url.startsWith('https://worker.example/research/image?')))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('yearly gallery replaces a redirecting Landsat browse with a renderable NASA GIBS fallback', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, options = {}) => {
    if (options.method === 'HEAD') return new Response(null, { status: 302, headers: { Location: 'https://example.invalid/login' } })
    return new Response(JSON.stringify({ features: [landsatScene(2005, '22', 4)] }), {
      status: 200,
      headers: { 'Content-Type': 'application/geo+json' },
    })
  }
  try {
    const response = await handleYearlyGallery(new Request(`https://worker.example${YEARLY_GALLERY_PATH}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 53.59, longitude: 19.01, radius_km: 2, years: [2005], season: 'summer', cloud_mode: 'clear' }),
    }))
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.slots[0].status, 'image')
    assert.equal(payload.slots[0].image.asset_kind, 'NASA_GIBS_AOI_FALLBACK')
    assert.match(payload.slots[0].warning, /not directly renderable/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('yearly gallery serves 30 m AOI imagery for supported WELD and HLS years', async () => {
  const originalFetch = globalThis.fetch
  let stacCalls = 0
  globalThis.fetch = async () => {
    stacCalls += 1
    return new Response(JSON.stringify({
      features: [{
        ...landsatScene(2020, '18', 2),
        properties: { datetime: '2020-09-18T09:42:00Z', platform: 'LANDSAT_8', 'eo:cloud_cover': 2 },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/geo+json' } })
  }
  try {
    const response = await handleYearlyGallery(new Request(`https://worker.example${YEARLY_GALLERY_PATH}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 53.59, longitude: 19.01, radius_km: 2, years: [1990, 2020], season: 'autumn', cloud_mode: 'clear' }),
    }))
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(stacCalls, 1)
    assert.equal(payload.slots[0].image.asset_kind, 'NASA_WELD_30M_AOI')
    assert.equal(payload.slots[0].image.date, '1990-10-01')
    assert.equal(payload.slots[1].image.asset_kind, 'NASA_HLS_L30_AOI')
    assert.equal(payload.slots[1].image.date, '2020-09-18')
    assert.ok(payload.slots.every(slot => slot.image.aoi_cropped === true))
    assert.ok(payload.slots.every(slot => decodeURIComponent(slot.image.url).includes('gibs.earthdata.nasa.gov')))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('yearly gallery keeps an explicit missing slot when no official image is available', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ features: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/geo+json' },
  })
  try {
    const request = new Request(`https://worker.example${YEARLY_GALLERY_PATH}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: 15,
        longitude: -14,
        radius_km: 25,
        years: [1995],
        season: 'spring',
        cloud_mode: 'clear',
      }),
    })
    const response = await handleYearlyGallery(request)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.slots.length, 1)
    assert.equal(payload.slots[0].year, 1995)
    assert.equal(payload.slots[0].status, 'missing')
    assert.match(payload.slots[0].reason, /No browser-renderable Landsat image/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('yearly gallery rejects oversized batches so the client must stay progressive', async () => {
  const request = new Request(`https://worker.example${YEARLY_GALLERY_PATH}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      latitude: 0,
      longitude: 0,
      years: [2000, 2001, 2002, 2003, 2004, 2005, 2006],
      season: 'summer',
      cloud_mode: 'clear',
    }),
  })
  const response = await handleYearlyGallery(request)
  const payload = await response.json()
  assert.equal(response.status, 400)
  assert.match(payload.error, /years must contain 1 to 6 years/)
})
