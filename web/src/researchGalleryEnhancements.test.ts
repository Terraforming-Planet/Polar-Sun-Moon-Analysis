import { describe, expect, it } from 'vitest'

import { buildStoredZip, yearsForResearchSelection } from './researchGalleryEnhancements'
import type { SatelliteTimeSelection } from './satelliteTimeSelection'

describe('research gallery export', () => {
  it('builds a valid stored ZIP with central directory and payload names', () => {
    const encoder = new TextEncoder()
    const zip = buildStoredZip([
      { name: 'manifest.json', data: encoder.encode('{"ok":true}') },
      { name: 'sources.txt', data: encoder.encode('NASA\nUSGS') },
    ])
    const bytes = [...zip]
    expect(bytes.slice(0, 4)).toEqual([0x50, 0x4b, 0x03, 0x04])
    const text = new TextDecoder().decode(zip)
    expect(text).toContain('manifest.json')
    expect(text).toContain('sources.txt')
    expect(bytes.slice(-22, -18)).toEqual([0x50, 0x4b, 0x05, 0x06])
  })

  it('requests one yearly slot for every selected year instead of sampling the range', () => {
    const selection: SatelliteTimeSelection = {
      preset: 'seasonal',
      startDate: '2001-07-15',
      endDate: '2020-07-15',
      exactDate: '2020-07-15',
      exactTimeUtc: '12:00',
      season: 'summer',
      startYear: 2001,
      endYear: 2020,
    }
    const years = yearsForResearchSelection(selection)
    expect(years).toHaveLength(20)
    expect(years[0]).toBe(2001)
    expect(years.at(-1)).toBe(2020)
    expect(new Set(years).size).toBe(20)
  })
})
