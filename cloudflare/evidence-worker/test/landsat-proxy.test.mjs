import assert from 'node:assert/strict'
import test from 'node:test'

import { handleWorkerRequest } from '../src/entry.js'
import {
  LANDSAT_COLLECTION,
  LANDSAT_STAC_ITEMS_URL,
  buildUsGsLandsatUrl,
  handleLandsatProxy,
  parseLandsatProxyQuery,
} from '../src/landsatProxy.js'

const allowedOrigin = 'https://terraforming-planet.github.io'

function requestUrl(query = 'bbox=18.5,53.3,19.5,54&start=1990-01-01&end=1999-12-31&limit=12') {
  return `https://worker.example/research/landsat?${query}`
}

test('Landsat proxy accepts only bounded WGS84 and date inputs', () => {
  const parsed = parseLandsatProxyQuery(new URL(requestUrl()))
  assert.deepEqual(parsed, {
    bbox: [18.5, 53.3, 19.5, 54],
    start: '1990-01-01',
    end: '1999-12-31',
    limit: 12,
  })

  assert.throws(() => parseLandsatProxyQuery(new URL(requestUrl('bbox=-181,0,1,1&start=1990-01-01&end=1991-01-01'))), /WGS84/)
  assert.throws(() => parseLandsatProxyQuery(new URL(requestUrl('bbox=0,0,80,1&start=1990-01-01&end=1991-01-01'))), /too large/)
  assert.throws(() => parseLandsatProxyQuery(new URL(requestUrl('bbox=0,0,1,1&start=1992-01-01&end=1991-01-01'))), /later than end/)
  assert.throws(() => parseLandsatProxyQuery(new URL(requestUrl('bbox=0,0,1,1&start=1990-01-01&end=1991-01-01&limit=100'))), /limit/)
})

test('upstream URL is hard-coded to official USGS Landsat collection', () => {
  const url = buildUsGsLandsatUrl({
    bbox: [18.5, 53.3, 19.5, 54],
    start: '1990-01-01',
    end: '1999-12-31',
    limit: 12,
  })
  const parsed = new URL(url)
  assert.equal(parsed.origin, 'https://landsatlook.usgs.gov')
  assert.equal(parsed.pathname, `/stac-server/collections/${LANDSAT_COLLECTION}/items`)
  assert.equal(url.startsWith(LANDSAT_STAC_ITEMS_URL), true)
  assert.equal(parsed.searchParams.get('datetime'), '1990-01-01T00:00:00Z/1999-12-31T23:59:59Z')
})

test('unapproved browser origin is rejected before any upstream fetch', async () => {
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = async () => {
    called = true
    throw new Error('must not be called')
  }
  try {
    const response = await handleLandsatProxy(new Request(requestUrl(), {
      headers: { Origin: 'https://example.com' },
    }), {})
    assert.equal(response.status, 403)
    assert.equal(called, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('allowed request relays only the fixed USGS URL and returns Pages CORS', async () => {
  const originalFetch = globalThis.fetch
  let calledUrl = ''
  globalThis.fetch = async url => {
    calledUrl = String(url)
    return new Response(JSON.stringify({
      type: 'FeatureCollection',
      numberMatched: 1,
      numberReturned: 1,
      features: [{ id: 'LT05_TEST', properties: { datetime: '1995-07-01T00:00:00Z' }, assets: {} }],
    }), { status: 200, headers: { 'Content-Type': 'application/geo+json' } })
  }
  try {
    const response = await handleWorkerRequest(new Request(requestUrl(), {
      headers: { Origin: allowedOrigin },
    }), {})
    const payload = await response.json()
    const upstream = new URL(calledUrl)

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), allowedOrigin)
    assert.equal(upstream.origin, 'https://landsatlook.usgs.gov')
    assert.equal(upstream.pathname, `/stac-server/collections/${LANDSAT_COLLECTION}/items`)
    assert.equal(payload.features[0].id, 'LT05_TEST')
    assert.equal(payload.terra_source.agency, 'USGS')
    assert.equal(payload.terra_source.collection, LANDSAT_COLLECTION)
    assert.match(payload.terra_source.relayed_by, /terra-observation/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('entrypoint still delegates health to the original evidence API', async () => {
  const response = await handleWorkerRequest(new Request('https://worker.example/health'), {
    OPENAI_API_KEY: 'test-secret-not-real',
  })
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.openai_configured, true)
  assert.equal(JSON.stringify(payload).includes('test-secret-not-real'), false)
})
