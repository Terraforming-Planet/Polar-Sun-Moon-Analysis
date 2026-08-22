import { describe, expect, it } from 'vitest'

import {
  SATELLITE_ARCHIVE_START,
  defaultSatelliteTimeSelection,
  requestedSatelliteDateTimeUtc,
  seasonReferenceDate,
  selectionForPreset,
} from './satelliteTimeSelection'

describe('satellite time selection', () => {
  it('defaults to the last five calendar years', () => {
    const selection = defaultSatelliteTimeSelection()
    expect(selection.preset).toBe('five-years')
    expect(selection.endYear - selection.startYear + 1).toBe(5)
  })

  it('starts the full comparable land archive at Landsat 1', () => {
    const selection = selectionForPreset('archive')
    expect(selection.startDate).toBe(SATELLITE_ARCHIVE_START)
    expect(selection.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('provides the requested quick historical ranges', () => {
    expect(selectionForPreset('from-1990').startDate).toBe('1990-01-01')
    expect(selectionForPreset('from-2015').startDate).toBe('2015-01-01')
  })

  it('makes the twenty-year preset exactly twenty calendar years', () => {
    const twenty = selectionForPreset('twenty-years')
    expect(twenty.endYear - twenty.startYear + 1).toBe(20)
    expect(twenty.startDate).toBe(`${twenty.startYear}-01-01`)
  })

  it('makes the five-year preset exactly five calendar years and one-year exactly one calendar year', () => {
    const five = selectionForPreset('five-years')
    const one = selectionForPreset('one-year')
    expect(five.endYear - five.startYear + 1).toBe(5)
    expect(five.startDate).toBe(`${five.startYear}-01-01`)
    expect(one.endYear - one.startYear + 1).toBe(1)
    expect(one.startDate).toBe(`${one.startYear}-01-01`)
  })

  it('clamps custom ranges to the supported archive and today', () => {
    const selection = selectionForPreset('custom', {
      preset: 'custom',
      startDate: '1900-01-01',
      endDate: '2999-12-31',
      exactDate: '1900-01-01',
      exactTimeUtc: '09:30',
      season: 'summer',
      startYear: 1900,
      endYear: 2999,
    })
    expect(selection.startDate).toBe(SATELLITE_ARCHIVE_START)
    expect(selection.endDate).not.toBe('2999-12-31')
  })

  it('builds an exact UTC timestamp only in exact mode', () => {
    const selection = selectionForPreset('exact', {
      preset: 'exact',
      startDate: '2026-08-20',
      endDate: '2026-08-20',
      exactDate: '2026-08-20',
      exactTimeUtc: '14:45',
      season: 'summer',
      startYear: 2026,
      endYear: 2026,
    })
    expect(requestedSatelliteDateTimeUtc(selection)).toBe('2026-08-20T14:45:00Z')
    expect(requestedSatelliteDateTimeUtc(selectionForPreset('from-2015', selection))).toBeNull()
  })

  it('uses only years and one matched season in seasonal mode', () => {
    const selection = selectionForPreset('seasonal', {
      preset: 'seasonal',
      startDate: '1990-01-01',
      endDate: '2020-12-31',
      exactDate: '2020-08-01',
      exactTimeUtc: '12:00',
      season: 'summer',
      startYear: 1990,
      endYear: 2020,
    })
    expect(selection.preset).toBe('seasonal')
    expect(selection.startYear).toBe(1990)
    expect(selection.endYear).toBe(2020)
    expect(selection.startDate).toBe(seasonReferenceDate(1990, 'summer'))
    expect(selection.endDate).toBe(seasonReferenceDate(2020, 'summer'))
    expect(selection.startDate.endsWith('-07-15')).toBe(true)
    expect(selection.endDate.endsWith('-07-15')).toBe(true)
    expect(requestedSatelliteDateTimeUtc(selection)).toBeNull()
  })
})
