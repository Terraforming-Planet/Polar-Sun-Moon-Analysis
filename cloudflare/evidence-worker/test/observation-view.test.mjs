import assert from 'node:assert/strict'
import test from 'node:test'

import {
  handleObservationView,
  MAX_VIEW_HEIGHT_KM,
  MIN_VIEW_HEIGHT_KM,
  observationFootprintRadiusKm,
  recommendedAnalysisRadiusKm,
} from '../src/observationView.js'

const origin = 'https://terraforming-planet.github.io'

function request(body) {
  return new Request('https://worker.example/research/observation-view', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('virtual observation footprint grows from local to hemisphere-scale without exceeding the horizon', () => {
  assert.equal(observationFootprintRadiusKm(MIN_VIEW_HEIGHT_KM), 1)
  const wide = observationFootprintRadiusKm(MAX_VIEW_HEIGHT_KM)
  assert.ok(wide > 8_000)
  assert.ok(wide < 9_000)
  assert.equal(recommendedAnalysisRadiusKm(MAX_VIEW_HEIGHT_KM), 500)
})

test('recent low-altitude view selects Copernicus Sentinel-2', async () => {
  const response = await handleObservationView(request({
    latitude: 53.6,
    longitude: 19.0,
    view_height_km: 20,
    date: '2026-08-20',
    cloud_mode: 'clear',
  }))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.status, 'image')
  assert.match(payload.image.source, /Sentinel-2/)
  assert.equal(payload.wide_context_only, false)
})

test('very high view switches to NASA GIBS wide imagery and labels it as context', async () => {
  const response = await handleObservationView(request({
    latitude: 7.98,
    longitude: 49.82,
    view_height_km: 25_000,
    date: '2026-08-20',
    cloud_mode: 'clear',
  }))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.status, 'image')
  assert.match(payload.image.source, /NASA GIBS/)
  assert.equal(payload.wide_context_only, true)
  assert.ok(payload.footprint_radius_km > 8_000)
  assert.equal(payload.analysis_radius_recommendation_km, 500)
})

test('rejects observation heights above 25000 km', async () => {
  const response = await handleObservationView(request({
    latitude: 0,
    longitude: 0,
    view_height_km: 25_001,
    date: '2026-08-20',
  }))
  const payload = await response.json()
  assert.equal(response.status, 400)
  assert.match(payload.error, /view_height_km/)
})
