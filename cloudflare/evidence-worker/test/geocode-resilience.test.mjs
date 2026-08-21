import assert from 'node:assert/strict'
import test from 'node:test'

import { GEOCODE_PATH, geocodeQueryVariants, handleGeocodeProxy } from '../src/geocodeProxy.js'

const allowedOrigin = 'https://terraforming-planet.github.io'

test('Polish locality search adds useful safe fallback variants', () => {
  const variants = geocodeQueryVariants('Olszówka gmina Gardeja')
  assert.equal(variants[0], 'Olszówka gmina Gardeja')
  assert.ok(variants.some(value => value.includes('Olszówka Gardeja')))
  assert.ok(variants.some(value => value.endsWith(', Polska')))
})

test('geocode retries transient Nominatim errors and returns exact locality results', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) return new Response('busy', { status: 503 })
    return new Response(JSON.stringify([
      { display_name: 'Olszówka, gmina Gardeja, powiat kwidzyński, Polska', lat: '53.62', lon: '18.95', type: 'village', category: 'place', importance: 0.51 },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const response = await handleGeocodeProxy(new Request(`https://worker.example${GEOCODE_PATH}?q=${encodeURIComponent('Olszówka gmina Gardeja')}`, {
      headers: { Origin: allowedOrigin },
    }))
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.ok(calls >= 2)
    assert.equal(payload.results[0].type, 'village')
    assert.match(payload.results[0].display_name, /Olszówka/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
