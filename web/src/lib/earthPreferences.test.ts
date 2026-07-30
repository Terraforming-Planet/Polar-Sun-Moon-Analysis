import { describe, expect, it } from 'vitest'
import { EARTH_MODEL_STORAGE_KEY, readEarthModel, writeEarthModel } from './earthPreferences'

describe('Earth model preference', () => {
  it('defaults to the scientific model', () => {
    expect(readEarthModel({ getItem: () => null })).toBe('scientific')
  })

  it('reads both supported values', () => {
    expect(readEarthModel({ getItem: () => 'legacy' })).toBe('legacy')
    expect(readEarthModel({ getItem: () => 'scientific' })).toBe('scientific')
  })

  it('ignores unsupported values', () => {
    expect(readEarthModel({ getItem: () => 'mercator' })).toBe('scientific')
  })

  it('writes the selected model under a stable key', () => {
    const writes: Array<[string, string]> = []
    writeEarthModel('legacy', { setItem: (key, value) => { writes.push([key, value]) } })
    expect(writes).toEqual([[EARTH_MODEL_STORAGE_KEY, 'legacy']])
  })

  it('falls back safely when storage throws', () => {
    expect(readEarthModel({ getItem: () => { throw new Error('blocked') } })).toBe('scientific')
    expect(() => writeEarthModel('scientific', { setItem: () => { throw new Error('blocked') } })).not.toThrow()
  })
})
