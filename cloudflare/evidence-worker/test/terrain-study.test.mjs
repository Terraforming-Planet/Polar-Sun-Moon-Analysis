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

function installStacSequence(featureSets) {
  let call = 0
  globalThis.fetch = async url => {
    if (String(url).includes('landsatlook.usgs.gov')) {
      const features = featureSets[Math.min(call, featureSets.length - 1)]
      call += 1
      return new Response(JSON.stringify({ type: 'FeatureCollection', features }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`Unexpected fetch ${url}`)
  }
}

test.afterEach(() => { globalThis.fetch = originalFetch })

test('recent yearly study prefers Sentinel-2 L2A over an available clean Landsat scene', async () => {
  installStac([
    feature({ id: 'CLOUDY-REFERENCE', datetime: '2020-07-15T10:00:00Z', cloud: 62 }),
    feature({ id: 'CLEAR-LANDSAT', datetime: '2020-07-22T10:00:00Z', cloud: 4 }),
  ])
  const response = await handleTerrainStudy(request({ latitude: 53.6, longitude: 19.0, radius_km: 25, years: [2020], season: 'summer', mode: 'study' }))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.slots[0].status, 'ready')
  assert.match(payload.slots[0].analysis_image.source, /Sentinel-2 L2A/i)
  assert.equal(payload.slots[0].analysis_image.threshold, 10)
  assert.equal(payload.slots[0].original_image.scene_id, 'CLOUDY-REFERENCE')
  assert.equal(payload.slots[0].original_image.cloud_cover, 62)
  assert.deepEqual(payload.source_priority, [
    'Sentinel-2 L2A',
    'Landsat Collection 2 Surface Reflectance',
    'NASA GIBS/VIIRS/MODIS context fallback only',
  ])
})

test('pre-Sentinel study expands selected season, +/-30 days, then whole year', async () => {
  installStacSequence([
    [feature({ id: 'SEASON-CLOUDY', datetime: '2010-07-15T10:00:00Z', cloud: 70 })],
    [feature({ id: 'EXPANDED-CLOUDY', datetime: '2010-09-20T10:00:00Z', cloud: 45 })],
    [feature({ id: 'WHOLE-YEAR-CLEAR', datetime: '2010-11-20T10:00:00Z', cloud: 5 })],
  ])
  const response = await handleTerrainStudy(request({ latitude: 7.9, longitude: 49.8, radius_km: 25, years: [2010], season: 'summer', mode: 'study' }))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.slots[0].status, 'ready')
  assert.equal(payload.slots[0].analysis_image.scene_id, 'WHOLE-YEAR-CLEAR')
  assert.equal(payload.slots[0].analysis_image.cloud_cover, 5)
  assert.equal(payload.slots[0].search_window.stage, 'whole-year')
})

test('pre-Sentinel study uses the least-cloud yearly scene with an explicit NOT-clean warning when nothing is <=10%', async () => {
  installStac([
    feature({ id: 'CLOUDY-58', datetime: '2010-07-15T10:00:00Z', cloud: 58 }),
    feature({ id: 'CLOUDY-31', datetime: '2010-10-15T10:00:00Z', cloud: 31 }),
  ])
  const response = await handleTerrainStudy(request({ latitude: 7.9, longitude: 49.8, radius_km: 25, years: [2010], season: 'summer', mode: 'study' }))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.slots[0].status, 'ready')
  assert.equal(payload.slots[0].analysis_image.scene_id, 'CLOUDY-31')
  assert.equal(payload.slots[0].analysis_image.cloud_cover, 31)
  assert.match(payload.slots[0].standard, /NOT clean/i)
  assert.match(payload.slots[0].warning, /31\.0% cloud cover/i)
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
