import assert from 'node:assert/strict'
import test from 'node:test'

import { handleScaleLockedTerrainStudy } from '../src/scaleLockedTerrainStudy.js'

const origin = 'https://terraforming-planet.github.io'
const originalFetch = globalThis.fetch

function request(body) {
  return new Request('https://worker.example/research/terrain-study', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function feature({ id, datetime, cloud }) {
  return {
    id,
    properties: { datetime, platform: 'landsat-8', 'eo:cloud_cover': cloud },
    assets: {
      thumbnail: { href: `https://landsatlook.usgs.gov/data/${id}-thumb.jpg`, type: 'image/jpeg', roles: ['thumbnail'] },
      browse: { href: `https://landsatlook.usgs.gov/data/${id}-browse.jpg`, type: 'image/jpeg', title: 'Full Resolution Browse' },
    },
  }
}

function installStac(features) {
  globalThis.fetch = async url => {
    if (String(url).includes('landsatlook.usgs.gov')) {
      return new Response(JSON.stringify({ type: 'FeatureCollection', features }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`Unexpected fetch ${url}`)
  }
}

test.afterEach(() => { globalThis.fetch = originalFetch })

test('recent study replaces mixed/native framing with one Sentinel scale-locked render', async () => {
  installStac([
    feature({ id: 'CLEAR-2024', datetime: '2024-04-18T10:00:00Z', cloud: 3 }),
  ])
  const response = await handleScaleLockedTerrainStudy(request({
    latitude: 37.0585,
    longitude: -111.2886,
    radius_km: 25,
    view_height_km: 100,
    years: [2024],
    season: 'spring',
    mode: 'study',
  }))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.requested_scale_km, 100)
  assert.equal(payload.scale_locked, true)
  assert.equal(payload.slots[0].analysis_image.scale_locked, true)
  assert.equal(payload.slots[0].analysis_image.requested_scale_km, 100)
  assert.equal(payload.slots[0].analysis_image.actual_scale_km, 100)
  assert.match(payload.slots[0].analysis_image.source, /Sentinel-2.*scale-locked/i)
  assert.match(payload.slots[0].analysis_image.original_full_url, /MAXCC=10/)
})

test('exact mode preserves the original acquisition and explicitly disables scale lock', async () => {
  installStac([
    feature({ id: 'EXACT-CLOUDY', datetime: '2024-04-15T12:01:00Z', cloud: 83 }),
    feature({ id: 'CLEAR-LATER', datetime: '2024-04-15T18:00:00Z', cloud: 1 }),
  ])
  const response = await handleScaleLockedTerrainStudy(request({
    latitude: 37.0585,
    longitude: -111.2886,
    radius_km: 25,
    view_height_km: 100,
    mode: 'exact',
    exact_utc: '2024-04-15T12:00:00Z',
  }))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.scale_locked, false)
  assert.equal(payload.original_image.scene_id, 'EXACT-CLOUDY')
  assert.equal(payload.original_image.cloud_cover, 83)
})
