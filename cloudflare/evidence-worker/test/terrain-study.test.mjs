import assert from 'node:assert/strict'
import test from 'node:test'

import { handleTerrainStudy } from '../src/terrainStudy.js'

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

test('terrain study selects <=10% cloud scene while preserving the nearest original scene separately', async () => {
  installStac([
    feature({ id: 'CLOUDY-REFERENCE', datetime: '2020-07-15T10:00:00Z', cloud: 62 }),
    feature({ id: 'CLEAR-STUDY', datetime: '2020-07-22T10:00:00Z', cloud: 4 }),
  ])
  const response = await handleTerrainStudy(request({ latitude: 53.6, longitude: 19.0, radius_km: 25, years: [2020], season: 'summer', mode: 'study' }))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.slots[0].status, 'ready')
  assert.equal(payload.slots[0].analysis_image.scene_id, 'CLEAR-STUDY')
  assert.equal(payload.slots[0].analysis_image.cloud_cover, 4)
  assert.equal(payload.slots[0].original_image.scene_id, 'CLOUDY-REFERENCE')
  assert.equal(payload.slots[0].original_image.cloud_cover, 62)
})

test('pre-Sentinel year refuses to call a cloudy scene analysis-ready and still preserves original evidence', async () => {
  installStac([
    feature({ id: 'ONLY-CLOUDY', datetime: '2010-07-15T10:00:00Z', cloud: 58 }),
  ])
  const response = await handleTerrainStudy(request({ latitude: 7.9, longitude: 49.8, radius_km: 25, years: [2010], season: 'summer', mode: 'study' }))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.slots[0].status, 'no-clear-study-image')
  assert.equal(payload.slots[0].analysis_image, null)
  assert.equal(payload.slots[0].original_image.scene_id, 'ONLY-CLOUDY')
})

test('exact UTC mode never replaces a cloudy original with a clearer scene', async () => {
  installStac([
    feature({ id: 'EXACT-CLOUDY', datetime: '2020-07-15T12:01:00Z', cloud: 83 }),
    feature({ id: 'CLEAR-LATER', datetime: '2020-07-15T18:00:00Z', cloud: 1 }),
  ])
  const response = await handleTerrainStudy(request({ latitude: 7.9, longitude: 49.8, radius_km: 25, mode: 'exact', exact_utc: '2020-07-15T12:00:00Z' }))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.cloud_filter_applied, false)
  assert.equal(payload.original_image.scene_id, 'EXACT-CLOUDY')
  assert.equal(payload.original_image.cloud_cover, 83)
})
