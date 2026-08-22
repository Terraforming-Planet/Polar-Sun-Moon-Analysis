import { describe, expect, it } from 'vitest'

import {
  applyViewerImageEvent,
  createViewerState,
  markViewerFallbackError,
  orientRiverCandidate,
  selectMainMediumNaturalEarthRivers,
  selectMainMediumOsmRivers,
  viewerPhaseLabel,
  type RiverCandidate,
} from './terrainLabViewer'

describe('terrain imagery viewer state', () => {
  it('moves from loading to fallback imagery and never requires a blank terminal state', () => {
    let state = createViewerState('request-a')
    expect(state.phase).toBe('loading')

    state = applyViewerImageEvent(state, {
      type: 'failed',
      requestKey: 'request-a',
      candidateIndex: 0,
    }, 3)
    expect(state.phase).toBe('loading')
    expect(state.candidateIndex).toBe(1)

    state = applyViewerImageEvent(state, {
      type: 'loaded',
      requestKey: 'request-a',
      candidateIndex: 1,
    }, 3)
    expect(state.phase).toBe('fallback-ready')
    expect(state.hasImagery).toBe(true)
    expect(viewerPhaseLabel(state.phase)).toBe('FALLBACK READY')
  })

  it('falls back to the visible base layer after every imagery candidate fails', () => {
    let state = createViewerState('request-a')
    state = applyViewerImageEvent(state, {
      type: 'failed',
      requestKey: 'request-a',
      candidateIndex: 0,
    }, 1)

    expect(state.phase).toBe('fallback-ready')
    expect(state.hasImagery).toBe(false)
  })

  it('ignores stale image events from an older request', () => {
    const latest = createViewerState('request-b')
    const afterStaleFailure = applyViewerImageEvent(latest, {
      type: 'failed',
      requestKey: 'request-a',
      candidateIndex: 0,
    }, 3)

    expect(afterStaleFailure).toBe(latest)
    expect(afterStaleFailure.phase).toBe('loading')
    expect(afterStaleFailure.candidateIndex).toBe(0)
  })

  it('only reports fallback error when no imagery is already visible', () => {
    const state = createViewerState('request-a')
    expect(markViewerFallbackError(state, 'request-a').phase).toBe('error')

    const ready = applyViewerImageEvent(state, {
      type: 'loaded',
      requestKey: 'request-a',
      candidateIndex: 0,
    }, 3)
    expect(markViewerFallbackError(ready, 'request-a').phase).toBe('ready')
  })
})

describe('river selection and downstream direction', () => {
  const baseCandidate: RiverCandidate = {
    id: 'river-1',
    name: 'Test River',
    points: [
      { latitude: 50, longitude: 10 },
      { latitude: 49.5, longitude: 10.5 },
      { latitude: 49, longitude: 11 },
    ],
    lengthKm: 100,
    source: 'osm',
    sourceLabel: 'OpenStreetMap waterway=river topology',
    topologyDownstream: true,
  }

  it('keeps higher-to-lower DEM orientation and reverses uphill geometry', () => {
    const forward = orientRiverCandidate(baseCandidate, [120, 80, 40])
    expect(forward?.directionSource).toBe('dem')
    expect(forward?.points[0]).toEqual(baseCandidate.points[0])

    const reversed = orientRiverCandidate(baseCandidate, [40, 80, 120])
    expect(reversed?.directionSource).toBe('dem')
    expect(reversed?.points[0]).toEqual(baseCandidate.points[2])
  })

  it('uses existing OSM waterway topology for near-flat DEM instead of random direction', () => {
    const result = orientRiverCandidate(baseCandidate, [10, 10.2, 10.1])
    expect(result?.directionSource).toBe('topology')
    expect(result?.points).toEqual(baseCandidate.points)
  })

  it('refuses an unsupported Natural Earth direction when DEM cannot resolve it', () => {
    const naturalEarth: RiverCandidate = {
      ...baseCandidate,
      source: 'natural-earth',
      sourceLabel: 'Natural Earth 1:50m major river geometry',
      topologyDownstream: false,
    }
    expect(orientRiverCandidate(naturalEarth, [10, 10.1, 10])).toBeNull()
    expect(orientRiverCandidate(naturalEarth, [])).toBeNull()
  })

  it('selects waterway=river but excludes streams and canals', () => {
    const selected = selectMainMediumOsmRivers({
      elements: [
        {
          id: 1,
          tags: { waterway: 'river', name: 'Main River' },
          geometry: [{ lat: 50, lon: 10 }, { lat: 49.9, lon: 10.1 }],
        },
        {
          id: 2,
          tags: { waterway: 'stream', name: 'Small Stream' },
          geometry: [{ lat: 50, lon: 10 }, { lat: 49.9, lon: 10.1 }],
        },
        {
          id: 3,
          tags: { waterway: 'canal', name: 'Canal' },
          geometry: [{ lat: 50, lon: 10 }, { lat: 49.9, lon: 10.1 }],
        },
      ],
    })

    expect(selected).toHaveLength(1)
    expect(selected[0].name).toBe('Main River')
    expect(selected[0].topologyDownstream).toBe(true)
  })

  it('uses only main/medium Natural Earth ranks that intersect the AOI', () => {
    const selected = selectMainMediumNaturalEarthRivers({
      features: [
        {
          id: 'major',
          properties: { scalerank: 3, name: 'Major River' },
          geometry: { type: 'LineString', coordinates: [[10, 50], [11, 49]] },
        },
        {
          id: 'minor',
          properties: { scalerank: 9, name: 'Minor River' },
          geometry: { type: 'LineString', coordinates: [[10, 50], [11, 49]] },
        },
      ],
    }, {
      west: 9,
      south: 48,
      east: 12,
      north: 51,
    })

    expect(selected).toHaveLength(1)
    expect(selected[0].name).toBe('Major River')
  })
})
