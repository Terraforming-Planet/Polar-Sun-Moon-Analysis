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

test('yearly gallery returns exactly one slot for every explicitly requested year', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    const match = url.searchParams.get('datetime')?.match(/(2001|2002)-/)
    const year = Number(match?.[1] ?? 2001)
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
        years: [2001, 2002],
        season: 'summer',
        cloud_mode: 'clear',
      }),
    })
    const response = await handleYearlyGallery(request)
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(payload.requested_years, [2001, 2002])
    assert.equal(payload.slots.length, 2)
    assert.deepEqual(payload.slots.map(slot => slot.year), [2001, 2002])
    assert.ok(payload.slots.every(slot => slot.status === 'image'))
    assert.ok(payload.slots.every(slot => slot.image.cloud_cover === 4))
    assert.ok(payload.slots.every(slot => slot.image.url.startsWith('https://worker.example/research/image?')))
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
    assert.match(payload.slots[0].reason, /Brak/)
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
